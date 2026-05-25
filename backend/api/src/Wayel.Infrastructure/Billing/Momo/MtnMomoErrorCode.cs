namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Canonical MTN MoMo Open API transaction error codes.
/// Mirrors the enum in MTN's official documentation (and the `TJMusiitwa/mtn_momo_collections` Dart port).
/// </summary>
public enum MtnMomoErrorCode
{
    Unknown,
    PayeeNotFound,
    PayerNotFound,
    InvalidCallbackUrlHost,
    InvalidReferenceId,
    ResourceNotFound,
    ResourceAlreadyExist,
    PayerLimitReached,
    ApprovalRejected,
    NotEnoughFunds,
    SenderAccountNotActive,
    InternalProcessingError,
    CouldNotPerformTransaction,
    ForbiddenIp,
    AccessDenied,
}

internal static class MtnMomoErrorCodes
{
    public static MtnMomoErrorCode From(string? raw) => (raw ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "PAYEE_NOT_FOUND" => MtnMomoErrorCode.PayeeNotFound,
        "PAYER_NOT_FOUND" => MtnMomoErrorCode.PayerNotFound,
        "INVALID_CALLBACK_URL_HOST" => MtnMomoErrorCode.InvalidCallbackUrlHost,
        "INVALID_REFERENCE_ID" => MtnMomoErrorCode.InvalidReferenceId,
        "RESOURCE_NOT_FOUND" => MtnMomoErrorCode.ResourceNotFound,
        "RESOURCE_ALREADY_EXIST" => MtnMomoErrorCode.ResourceAlreadyExist,
        "PAYER_LIMIT_REACHED" => MtnMomoErrorCode.PayerLimitReached,
        "APPROVAL_REJECTED" => MtnMomoErrorCode.ApprovalRejected,
        "NOT_ENOUGH_FUNDS" => MtnMomoErrorCode.NotEnoughFunds,
        "SENDER_ACCOUNT_NOT_ACTIVE" => MtnMomoErrorCode.SenderAccountNotActive,
        "INTERNAL_PROCESSING_ERROR" => MtnMomoErrorCode.InternalProcessingError,
        "COULD_NOT_PERFORM_TRANSACTION" => MtnMomoErrorCode.CouldNotPerformTransaction,
        "FORBIDDEN_IP" => MtnMomoErrorCode.ForbiddenIp,
        "ACCESS_DENIED" => MtnMomoErrorCode.AccessDenied,
        _ => MtnMomoErrorCode.Unknown,
    };

    public static string Describe(MtnMomoErrorCode code) => code switch
    {
        MtnMomoErrorCode.PayeeNotFound => "Recipient MSISDN is invalid or unregistered.",
        MtnMomoErrorCode.PayerNotFound => "Sender MSISDN does not exist or is invalid.",
        MtnMomoErrorCode.InvalidCallbackUrlHost => "Callback URL host must be a domain name, not an IP.",
        MtnMomoErrorCode.InvalidReferenceId => "Reference ID (UUID v4) is invalid or malformed.",
        MtnMomoErrorCode.ResourceNotFound => "The specified transaction or reference cannot be located.",
        MtnMomoErrorCode.ResourceAlreadyExist => "Duplicate reference ID supplied.",
        MtnMomoErrorCode.PayerLimitReached => "Daily/monthly wallet limits hit by customer.",
        MtnMomoErrorCode.ApprovalRejected => "Customer cancelled the payment prompt or it timed out.",
        MtnMomoErrorCode.NotEnoughFunds => "Customer wallet has insufficient balance.",
        MtnMomoErrorCode.SenderAccountNotActive => "Customer wallet is frozen or inactive.",
        MtnMomoErrorCode.InternalProcessingError => "MTN core processing engine error.",
        MtnMomoErrorCode.CouldNotPerformTransaction => "System failure to complete transaction.",
        MtnMomoErrorCode.ForbiddenIp => "Source server IP is blocked.",
        MtnMomoErrorCode.AccessDenied => "Invalid subscription key or product access denied.",
        _ => "Unknown MoMo error.",
    };
}
