using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Payments;

/// <summary>
/// Asks MTN whether a customer-supplied MSISDN is an active MoMo wallet. Used
/// by the checkout SPA before submitting a MoMo charge so users get a typed
/// validation error in-place instead of failing at <c>RequestToPay</c>.
/// </summary>
public sealed record ValidateMomoMsisdnQuery(string Msisdn) : IQuery<MomoMsisdnValidationDto>;

/// <param name="IsValid">True only when MTN confirms the wallet is active in the target environment.</param>
/// <param name="Msisdn">Digits-only MSISDN (no leading +) — the value the API would pass upstream.</param>
/// <param name="Reason">User-facing reason when invalid.</param>
public sealed record MomoMsisdnValidationDto(bool IsValid, string Msisdn, string? Reason);

internal sealed class ValidateMomoMsisdnQueryHandler(
    IMomoAccountValidator validator) : IQueryHandler<ValidateMomoMsisdnQuery, MomoMsisdnValidationDto>
{
    public async Task<Result<MomoMsisdnValidationDto>> Handle(
        ValidateMomoMsisdnQuery request,
        CancellationToken cancellationToken)
    {
        var outcome = await validator
            .ValidateAsync(request.Msisdn, cancellationToken)
            .ConfigureAwait(false);
        return Result.Success(new MomoMsisdnValidationDto(
            outcome.IsActive,
            outcome.NormalisedMsisdn,
            outcome.Reason));
    }
}
