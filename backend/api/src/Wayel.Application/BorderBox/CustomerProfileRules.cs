using Wayel.Domain.Users;

namespace Wayel.Application.BorderBox;

public static class CustomerProfileRules
{
    public static bool IsComplete(User user) =>
        !string.IsNullOrWhiteSpace(user.FirstName) &&
        !string.IsNullOrWhiteSpace(user.LastName) &&
        !string.IsNullOrWhiteSpace(user.Phone) &&
        !string.IsNullOrWhiteSpace(user.IdNumber) &&
        !string.IsNullOrWhiteSpace(user.IdDocumentType) &&
        !string.IsNullOrWhiteSpace(user.PreferredDeliveryMethod);
}
