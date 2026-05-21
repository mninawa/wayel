using Wayel.Domain.Common;

namespace Wayel.Domain.Users;

/// <summary>WeYell customer account.</summary>
public sealed class User : AggregateRoot<UserId>
{
    private User(
        UserId id,
        Email email,
        string passwordHash,
        string displayName,
        string? phone,
        string destinationCountry,
        KycStatus kycStatus,
        DateTime createdOnUtc,
        string firstName,
        string lastName,
        string idNumber,
        string idDocumentType,
        string preferredDeliveryMethod,
        bool notifyEmail,
        bool notifySms,
        bool notifyWhatsApp,
        bool notifyMarketing)
        : base(id)
    {
        Email = email;
        PasswordHash = passwordHash;
        DisplayName = displayName;
        Phone = phone;
        DestinationCountry = destinationCountry;
        KycStatus = kycStatus;
        CreatedOnUtc = createdOnUtc;
        FirstName = firstName;
        LastName = lastName;
        IdNumber = idNumber;
        IdDocumentType = idDocumentType;
        PreferredDeliveryMethod = preferredDeliveryMethod;
        NotifyEmail = notifyEmail;
        NotifySms = notifySms;
        NotifyWhatsApp = notifyWhatsApp;
        NotifyMarketing = notifyMarketing;
        Role = UserRole.Customer;
        IsDisabled = false;
    }

    public Email Email { get; private set; }
    public string PasswordHash { get; private set; }
    public string DisplayName { get; private set; }
    public string? Phone { get; private set; }
    public string DestinationCountry { get; private set; }
    public KycStatus KycStatus { get; private set; }
    public UserRole Role { get; }
    public bool IsDisabled { get; private set; }
    public DateTime CreatedOnUtc { get; }
    public DateTime? LastLoginUtc { get; private set; }

    public string FirstName { get; private set; }
    public string LastName { get; private set; }
    public string IdNumber { get; private set; }
    public string IdDocumentType { get; private set; }
    public string PreferredDeliveryMethod { get; private set; }
    public bool NotifyEmail { get; private set; }
    public bool NotifySms { get; private set; }
    public bool NotifyWhatsApp { get; private set; }
    public bool NotifyMarketing { get; private set; }

    public const string SsoOnlyPasswordSentinel = "!";

    public bool HasPasswordCredential =>
        !string.Equals(PasswordHash, SsoOnlyPasswordSentinel, StringComparison.Ordinal);

    public static Result<User> Create(
        string email,
        string passwordHash,
        string displayName,
        string? phone,
        string destinationCountry,
        DateTime nowUtc)
    {
        var emailResult = Email.Create(email);
        if (emailResult.IsFailure)
        {
            return Result.Failure<User>(emailResult.Error);
        }

        if (string.IsNullOrWhiteSpace(passwordHash))
        {
            return UserErrors.PasswordTooShort;
        }

        var name = string.IsNullOrWhiteSpace(displayName) ? emailResult.Value.Value : displayName.Trim();
        var (first, last) = SplitDisplayName(name);

        return new User(
            UserId.New(),
            emailResult.Value,
            passwordHash,
            name,
            string.IsNullOrWhiteSpace(phone) ? null : phone.Trim(),
            string.IsNullOrWhiteSpace(destinationCountry) ? "SZ" : destinationCountry.Trim().ToUpperInvariant(),
            KycStatus.NotStarted,
            nowUtc,
            first,
            last,
            idNumber: string.Empty,
            idDocumentType: string.Empty,
            preferredDeliveryMethod: string.Empty,
            notifyEmail: true,
            notifySms: true,
            notifyWhatsApp: false,
            notifyMarketing: false);
    }

    public static Result<User> CreateForSso(string email, string displayName, string? phone, DateTime nowUtc) =>
        Create(email, SsoOnlyPasswordSentinel, displayName, phone, "SZ", nowUtc);

    public static User Rehydrate(
        UserId id,
        Email email,
        string passwordHash,
        string displayName,
        string? phone,
        string destinationCountry,
        KycStatus kycStatus,
        UserRole role,
        bool isDisabled,
        DateTime createdOnUtc,
        DateTime? lastLoginUtc,
        string firstName = "",
        string lastName = "",
        string idNumber = "",
        string idDocumentType = "",
        string preferredDeliveryMethod = "",
        bool notifyEmail = true,
        bool notifySms = true,
        bool notifyWhatsApp = false,
        bool notifyMarketing = false) =>
        new(
            id,
            email,
            passwordHash,
            displayName,
            phone,
            destinationCountry,
            kycStatus,
            createdOnUtc,
            firstName,
            lastName,
            idNumber,
            idDocumentType,
            preferredDeliveryMethod,
            notifyEmail,
            notifySms,
            notifyWhatsApp,
            notifyMarketing)
        {
            IsDisabled = isDisabled,
            LastLoginUtc = lastLoginUtc,
        };

    public Result Authenticate(Func<string, bool> passwordVerifier, DateTime nowUtc)
    {
        if (IsDisabled)
        {
            return UserErrors.Disabled;
        }

        if (!HasPasswordCredential || !passwordVerifier(PasswordHash))
        {
            return UserErrors.InvalidCredentials;
        }

        LastLoginUtc = nowUtc;
        return Result.Success();
    }

    public void RecordLogin(DateTime nowUtc) => LastLoginUtc = nowUtc;

    public void UpdateProfile(string displayName, string? phone, KycStatus? kycStatus = null)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            DisplayName = displayName.Trim();
        }

        Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        if (kycStatus is not null)
        {
            KycStatus = kycStatus.Value;
        }
    }

    public void UpdateCustomerProfile(
        string firstName,
        string lastName,
        string phone,
        string idNumber,
        string idDocumentType,
        string preferredDeliveryMethod)
    {
        FirstName = firstName.Trim();
        LastName = lastName.Trim();
        DisplayName = $"{FirstName} {LastName}".Trim();
        Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        IdNumber = idNumber.Trim();
        IdDocumentType = idDocumentType.Trim();
        PreferredDeliveryMethod = preferredDeliveryMethod.Trim();
    }

    public void UpdateNotificationPreferences(bool email, bool sms, bool whatsApp, bool marketing)
    {
        NotifyEmail = email;
        NotifySms = sms;
        NotifyWhatsApp = whatsApp;
        NotifyMarketing = marketing;
    }

    private static (string First, string Last) SplitDisplayName(string displayName)
    {
        var trimmed = displayName.Trim();
        var space = trimmed.IndexOf(' ');
        if (space < 0)
        {
            return (trimmed, string.Empty);
        }

        return (trimmed[..space].Trim(), trimmed[(space + 1)..].Trim());
    }
}
