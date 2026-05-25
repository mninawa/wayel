using System.Text.Json.Serialization;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>Party identifier — MoMo accepts MSISDN, EMAIL, or PARTY_CODE. Wayel only uses MSISDN.</summary>
public sealed record MomoParty(
    [property: JsonPropertyName("partyIdType")] string PartyIdType,
    [property: JsonPropertyName("partyId")] string PartyId)
{
    public static MomoParty Msisdn(string msisdn) => new("MSISDN", msisdn);
}

/// <summary>POST /collection/v1_0/requesttopay body.</summary>
public sealed record MomoRequestToPay(
    [property: JsonPropertyName("amount")] string Amount,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("externalId")] string ExternalId,
    [property: JsonPropertyName("payer")] MomoParty Payer,
    [property: JsonPropertyName("payerMessage")] string? PayerMessage,
    [property: JsonPropertyName("payeeNote")] string? PayeeNote);

/// <summary>POST /disbursement/v1_0/transfer body.</summary>
public sealed record MomoTransfer(
    [property: JsonPropertyName("amount")] string Amount,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("externalId")] string ExternalId,
    [property: JsonPropertyName("payee")] MomoParty Payee,
    [property: JsonPropertyName("payerMessage")] string? PayerMessage,
    [property: JsonPropertyName("payeeNote")] string? PayeeNote);

/// <summary>Common shape returned by GET .../requesttopay/{ref} and .../transfer/{ref}.</summary>
public sealed class MomoTransactionStatus
{
    [JsonPropertyName("amount")] public string? Amount { get; init; }
    [JsonPropertyName("currency")] public string? Currency { get; init; }
    [JsonPropertyName("financialTransactionId")] public string? FinancialTransactionId { get; init; }
    [JsonPropertyName("externalId")] public string? ExternalId { get; init; }
    [JsonPropertyName("payer")] public MomoParty? Payer { get; init; }
    [JsonPropertyName("payee")] public MomoParty? Payee { get; init; }
    [JsonPropertyName("payerMessage")] public string? PayerMessage { get; init; }
    [JsonPropertyName("payeeNote")] public string? PayeeNote { get; init; }

    /// <summary>"SUCCESSFUL" | "PENDING" | "FAILED".</summary>
    [JsonPropertyName("status")] public string Status { get; init; } = "PENDING";

    [JsonPropertyName("reason")] public MomoReason? Reason { get; init; }
}

public sealed class MomoReason
{
    [JsonPropertyName("code")] public string? Code { get; init; }
    [JsonPropertyName("message")] public string? Message { get; init; }
}

public sealed class MomoBalance
{
    [JsonPropertyName("availableBalance")] public string? AvailableBalance { get; init; }
    [JsonPropertyName("currency")] public string? Currency { get; init; }
}

public sealed class MomoAccountHolder
{
    [JsonPropertyName("result")] public bool Result { get; init; }
}

public sealed class MomoBasicUserInfo
{
    [JsonPropertyName("name")] public string? Name { get; init; }
    [JsonPropertyName("given_name")] public string? GivenName { get; init; }
    [JsonPropertyName("family_name")] public string? FamilyName { get; init; }
    [JsonPropertyName("birthdate")] public string? Birthdate { get; init; }
    [JsonPropertyName("locale")] public string? Locale { get; init; }
    [JsonPropertyName("gender")] public string? Gender { get; init; }
    [JsonPropertyName("status")] public string? Status { get; init; }
}

/// <summary>Generic MTN error envelope returned on 4xx responses.</summary>
public sealed class MomoErrorEnvelope
{
    [JsonPropertyName("code")] public string? Code { get; init; }
    [JsonPropertyName("message")] public string? Message { get; init; }
}
