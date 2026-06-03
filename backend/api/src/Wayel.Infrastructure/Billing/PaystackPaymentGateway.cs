using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing;

internal sealed class PaystackPaymentGateway(
    IOptions<PaystackOptions> options,
    IHttpClientFactory httpClientFactory) : IPaymentGateway
{
    private readonly PaystackOptions _opts = options.Value;

    public string ProviderName => PaymentProviders.Paystack;
    public string DisplayName => "Card / EFT (Paystack)";

    public bool IsConfigured =>
        _opts.Enabled && !string.IsNullOrWhiteSpace(_opts.SecretKey);

    public string? PublicKey =>
        string.IsNullOrWhiteSpace(_opts.PublicKey) ? null : _opts.PublicKey.Trim();

    public async Task<PaymentInitializeResult> InitializeChargeAsync(
        PaymentInitializeRequest request,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        object payload = string.IsNullOrWhiteSpace(request.PaystackPlanCode)
            ? new
            {
                email = request.Email,
                amount = request.AmountMinorUnits,
                reference = request.Reference,
                currency = _opts.Currency,
                callback_url = request.CallbackUrl,
                metadata = request.Metadata,
            }
            : new
            {
                email = request.Email,
                amount = request.AmountMinorUnits,
                reference = request.Reference,
                currency = _opts.Currency,
                callback_url = request.CallbackUrl,
                metadata = request.Metadata,
                plan = request.PaystackPlanCode.Trim(),
            };

        using var client = CreateClient();
        using var response = await client.PostAsJsonAsync("transaction/initialize", payload, PaystackJson.Options, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<InitializeData>>(
            PaystackJson.Options,
            cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Status != true || body.Data is null)
        {
            throw new InvalidOperationException(
                body?.Message ?? $"Paystack initialize failed ({(int)response.StatusCode}).");
        }

        return new PaymentInitializeResult(
            body.Data.Reference ?? request.Reference,
            body.Data.AuthorizationUrl ?? string.Empty,
            body.Data.AccessCode ?? string.Empty);
    }

    public async Task<PaymentVerifyResult> VerifyChargeAsync(
        string reference,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        using var client = CreateClient();
        using var response = await client.GetAsync(
            $"transaction/verify/{Uri.EscapeDataString(reference)}",
            cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<VerifyData>>(
            PaystackJson.Options,
            cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Status != true || body.Data is null)
        {
            throw new InvalidOperationException(
                body?.Message ?? $"Paystack verify failed ({(int)response.StatusCode}).");
        }

        return new PaymentVerifyResult(
            body.Data.Reference ?? reference,
            body.Data.Status ?? "failed",
            body.Data.Amount,
            body.Data.Currency ?? _opts.Currency,
            MapAuthorization(body.Data.Authorization),
            body.Data.SubscriptionCode,
            body.Data.Customer?.CustomerCode);
    }

    public async Task RefundChargeAsync(string reference, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        var payload = new { transaction = reference };
        using var client = CreateClient();
        using var response = await client.PostAsJsonAsync("refund", payload, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<PaystackEnvelope<object>>(
            PaystackJson.Options,
            cancellationToken);

        if (!response.IsSuccessStatusCode || body?.Status != true)
        {
            throw new InvalidOperationException(
                body?.Message ?? $"Paystack refund failed ({(int)response.StatusCode}).");
        }
    }

    private static PaymentCardAuthorization? MapAuthorization(AuthorizationData? auth)
    {
        if (auth is null || string.IsNullOrWhiteSpace(auth.AuthorizationCode))
        {
            return null;
        }

        if (auth.Reusable == false)
        {
            return null;
        }

        return new PaymentCardAuthorization(
            auth.AuthorizationCode.Trim(),
            auth.Last4 ?? "????",
            auth.CardType ?? "card",
            string.IsNullOrWhiteSpace(auth.Bank) ? null : auth.Bank.Trim(),
            auth.ExpMonth ?? "01",
            auth.ExpYear ?? "2099",
            auth.Reusable);
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "Paystack is not configured. Set Billing:Paystack:SecretKey (PAYSTACK_SECRET_KEY in .env).");
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

    private sealed class InitializeData
    {
        [JsonPropertyName("authorization_url")]
        public string? AuthorizationUrl { get; init; }

        [JsonPropertyName("access_code")]
        public string? AccessCode { get; init; }

        [JsonPropertyName("reference")]
        public string? Reference { get; init; }
    }

    private sealed class VerifyData
    {
        [JsonPropertyName("reference")]
        public string? Reference { get; init; }

        [JsonPropertyName("status")]
        public string? Status { get; init; }

        [JsonPropertyName("amount")]
        public int Amount { get; init; }

        [JsonPropertyName("currency")]
        public string? Currency { get; init; }

        [JsonPropertyName("authorization")]
        public AuthorizationData? Authorization { get; init; }

        [JsonPropertyName("subscription_code")]
        public string? SubscriptionCode { get; init; }

        [JsonPropertyName("customer")]
        public CustomerData? Customer { get; init; }
    }

    private sealed class CustomerData
    {
        [JsonPropertyName("customer_code")]
        public string? CustomerCode { get; init; }
    }

    private sealed class AuthorizationData
    {
        [JsonPropertyName("authorization_code")]
        public string? AuthorizationCode { get; init; }

        [JsonPropertyName("last4")]
        public string? Last4 { get; init; }

        [JsonPropertyName("exp_month")]
        public string? ExpMonth { get; init; }

        [JsonPropertyName("exp_year")]
        public string? ExpYear { get; init; }

        [JsonPropertyName("card_type")]
        public string? CardType { get; init; }

        [JsonPropertyName("bank")]
        public string? Bank { get; init; }

        [JsonPropertyName("reusable")]
        public bool Reusable { get; init; } = true;
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
