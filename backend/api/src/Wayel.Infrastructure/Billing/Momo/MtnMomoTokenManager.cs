using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Time;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Issues and caches OAuth bearer tokens for the two MoMo products (Collections / Disbursements).
/// Concurrent callers awaiting a refresh share the same in-flight request — preventing the duplicate
/// token-mint that MTN rate-limits and that the Dart reference port calls out as a footgun.
/// </summary>
internal sealed class MtnMomoTokenManager(
    IOptions<MtnMomoOptions> options,
    MtnMomoRuntimeCredentials credentials,
    IHttpClientFactory httpClientFactory,
    IClock clock,
    ILogger<MtnMomoTokenManager> logger) : IDisposable
{
    public enum Product
    {
        Collection,
        Disbursement,
    }

    private readonly MtnMomoOptions _opts = options.Value;
    private readonly SemaphoreSlim _collectionGate = new(1, 1);
    private readonly SemaphoreSlim _disbursementGate = new(1, 1);

    private CachedToken? _collectionToken;
    private CachedToken? _disbursementToken;

    public void Dispose()
    {
        _collectionGate.Dispose();
        _disbursementGate.Dispose();
    }

    public async Task<string> GetAccessTokenAsync(Product product, CancellationToken cancellationToken = default)
    {
        var (gate, current) = product switch
        {
            Product.Collection => (_collectionGate, _collectionToken),
            Product.Disbursement => (_disbursementGate, _disbursementToken),
            _ => throw new ArgumentOutOfRangeException(nameof(product)),
        };

        if (current is not null && current.ExpiresAtUtc > clock.UtcNow.AddMinutes(1))
        {
            return current.AccessToken;
        }

        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            current = product == Product.Collection ? _collectionToken : _disbursementToken;
            if (current is not null && current.ExpiresAtUtc > clock.UtcNow.AddMinutes(1))
            {
                return current.AccessToken;
            }

            var fresh = await MintTokenAsync(product, cancellationToken).ConfigureAwait(false);
            if (product == Product.Collection)
            {
                _collectionToken = fresh;
            }
            else
            {
                _disbursementToken = fresh;
            }
            return fresh.AccessToken;
        }
        finally
        {
            gate.Release();
        }
    }

    public string ResolveSubscriptionKey(Product product) => product switch
    {
        Product.Collection => _opts.SubscriptionKey,
        Product.Disbursement => _opts.DisbursementsSubscriptionKey,
        _ => throw new ArgumentOutOfRangeException(nameof(product)),
    };

    private async Task<CachedToken> MintTokenAsync(Product product, CancellationToken cancellationToken)
    {
        var subscriptionKey = ResolveSubscriptionKey(product);
        if (string.IsNullOrWhiteSpace(subscriptionKey))
        {
            throw new MtnMomoAuthException(
                $"{product} subscription key is not configured.",
                $"Set Billing:MtnMomo:{(product == Product.Collection ? nameof(MtnMomoOptions.SubscriptionKey) : nameof(MtnMomoOptions.DisbursementsSubscriptionKey))}.");
        }

        var (apiUser, apiKey) = credentials.Current;
        if (string.IsNullOrWhiteSpace(apiUser) || string.IsNullOrWhiteSpace(apiKey))
        {
            throw new MtnMomoAuthException(
                "MoMo API user / key is not configured.",
                "Provision the sandbox API user or supply Billing:MtnMomo:ApiUser + ApiKey from MTN's production credentials.");
        }

        var basic = Convert.ToBase64String(Encoding.ASCII.GetBytes($"{apiUser}:{apiKey}"));
        var path = product == Product.Collection ? "/collection/token/" : "/disbursement/token/";

        using var client = CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        request.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);
        request.Content = new ByteArrayContent([]);

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new MtnMomoNetworkException($"Unable to reach MoMo token endpoint ({path}).", ex);
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using (response)
        {
            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                throw new MtnMomoAuthException(
                    "MoMo rejected the API user / key.",
                    Truncate(body, 256));
            }
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("MoMo token mint failed ({Status}): {Body}", (int)response.StatusCode, Truncate(body, 256));
                throw new MtnMomoServerException(
                    $"MoMo token mint failed ({(int)response.StatusCode}).");
            }
        }

        TokenResponse? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<TokenResponse>(body, MtnMomoJson.Options);
        }
        catch (JsonException ex)
        {
            throw new MtnMomoServerException($"MoMo token response was not valid JSON: {ex.Message}");
        }

        if (parsed is null || string.IsNullOrWhiteSpace(parsed.AccessToken))
        {
            throw new MtnMomoServerException("MoMo token response did not contain an access_token.");
        }

        var lifetime = parsed.ExpiresIn > 0
            ? TimeSpan.FromSeconds(parsed.ExpiresIn).Subtract(TimeSpan.FromMinutes(2))
            : _opts.TokenLifetime;
        if (lifetime <= TimeSpan.Zero)
        {
            lifetime = _opts.TokenLifetime;
        }

        return new CachedToken(parsed.AccessToken.Trim(), clock.UtcNow.Add(lifetime));
    }

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient(nameof(MtnMomoTokenManager));
        client.BaseAddress = new Uri(_opts.BaseUrl.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    private static string Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value ?? string.Empty : value[..max];

    private sealed record CachedToken(string AccessToken, DateTime ExpiresAtUtc);

    private sealed class TokenResponse
    {
        [JsonPropertyName("access_token")]
        public string? AccessToken { get; init; }

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; init; }

        [JsonPropertyName("token_type")]
        public string? TokenType { get; init; }
    }
}

internal static class MtnMomoJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
