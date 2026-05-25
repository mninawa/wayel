namespace Wayel.Application.Abstractions.Payments;

public sealed record PaymentInitializeRequest(
    string Email,
    string Reference,
    int AmountMinorUnits,
    string CallbackUrl,
    IReadOnlyDictionary<string, string> Metadata);

public sealed record PaymentInitializeResult(
    string Reference,
    string AuthorizationUrl,
    string AccessCode);

public sealed record PaymentVerifyResult(
    string Reference,
    string Status,
    int AmountMinorUnits,
    string Currency);

public interface IPaymentGateway
{
    Task<PaymentInitializeResult> InitializeChargeAsync(
        PaymentInitializeRequest request,
        CancellationToken cancellationToken = default);

    Task<PaymentVerifyResult> VerifyChargeAsync(
        string reference,
        CancellationToken cancellationToken = default);

    bool IsConfigured { get; }

    string? PublicKey { get; }
}
