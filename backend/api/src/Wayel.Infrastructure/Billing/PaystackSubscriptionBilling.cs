using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing;

internal sealed class PaystackSubscriptionBilling(
    IOptions<PaystackOptions> options,
    IHttpClientFactory httpClientFactory) : IPaystackSubscriptionBilling
{
    private readonly PaystackOptions _opts = options.Value;

    public bool SubscriptionsEnabled => _opts.Enabled && _opts.SubscriptionsEnabled && IsConfigured;

    private bool IsConfigured => !string.IsNullOrWhiteSpace(_opts.SecretKey);

    public async Task<string> EnsurePlanAsync(
        string name,
        int durationMonths,
        int amountMinorUnits,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var payload = new
        {
            name = name.Trim(),
            interval = MapInterval(durationMonths),
            amount = amountMinorUnits,
            currency = _opts.Currency,
        };

        using var client = CreateClient();
        using var response = await client.PostAsJsonAsync("plan", payload, PaystackJson.Options, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<PlanData>>(PaystackJson.Options, cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Status != true || string.IsNullOrWhiteSpace(body.Data?.PlanCode))
        {
            throw new InvalidOperationException(
                body?.Message ?? $"Paystack create plan failed ({(int)response.StatusCode}).");
        }

        return body.Data.PlanCode.Trim();
    }

    public async Task<IReadOnlyList<PaystackPlanSummary>> ListPlansAsync(CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var results = new List<PaystackPlanSummary>();
        var page = 1;
        const int perPage = 100;

        using var client = CreateClient();
        while (true)
        {
            using var response = await client.GetAsync($"plan?page={page}&perPage={perPage}", cancellationToken);
            var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<List<PlanListData>>>(
                PaystackJson.Options,
                cancellationToken);

            if (!response.IsSuccessStatusCode || body?.Data is null)
            {
                break;
            }

            foreach (var item in body.Data)
            {
                if (string.IsNullOrWhiteSpace(item.PlanCode))
                {
                    continue;
                }

                results.Add(new PaystackPlanSummary(
                    item.PlanCode.Trim(),
                    item.Name ?? string.Empty,
                    item.Amount,
                    item.Interval ?? string.Empty,
                    item.IsActive ?? true));
            }

            if (body.Data.Count < perPage)
            {
                break;
            }

            page++;
        }

        return results;
    }

    public async Task<string?> ResolvePlanCodeAsync(
        int durationMonths,
        int amountMinorUnits,
        string preferredName,
        string? existingPlanCode = null,
        CancellationToken cancellationToken = default)
    {
        var interval = MapInterval(durationMonths);
        var paystackPlans = await ListPlansAsync(cancellationToken);
        var matches = paystackPlans
            .Where(p =>
                p.AmountMinorUnits == amountMinorUnits
                && string.Equals(p.Interval, interval, StringComparison.OrdinalIgnoreCase)
                && p.IsActive)
            .ToList();

        if (matches.Count == 0)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(existingPlanCode))
        {
            var existing = matches.FirstOrDefault(p =>
                string.Equals(p.PlanCode, existingPlanCode.Trim(), StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                return existing.PlanCode;
            }
        }

        var preferred = preferredName.Trim();
        var exactName = matches.FirstOrDefault(p =>
            string.Equals(p.Name, preferred, StringComparison.OrdinalIgnoreCase));
        if (exactName is not null)
        {
            return exactName.PlanCode;
        }

        var containsName = matches.FirstOrDefault(p =>
            p.Name.Contains(preferred, StringComparison.OrdinalIgnoreCase)
            || preferred.Contains(p.Name, StringComparison.OrdinalIgnoreCase));
        if (containsName is not null)
        {
            return containsName.PlanCode;
        }

        return matches[0].PlanCode;
    }

    public async Task<PaystackSubscriptionLink?> ResolveSubscriptionForCustomerAsync(
        string customerEmail,
        string paystackPlanCode,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var customerCode = await FetchCustomerCodeAsync(customerEmail, cancellationToken);
        if (customerCode is null)
        {
            return null;
        }

        using var client = CreateClient();
        using var response = await client.GetAsync(
            $"subscription?customer={Uri.EscapeDataString(customerCode)}&plan={Uri.EscapeDataString(paystackPlanCode)}",
            cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<List<SubscriptionData>>>(
            PaystackJson.Options,
            cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Data is null)
        {
            return null;
        }

        var active = body.Data
            .FirstOrDefault(s =>
                string.Equals(s.Status, "active", StringComparison.OrdinalIgnoreCase)
                || string.Equals(s.Status, "non-renewing", StringComparison.OrdinalIgnoreCase));

        return active?.SubscriptionCode is null
            ? null
            : new PaystackSubscriptionLink(active.SubscriptionCode.Trim(), customerCode, active.Status ?? "active");
    }

    public async Task DisableSubscriptionAsync(string subscriptionCode, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        using var client = CreateClient();
        using var fetch = await client.GetAsync(
            $"subscription/{Uri.EscapeDataString(subscriptionCode.Trim())}",
            cancellationToken);
        var detail = await fetch.Content.ReadFromJsonAsync<PaystackEnvelope<SubscriptionDetailData>>(
            PaystackJson.Options,
            cancellationToken);

        if (!fetch.IsSuccessStatusCode
            || detail?.Data?.EmailToken is null
            || string.IsNullOrWhiteSpace(detail.Data.SubscriptionCode))
        {
            throw new InvalidOperationException(
                detail?.Message ?? $"Paystack fetch subscription failed ({(int)fetch.StatusCode}).");
        }

        var payload = new
        {
            code = detail.Data.SubscriptionCode.Trim(),
            token = detail.Data.EmailToken.Trim(),
        };

        using var response = await client.PostAsJsonAsync("subscription/disable", payload, PaystackJson.Options, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<object>>(
            PaystackJson.Options,
            cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Status != true)
        {
            throw new InvalidOperationException(
                body?.Message ?? $"Paystack disable subscription failed ({(int)response.StatusCode}).");
        }
    }

    public bool TryParseWebhook(string rawBody, string? signatureHeader, out PaystackWebhookEvent? webhookEvent)
    {
        webhookEvent = null;
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(_opts.WebhookSecret))
        {
            if (string.IsNullOrWhiteSpace(signatureHeader)
                || !VerifySignature(rawBody, signatureHeader, _opts.WebhookSecret))
            {
                return false;
            }
        }

        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            var root = doc.RootElement;
            var eventType = root.TryGetProperty("event", out var ev) ? ev.GetString() : null;
            if (string.IsNullOrWhiteSpace(eventType))
            {
                return false;
            }

            if (!root.TryGetProperty("data", out var data))
            {
                return false;
            }

            var reference = data.TryGetProperty("reference", out var r) ? r.GetString() : null;
            var amount = data.TryGetProperty("amount", out var a) && a.TryGetInt32(out var amt) ? amt : 0;
            var currency = data.TryGetProperty("currency", out var c) ? c.GetString() : null;
            var email = data.TryGetProperty("customer", out var cust) && cust.TryGetProperty("email", out var em)
                ? em.GetString()
                : data.TryGetProperty("email", out var directEmail)
                    ? directEmail.GetString()
                    : null;

            string? subscriptionCode = null;
            if (data.TryGetProperty("subscription", out var subEl))
            {
                if (subEl.ValueKind == JsonValueKind.Object
                    && subEl.TryGetProperty("subscription_code", out var sc))
                {
                    subscriptionCode = sc.GetString();
                }
                else if (subEl.ValueKind == JsonValueKind.String)
                {
                    subscriptionCode = subEl.GetString();
                }
            }

            if (subscriptionCode is null
                && data.TryGetProperty("subscription_code", out var subCodeEl))
            {
                subscriptionCode = subCodeEl.GetString();
            }

            var metadata = ParseMetadata(data);

            webhookEvent = new PaystackWebhookEvent(
                eventType,
                reference,
                amount,
                currency,
                subscriptionCode,
                email,
                metadata);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task<string?> FetchCustomerCodeAsync(string email, CancellationToken cancellationToken)
    {
        using var client = CreateClient();
        using var response = await client.GetAsync(
            $"customer/{Uri.EscapeDataString(email.Trim())}",
            cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<CustomerData>>(
            PaystackJson.Options,
            cancellationToken);

        if (response.IsSuccessStatusCode && !string.IsNullOrWhiteSpace(body?.Data?.CustomerCode))
        {
            return body.Data.CustomerCode.Trim();
        }

        return null;
    }

    private static Dictionary<string, string> ParseMetadata(JsonElement data)
    {
        if (!data.TryGetProperty("metadata", out var meta) || meta.ValueKind != JsonValueKind.Object)
        {
            return new Dictionary<string, string>();
        }

        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in meta.EnumerateObject())
        {
            dict[prop.Name] = prop.Value.ValueKind switch
            {
                JsonValueKind.String => prop.Value.GetString() ?? string.Empty,
                JsonValueKind.Number => prop.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => prop.Value.GetRawText(),
            };
        }

        return dict;
    }

    private static bool VerifySignature(string payload, string signatureHeader, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        var hash = HMACSHA512.HashData(keyBytes, payloadBytes);
        var computed = Convert.ToHexString(hash).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computed),
            Encoding.UTF8.GetBytes(signatureHeader.Trim().ToLowerInvariant()));
    }

    internal static string MapInterval(int durationMonths) =>
        durationMonths switch
        {
            1 => "monthly",
            3 => "quarterly",
            6 => "biannually",
            12 => "annually",
            _ => throw new InvalidOperationException(
                $"Duration {durationMonths} month(s) has no Paystack interval mapping."),
        };

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "Paystack is not configured. Set Billing:Paystack:SecretKey.");
        }
    }

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient(nameof(PaystackPaymentGateway));
        client.BaseAddress = new Uri(_opts.ApiBaseUrl.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _opts.SecretKey);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    private sealed class PlanData
    {
        [JsonPropertyName("plan_code")]
        public string? PlanCode { get; init; }
    }

    private sealed class PlanListData
    {
        [JsonPropertyName("plan_code")]
        public string? PlanCode { get; init; }

        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("amount")]
        public int Amount { get; init; }

        [JsonPropertyName("interval")]
        public string? Interval { get; init; }

        [JsonPropertyName("is_active")]
        public bool? IsActive { get; init; }
    }

    private sealed class CustomerData
    {
        [JsonPropertyName("customer_code")]
        public string? CustomerCode { get; init; }
    }

    private sealed class SubscriptionData
    {
        [JsonPropertyName("subscription_code")]
        public string? SubscriptionCode { get; init; }

        [JsonPropertyName("status")]
        public string? Status { get; init; }
    }

    private sealed class SubscriptionDetailData
    {
        [JsonPropertyName("subscription_code")]
        public string? SubscriptionCode { get; init; }

        [JsonPropertyName("email_token")]
        public string? EmailToken { get; init; }
    }

    private sealed class PaystackEnvelope<T>
    {
        [JsonPropertyName("status")]
        public bool Status { get; init; }

        [JsonPropertyName("message")]
        public string? Message { get; init; }

        [JsonPropertyName("data")]
        public T? Data { get; init; }
    }
}
