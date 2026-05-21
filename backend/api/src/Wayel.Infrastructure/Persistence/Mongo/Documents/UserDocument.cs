using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class UserDocument
{
    public UserId Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string DestinationCountry { get; set; } = "SZ";
    public KycStatus KycStatus { get; set; }
    public UserRole Role { get; set; }
    public bool IsDisabled { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public DateTime? LastLoginUtc { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string IdNumber { get; set; } = string.Empty;
    public string IdDocumentType { get; set; } = string.Empty;
    public string PreferredDeliveryMethod { get; set; } = string.Empty;
    public bool NotifyEmail { get; set; } = true;
    public bool NotifySms { get; set; } = true;
    public bool NotifyWhatsApp { get; set; }
    public bool NotifyMarketing { get; set; }

    public static UserDocument FromDomain(User user) => new()
    {
        Id = user.Id,
        Email = user.Email.Value,
        PasswordHash = user.PasswordHash,
        DisplayName = user.DisplayName,
        Phone = user.Phone,
        DestinationCountry = user.DestinationCountry,
        KycStatus = user.KycStatus,
        Role = user.Role,
        IsDisabled = user.IsDisabled,
        CreatedOnUtc = user.CreatedOnUtc,
        LastLoginUtc = user.LastLoginUtc,
        FirstName = user.FirstName,
        LastName = user.LastName,
        IdNumber = user.IdNumber,
        IdDocumentType = user.IdDocumentType,
        PreferredDeliveryMethod = user.PreferredDeliveryMethod,
        NotifyEmail = user.NotifyEmail,
        NotifySms = user.NotifySms,
        NotifyWhatsApp = user.NotifyWhatsApp,
        NotifyMarketing = user.NotifyMarketing,
    };

    public User ToDomain()
    {
        var emailResult = Wayel.Domain.Users.Email.Create(Email);
        if (emailResult.IsFailure)
        {
            throw new InvalidOperationException($"Invalid persisted email: {Email}");
        }

        return User.Rehydrate(
            Id,
            emailResult.Value,
            PasswordHash,
            DisplayName,
            Phone,
            DestinationCountry,
            KycStatus,
            Role,
            IsDisabled,
            CreatedOnUtc,
            LastLoginUtc,
            FirstName,
            LastName,
            IdNumber,
            IdDocumentType,
            PreferredDeliveryMethod,
            NotifyEmail,
            NotifySms,
            NotifyWhatsApp,
            NotifyMarketing);
    }
}
