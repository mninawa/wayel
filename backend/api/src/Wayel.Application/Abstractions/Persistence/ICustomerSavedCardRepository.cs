using Wayel.Domain.Payments;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record CustomerSavedCardRecord(
    CustomerSavedCardId Id,
    UserId UserId,
    string Provider,
    string AuthorizationCode,
    string CardType,
    string Last4,
    string ExpMonth,
    string ExpYear,
    string? Bank,
    string? Label,
    bool IsDefault,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? RevokedAtUtc);

public interface ICustomerSavedCardRepository
{
    Task<IReadOnlyList<CustomerSavedCardRecord>> ListActiveForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default);

    Task<CustomerSavedCardRecord?> GetByIdAsync(
        CustomerSavedCardId id,
        CancellationToken cancellationToken = default);

    Task<CustomerSavedCardRecord?> FindByAuthorizationCodeAsync(
        UserId userId,
        string authorizationCode,
        CancellationToken cancellationToken = default);

    Task AddAsync(CustomerSavedCardRecord card, CancellationToken cancellationToken = default);

    Task SetDefaultAsync(
        UserId userId,
        CustomerSavedCardId cardId,
        CancellationToken cancellationToken = default);

    Task UpdateLabelAsync(
        CustomerSavedCardId cardId,
        string? label,
        CancellationToken cancellationToken = default);

    Task RevokeAsync(CustomerSavedCardId cardId, DateTime revokedAtUtc, CancellationToken cancellationToken = default);

    Task DeleteAllForUserAsync(UserId userId, CancellationToken cancellationToken = default);
}

public sealed record PaymentMethodAddIntentRecord(
    string Reference,
    UserId UserId,
    int AmountMinorUnits,
    string Status,
    string? Label,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public interface IPaymentMethodAddIntentRepository
{
    Task<PaymentMethodAddIntentRecord?> GetByReferenceAsync(
        string reference,
        CancellationToken cancellationToken = default);

    Task AddAsync(PaymentMethodAddIntentRecord intent, CancellationToken cancellationToken = default);

    Task MarkCompletedAsync(string reference, DateTime completedAtUtc, CancellationToken cancellationToken = default);
}
