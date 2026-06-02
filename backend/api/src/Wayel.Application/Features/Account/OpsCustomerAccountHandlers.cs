using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record ListOpsCustomerAccountsQuery(
    string? Search = null,
    string? KycStatus = null,
    string? CountryCode = null,
    string? SuiteStatus = null,
    int Page = 1,
    int PageSize = 25)
    : IQuery<OpsCustomerAccountPageDto>;

internal sealed class ListOpsCustomerAccountsQueryHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISuitePlanRepository plans,
    IClock clock) : IQueryHandler<ListOpsCustomerAccountsQuery, OpsCustomerAccountPageDto>
{
    public async Task<Result<OpsCustomerAccountPageDto>> Handle(
        ListOpsCustomerAccountsQuery request,
        CancellationToken cancellationToken)
    {
        KycStatus? kycFilter = null;
        if (!string.IsNullOrWhiteSpace(request.KycStatus)
            && Enum.TryParse<KycStatus>(request.KycStatus.Trim(), true, out var parsedKyc))
        {
            kycFilter = parsedKyc;
        }

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 10, 100);

        var search = request.Search?.Trim();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var bySuite = await subscriptions.GetBySuiteNumberAsync(search, cancellationToken);
            if (bySuite is not null)
            {
                var suiteUser = await users.GetByIdAsync(bySuite.UserId, cancellationToken);
                if (suiteUser is not null && suiteUser.Role == UserRole.Customer)
                {
                    var planMap = await BuildPlanMapAsync(cancellationToken);
                    var item = MapListItem(suiteUser, bySuite, planMap, clock.UtcNow);
                    return new OpsCustomerAccountPageDto([item], 1, page, pageSize);
                }
            }
        }

        var country = string.IsNullOrWhiteSpace(request.CountryCode)
            ? null
            : request.CountryCode.Trim().ToUpperInvariant();

        if (IsTrialSuiteFilter(request.SuiteStatus))
        {
            return await ListActiveTrialAccountsAsync(
                search,
                kycFilter,
                country,
                page,
                pageSize,
                cancellationToken);
        }

        var pageResult = await users.ListCustomersPageAsync(
            search,
            kycFilter,
            country,
            page,
            pageSize,
            cancellationToken);

        var planLookup = await BuildPlanMapAsync(cancellationToken);
        var items = new List<OpsCustomerAccountListItemDto>();
        foreach (var user in pageResult.Items)
        {
            var sub = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
            var item = MapListItem(user, sub, planLookup, clock.UtcNow);
            if (MatchesSuiteStatus(item, request.SuiteStatus))
            {
                items.Add(item);
            }
        }

        return new OpsCustomerAccountPageDto(items, pageResult.TotalCount, page, pageSize);
    }

    private async Task<Result<OpsCustomerAccountPageDto>> ListActiveTrialAccountsAsync(
        string? search,
        KycStatus? kycFilter,
        string? country,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var nowUtc = clock.UtcNow;
        var trials = await subscriptions.ListActiveTrialsAsync(nowUtc, cancellationToken);
        var planLookup = await BuildPlanMapAsync(cancellationToken);
        var matched = new List<OpsCustomerAccountListItemDto>();

        foreach (var sub in trials)
        {
            sub.RefreshStatus(nowUtc);
            var user = await users.GetByIdAsync(sub.UserId, cancellationToken);
            if (user is null || user.Role != UserRole.Customer)
            {
                continue;
            }

            if (kycFilter is not null && user.KycStatus != kycFilter.Value)
            {
                continue;
            }

            if (country is not null
                && !string.Equals(user.DestinationCountry, country, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(search) && !MatchesCustomerSearch(user, sub, search))
            {
                continue;
            }

            matched.Add(MapListItem(user, sub, planLookup, nowUtc));
        }

        var totalCount = matched.Count;
        var pageItems = matched
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new OpsCustomerAccountPageDto(pageItems, totalCount, page, pageSize);
    }

    private async Task<IReadOnlyDictionary<Guid, SuitePlan>> BuildPlanMapAsync(CancellationToken cancellationToken)
    {
        var active = await plans.ListActiveAsync(cancellationToken);
        return active.ToDictionary(p => p.Id.Value, p => p);
    }

    private static bool IsTrialSuiteFilter(string? suiteStatus) =>
        string.Equals(suiteStatus?.Trim(), "trial", StringComparison.OrdinalIgnoreCase);

    private static bool MatchesSuiteStatus(OpsCustomerAccountListItemDto item, string? suiteStatus)
    {
        if (string.IsNullOrWhiteSpace(suiteStatus))
        {
            return true;
        }

        var filter = suiteStatus.Trim();
        if (IsTrialSuiteFilter(filter))
        {
            return item.IsTrial;
        }

        if (string.Equals(filter, "none", StringComparison.OrdinalIgnoreCase))
        {
            return string.IsNullOrWhiteSpace(item.SuiteNumber);
        }

        return string.Equals(item.SuiteStatus, filter, StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchesCustomerSearch(
        User user,
        Domain.SuiteSubscriptions.SuiteSubscription subscription,
        string search)
    {
        var term = search.Trim();
        if (term.Length == 0)
        {
            return true;
        }

        if (Guid.TryParse(term, out var userId) && user.Id.Value == userId)
        {
            return true;
        }

        return ContainsIgnoreCase(user.Email.Value, term)
            || ContainsIgnoreCase(user.DisplayName, term)
            || ContainsIgnoreCase(user.Phone, term)
            || ContainsIgnoreCase(subscription.SuiteNumber, term);
    }

    private static bool ContainsIgnoreCase(string? value, string term) =>
        !string.IsNullOrEmpty(value)
        && value.Contains(term, StringComparison.OrdinalIgnoreCase);

    private static OpsCustomerAccountListItemDto MapListItem(
        User user,
        Domain.SuiteSubscriptions.SuiteSubscription? subscription,
        IReadOnlyDictionary<Guid, SuitePlan> planLookup,
        DateTime nowUtc)
    {
        subscription?.RefreshStatus(nowUtc);
        string? planName = null;
        if (subscription is not null && planLookup.TryGetValue(subscription.PlanId.Value, out var plan))
        {
            planName = plan.Name;
        }

        var item = new OpsCustomerAccountListItemDto(
            user.Id.Value,
            user.Email.Value,
            user.DisplayName,
            user.Phone ?? string.Empty,
            user.DestinationCountry,
            CountryLabel(user.DestinationCountry),
            user.KycStatus.ToString(),
            subscription?.SuiteNumber,
            subscription?.Status.ToString(),
            planName,
            subscription?.ExpiresAt,
            user.CreatedOnUtc,
            user.IsDisabled,
            KycRiskScore.For(user, nowUtc),
            subscription is { IsTrial: true }
                && SuiteCheckoutBilling.IsWithinPaidPeriod(subscription, nowUtc));

        return item;
    }

    private static string CountryLabel(string code) =>
        code.ToUpperInvariant() switch
        {
            "SZ" => "Eswatini",
            "BW" => "Botswana",
            "NA" => "Namibia",
            "ZA" => "South Africa",
            _ => code,
        };
}

public sealed record GetOpsCustomerAccountQuery(Guid UserId) : IQuery<OpsCustomerAccountDetailDto>;

internal sealed class GetOpsCustomerAccountQueryHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISuitePlanRepository plans,
    IParcelRepository parcels,
    CustomerAccountResponseBuilder accountResponse,
    IClock clock) : IQueryHandler<GetOpsCustomerAccountQuery, OpsCustomerAccountDetailDto>
{
    public async Task<Result<OpsCustomerAccountDetailDto>> Handle(
        GetOpsCustomerAccountQuery request,
        CancellationToken cancellationToken)
    {
        var user = await users.GetByIdAsync(new UserId(request.UserId), cancellationToken);
        if (user is null || user.Role != UserRole.Customer)
        {
            return Error.NotFound("account.not_found", "Customer account not found.");
        }

        var account = await accountResponse.BuildAsync(user, cancellationToken);
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        subscription?.RefreshStatus(clock.UtcNow);
        var userParcels = await parcels.ListForUserAsync(user.Id, cancellationToken);
        var receivedCount = userParcels.Count(p =>
            p.Status is Domain.Parcels.ParcelStatus.Received
                or Domain.Parcels.ParcelStatus.ReadyToShip
                or Domain.Parcels.ParcelStatus.InShipment);

        OpsSuiteSubscriptionDto? subDto = null;
        if (subscription is not null)
        {
            var plan = await plans.GetByIdAsync(subscription.PlanId, cancellationToken);
            subDto = new OpsSuiteSubscriptionDto(
                subscription.Id.Value.ToString(),
                subscription.PlanId.Value.ToString(),
                plan?.Name ?? "Unknown plan",
                plan?.DurationMonths ?? 0,
                plan?.PriceZar ?? 0,
                subscription.SuiteNumber,
                subscription.Status.ToString(),
                subscription.StartedAt,
                subscription.ExpiresAt,
                subscription.ShipOutLocked,
                subscription.IsTrial
                    && SuiteCheckoutBilling.IsWithinPaidPeriod(subscription, clock.UtcNow));
        }

        return new OpsCustomerAccountDetailDto(
            account,
            subDto,
            user.IsDisabled,
            user.LastLoginUtc,
            user.KycSubmittedAtUtc,
            receivedCount);
    }
}
