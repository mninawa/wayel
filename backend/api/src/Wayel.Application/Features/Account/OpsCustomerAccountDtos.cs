namespace Wayel.Application.Features.Account;

public sealed record OpsCustomerAccountListItemDto(
    Guid UserId,
    string Email,
    string DisplayName,
    string Phone,
    string DestinationCountryCode,
    string DestinationCountryLabel,
    string KycStatus,
    string? SuiteNumber,
    string? SuiteStatus,
    string? PlanName,
    DateTime? SuiteExpiresAtUtc,
    DateTime MemberSinceUtc,
    bool IsDisabled,
    string RiskLevel,
    bool IsTrial);

public sealed record OpsCustomerAccountPageDto(
    IReadOnlyList<OpsCustomerAccountListItemDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record OpsSuiteSubscriptionDto(
    string SubscriptionId,
    string PlanId,
    string PlanName,
    int PlanDurationMonths,
    decimal PlanPriceZar,
    string SuiteNumber,
    string Status,
    DateTime? StartedAtUtc,
    DateTime? ExpiresAtUtc,
    bool ShipOutLocked,
    bool IsTrial,
    bool AutoRenewEnabled);

public sealed record OpsCustomerAccountDetailDto(
    CustomerAccountResponse Account,
    OpsSuiteSubscriptionDto? Subscription,
    bool IsDisabled,
    DateTime? LastLoginUtc,
    DateTime? KycSubmittedAtUtc,
    int ReceivedParcelCount);
