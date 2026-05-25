using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Provisioning helper for the MoMo sandbox. In sandbox each consumer must
/// (a) create an API user with a callback host, then (b) generate an API key for that user.
/// In production these are issued by MTN's commercial onboarding team and supplied via config.
/// </summary>
internal sealed class MtnMomoSandboxProvisioner(
    IHttpClientFactory httpClientFactory,
    IOptions<MtnMomoOptions> options,
    ILogger<MtnMomoSandboxProvisioner> logger)
{
    private readonly MtnMomoOptions _opts = options.Value;

    /// <summary>Creates an API user and API key in the sandbox. Returns the new credentials.</summary>
    public async Task<MtnMomoSandboxCredentials> ProvisionAsync(
        string subscriptionKey,
        Uri callbackHost,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subscriptionKey))
        {
            throw new MtnMomoAuthException("Subscription key is required to provision a sandbox user.");
        }

        var apiUser = Guid.NewGuid().ToString();
        using var client = CreateClient(subscriptionKey);

        // 1. Create API user.
        using (var request = new HttpRequestMessage(HttpMethod.Post, "v1_0/apiuser"))
        {
            request.Headers.Add("X-Reference-Id", apiUser);
            request.Content = JsonContent.Create(
                new SandboxCreateUserRequest(callbackHost.Host),
                options: MtnMomoJson.Options);
            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        }

        // 2. Allow the sandbox DB to propagate.
        await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);

        // 3. Request API key.
        string apiKey;
        using (var response = await client.PostAsync(
            $"v1_0/apiuser/{Uri.EscapeDataString(apiUser)}/apikey",
            content: null,
            cancellationToken).ConfigureAwait(false))
        {
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadFromJsonAsync<SandboxApiKeyResponse>(
                MtnMomoJson.Options,
                cancellationToken).ConfigureAwait(false);
            if (body is null || string.IsNullOrWhiteSpace(body.ApiKey))
            {
                throw new MtnMomoServerException("MoMo sandbox apikey response missing api_key.");
            }
            apiKey = body.ApiKey.Trim();
        }

        logger.LogInformation(
            "Provisioned MoMo sandbox credentials. ApiUser={ApiUser} CallbackHost={CallbackHost}",
            apiUser,
            callbackHost.Host);

        return new MtnMomoSandboxCredentials(apiUser, apiKey);
    }

    private HttpClient CreateClient(string subscriptionKey)
    {
        var client = httpClientFactory.CreateClient(nameof(MtnMomoSandboxProvisioner));
        client.BaseAddress = new Uri(_opts.BaseUrl.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", subscriptionKey);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    private sealed record SandboxCreateUserRequest(
        [property: JsonPropertyName("providerCallbackHost")] string ProviderCallbackHost);

    private sealed class SandboxApiKeyResponse
    {
        [JsonPropertyName("apiKey")]
        public string? ApiKey { get; init; }
    }
}

public sealed record MtnMomoSandboxCredentials(string ApiUser, string ApiKey);
