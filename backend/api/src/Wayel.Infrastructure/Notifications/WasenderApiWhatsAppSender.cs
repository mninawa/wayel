using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Notifications;

namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Sends WhatsApp messages via
/// <a href="https://wasenderapi.com/api-docs/messages/send-text-message">WasenderAPI</a>.
/// </summary>
internal sealed class WasenderApiWhatsAppSender(
    HttpClient http,
    IOptions<NotificationWaSenderOptions> options,
    ILogger<WasenderApiWhatsAppSender> logger) : IWhatsAppSender
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public Task<WhatsAppSendResult> SendTextAsync(
        WhatsAppTextMessage message,
        CancellationToken cancellationToken = default) =>
        SendAsync(
            message.ToPhoneE164,
            message.Body,
            imageUrl: null,
            message.CorrelationTag,
            message.BypassAllowlist,
            cancellationToken);

    public Task<WhatsAppSendResult> SendImageAsync(
        WhatsAppImageMessage message,
        CancellationToken cancellationToken = default) =>
        SendAsync(
            message.ToPhoneE164,
            message.Caption,
            message.ImageUrl,
            message.CorrelationTag,
            message.BypassAllowlist,
            cancellationToken);

    private async Task<WhatsAppSendResult> SendAsync(
        string rawPhone,
        string? text,
        string? imageUrl,
        string? correlationTag,
        bool bypassAllowlist,
        CancellationToken cancellationToken)
    {
        var cfg = options.Value;
        if (!cfg.Enabled)
        {
            var previewPhone = WhatsAppPhoneNormalizer.ToE164(rawPhone) ?? rawPhone;
            logger.LogInformation(
                "WhatsApp disabled — would send to {Phone} [{Correlation}]:\n{Body}",
                previewPhone,
                correlationTag ?? "—",
                string.IsNullOrWhiteSpace(imageUrl) ? text : $"{text}\n[image: {imageUrl}]");
            return WhatsAppSendResult.Success("logging-stub");
        }

        if (string.IsNullOrWhiteSpace(cfg.ApiKey))
        {
            logger.LogWarning("WasenderAPI enabled but ApiKey is missing.");
            return WhatsAppSendResult.Failure("wasender.misconfigured", "WasenderAPI key is not configured.");
        }

        var to = WhatsAppPhoneNormalizer.ToE164(rawPhone);
        if (to is null)
        {
            return WhatsAppSendResult.Failure("wasender.invalid_phone", "Recipient phone is not a valid number.");
        }

        if (!bypassAllowlist
            && cfg.Allowlist.Count > 0
            && !cfg.Allowlist.Any(a => string.Equals(
                WhatsAppPhoneNormalizer.ToE164(a),
                to,
                StringComparison.OrdinalIgnoreCase)))
        {
            logger.LogWarning(
                "WasenderAPI allowlist blocked send to {Phone} (correlation={Correlation}).",
                to,
                correlationTag);
            return WhatsAppSendResult.Failure("wasender.allowlist", "Recipient is not on the Wasender allowlist.");
        }

        var baseUrl = (cfg.BaseUrl ?? "https://www.wasenderapi.com").TrimEnd('/');
        var requestUri = $"{baseUrl}/api/send-message";
        using var req = new HttpRequestMessage(HttpMethod.Post, requestUri);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ApiKey);
        req.Content = JsonContent.Create(new WasenderSendRequest(to, text, imageUrl));

        try
        {
            using var response = await http.SendAsync(req, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "WasenderAPI send failed ({Status}) correlation={Correlation} body={Body}",
                    (int)response.StatusCode,
                    correlationTag,
                    Truncate(body, 500));
                return WhatsAppSendResult.Failure(
                    $"wasender.http_{(int)response.StatusCode}",
                    Truncate(body, 200) ?? response.ReasonPhrase ?? "Send failed.");
            }

            var parsed = JsonSerializer.Deserialize<WasenderSendResponse>(body, JsonOpts);
            if (parsed?.Success == true)
            {
                var msgId = parsed.Data?.MsgId?.ToString(CultureInfo.InvariantCulture) ?? "ok";
                logger.LogInformation(
                    "WasenderAPI message queued msgId={MsgId} correlation={Correlation}",
                    msgId,
                    correlationTag);
                return WhatsAppSendResult.Success(msgId);
            }

            logger.LogWarning(
                "WasenderAPI returned success HTTP but failure payload correlation={Correlation} body={Body}",
                correlationTag,
                Truncate(body, 500));
            return WhatsAppSendResult.Failure("wasender.rejected", parsed?.Message ?? "Provider rejected the message.");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogError(ex, "WasenderAPI network error correlation={Correlation}", correlationTag);
            return WhatsAppSendResult.Failure("wasender.network", ex.Message);
        }
    }

    private static string? Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value : value[..max];

    private sealed record WasenderSendRequest(
        string To,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Text,
        [property: JsonPropertyName("imageUrl")]
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ImageUrl);

    private sealed class WasenderSendResponse
    {
        public bool Success { get; init; }
        public string? Message { get; init; }
        public WasenderSendData? Data { get; init; }
    }

    private sealed class WasenderSendData
    {
        public long? MsgId { get; init; }
        public string? Jid { get; init; }
        public string? Status { get; init; }
    }
}
