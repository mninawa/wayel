using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Billing.Momo;

internal static class MtnMomoHttpHelpers
{
    public static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        var envelope = TryParseEnvelope(raw);

        throw response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => new MtnMomoAuthException(
                envelope?.Message ?? "MoMo returned 401 Unauthorized.",
                envelope?.Code),
            HttpStatusCode.Forbidden => new MtnMomoForbiddenException(
                envelope?.Message ?? "MoMo returned 403 Forbidden — verify the source IP is whitelisted."),
            HttpStatusCode.NotFound => new MtnMomoNotFoundException(
                envelope?.Message ?? "MoMo resource not found (404)."),
            HttpStatusCode.Conflict => new MtnMomoConflictException(
                envelope?.Message ?? "MoMo reference ID already exists (409)."),
            HttpStatusCode.BadRequest when envelope is { Code: not null } =>
                new MtnMomoTransactionException(
                    MtnMomoErrorCodes.From(envelope.Code),
                    envelope.Message ?? MtnMomoErrorCodes.Describe(MtnMomoErrorCodes.From(envelope.Code)),
                    envelope.Code),
            HttpStatusCode.InternalServerError or HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable
                => new MtnMomoServerException(envelope?.Message ?? $"MoMo server error ({(int)response.StatusCode})."),
            _ => new MtnMomoServerException(
                envelope?.Message ?? $"MoMo request failed ({(int)response.StatusCode}): {Truncate(raw, 256)}"),
        };
    }

    public static HttpClient BuildProductClient(
        IHttpClientFactory factory,
        IOptions<MtnMomoOptions> options,
        string clientName,
        string subscriptionKey,
        string accessToken)
    {
        var opts = options.Value;
        var client = factory.CreateClient(clientName);
        client.BaseAddress = new Uri(opts.BaseUrl.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        client.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", subscriptionKey);
        client.DefaultRequestHeaders.Add("X-Target-Environment", opts.TargetEnvironment);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    public static string NormaliseMsisdn(string raw)
    {
        var trimmed = (raw ?? string.Empty).Trim();
        if (trimmed.StartsWith('+'))
        {
            trimmed = trimmed[1..];
        }
        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (string.IsNullOrEmpty(digits))
        {
            throw new ArgumentException("MSISDN must contain digits.", nameof(raw));
        }
        return digits;
    }

    private static MomoErrorEnvelope? TryParseEnvelope(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        try
        {
            return JsonSerializer.Deserialize<MomoErrorEnvelope>(raw, MtnMomoJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value ?? string.Empty : value[..max];
}
