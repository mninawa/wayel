namespace Wayel.Application.Abstractions.Payments;

/// <summary>
/// Validates that a customer-supplied MSISDN belongs to an active MTN MoMo
/// account holder, using MTN's canonical <c>accountholder/active</c> probe.
/// </summary>
public interface IMomoAccountValidator
{
    /// <summary>
    /// Probes MTN for the given raw MSISDN. Returns <c>IsActive=true</c> only
    /// when the upstream MoMo Collections API confirms the wallet exists and
    /// is active in the target environment (sandbox or production).
    /// </summary>
    Task<MomoAccountValidationResult> ValidateAsync(string msisdn, CancellationToken cancellationToken = default);
}

/// <summary>
/// Outcome of a MoMo account-holder probe.
/// </summary>
/// <param name="IsActive">True only when MTN confirms the wallet is active.</param>
/// <param name="NormalisedMsisdn">Digits-only MSISDN that was sent upstream (no leading +).</param>
/// <param name="Reason">Human-readable reason when <paramref name="IsActive"/> is false.</param>
public sealed record MomoAccountValidationResult(bool IsActive, string NormalisedMsisdn, string? Reason);
