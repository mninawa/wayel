using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Payments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.PaymentMethods;

internal static class SavedCardUpsert
{
    public static async Task<CustomerSavedCardRecord?> TrySaveFromAuthorizationAsync(
        UserId userId,
        PaymentCardAuthorization authorization,
        string? label,
        ICustomerSavedCardRepository cards,
        CancellationToken cancellationToken)
    {
        if (!authorization.Reusable || string.IsNullOrWhiteSpace(authorization.AuthorizationCode))
        {
            return null;
        }

        var existing = await cards.FindByAuthorizationCodeAsync(
            userId,
            authorization.AuthorizationCode,
            cancellationToken);
        if (existing is not null && existing.Status == "Active")
        {
            if (!string.IsNullOrWhiteSpace(label))
            {
                await cards.UpdateLabelAsync(existing.Id, label.Trim(), cancellationToken);
            }

            return existing;
        }

        var active = await cards.ListActiveForUserAsync(userId, cancellationToken);
        var isFirst = active.Count == 0;
        var trimmedLabel = string.IsNullOrWhiteSpace(label) ? null : label.Trim();

        var record = new CustomerSavedCardRecord(
            CustomerSavedCardId.New(),
            userId,
            PaymentProviders.Paystack,
            authorization.AuthorizationCode,
            authorization.CardType,
            authorization.Last4,
            authorization.ExpMonth,
            authorization.ExpYear,
            authorization.Bank,
            trimmedLabel,
            IsDefault: isFirst,
            Status: "Active",
            DateTime.UtcNow,
            null);

        await cards.AddAsync(record, cancellationToken);
        return record;
    }
}
