namespace Wayel.Application.Features.Account;

public sealed record CustomerAccountResponse(
    CustomerProfileDto Profile,
    SuiteAddressDto? SuiteAddress,
    IReadOnlyList<DeliveryAddressDto> DeliveryAddresses,
    NotificationPreferencesDto Notifications,
    bool ProfileComplete,
    bool SuiteEligible,
    bool HasSuite);

public sealed record CustomerProfileDto(
    string UserId,
    string Email,
    string FirstName,
    string LastName,
    string DisplayName,
    string Phone,
    string DestinationCountryCode,
    string DestinationCountryLabel,
    string IdNumber,
    string IdDocumentType,
    string PreferredDeliveryMethod,
    string KycStatus,
    string? KycRejectionReason,
    string MemberSince,
    string AuthProvider);

public sealed record SuiteAddressDto(
    string SuiteNumber,
    string Label,
    string RecipientName,
    string WarehouseName,
    string Line1,
    string? Line2,
    string City,
    string Province,
    string PostalCode,
    string Country,
    string CountryCode,
    string Formatted);

public sealed record DeliveryAddressDto(
    string Id,
    string BranchId,
    string BranchName,
    string Label,
    string FullName,
    string Phone,
    string Line1,
    string? Line2,
    string City,
    string Region,
    string CountryCode,
    string CountryLabel,
    bool IsDefault);

public sealed record NotificationPreferencesDto(bool Email, bool Sms, bool WhatsApp, bool Marketing);
