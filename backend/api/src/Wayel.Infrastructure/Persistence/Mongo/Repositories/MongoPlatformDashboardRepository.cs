using System.Globalization;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoPlatformDashboardRepository(MongoContext context, IClock clock)
    : IPlatformDashboardRepository
{
    private static readonly CultureInfo FormatCulture = CultureInfo.InvariantCulture;

    public async Task<OpsPlatformDashboardDto> GetDashboardAsync(CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        var weekEnd = now.AddDays(7);
        var dayEnd = now.AddDays(1);

        var subs = await context.SuiteSubscriptions.Find(FilterDefinition<SuiteSubscriptionDocument>.Empty)
            .ToListAsync(cancellationToken);
        var users = await context.Users
            .Find(x => x.Role == UserRole.Customer)
            .ToListAsync(cancellationToken);
        var quotes = await context.Quotes.Find(FilterDefinition<QuoteDocument>.Empty)
            .ToListAsync(cancellationToken);
        var shipments = await context.Shipments.Find(FilterDefinition<ShipmentDocument>.Empty)
            .ToListAsync(cancellationToken);
        var parcels = await context.Parcels.Find(FilterDefinition<ParcelDocument>.Empty)
            .ToListAsync(cancellationToken);
        var plans = await context.SuitePlans.Find(FilterDefinition<SuitePlanDocument>.Empty)
            .ToListAsync(cancellationToken);
        var manifests = await context.DispatchManifests.Find(FilterDefinition<DispatchManifestDocument>.Empty)
            .SortByDescending(x => x.DispatchDate)
            .Limit(10)
            .ToListAsync(cancellationToken);

        var planById = plans.ToDictionary(p => p.Id, p => p.ToDomain());
        var userById = users.ToDictionary(u => u.Id, u => u);
        var parcelsByUser = parcels.GroupBy(p => p.UserId).ToDictionary(g => g.Key, g => g.ToList());

        var refreshedSubs = subs.Select(s =>
        {
            var domain = s.ToDomain();
            domain.RefreshStatus(now);
            return domain;
        }).ToList();
        var activeSubs = refreshedSubs.Where(s => s.Status == SuiteAccessStatus.Active).ToList();
        var expiringSubs = refreshedSubs.Where(s =>
            s.Status is SuiteAccessStatus.Active or SuiteAccessStatus.ExpiringSoon
            && s.ExpiresAt is not null
            && s.ExpiresAt.Value <= now.AddDays(30)).ToList();
        var expiredSubs = refreshedSubs.Where(s => s.Status == SuiteAccessStatus.Expired).ToList();

        var szCustomers = users.Count(u =>
            string.Equals(u.DestinationCountry, "SZ", StringComparison.OrdinalIgnoreCase));
        var scopeLabel = szCustomers == users.Count
            ? "WeYell · Eswatini corridor"
            : $"WeYell · {users.Count} customers";

        decimal PlanPrice(SuiteSubscription sub) =>
            planById.TryGetValue(sub.PlanId, out var plan) ? plan.PriceZar : 0m;

        var suiteRevenueMonth = refreshedSubs
            .Where(s => s.StartedAt >= monthStart)
            .Sum(PlanPrice);
        var suiteRevenuePrev = refreshedSubs
            .Where(s => s.StartedAt >= prevMonthStart && s.StartedAt < monthStart)
            .Sum(PlanPrice);

        var paidQuotes = quotes
            .Select(q => q.ToDomain())
            .Where(q => q.Status is QuoteStatus.Paid or QuoteStatus.ConvertedToShipment)
            .ToList();
        var shipmentRevenueMonth = paidQuotes
            .Where(q => q.CreatedAtUtc >= monthStart)
            .Sum(q => q.TotalLandedCost);
        var shipmentRevenuePrev = paidQuotes
            .Where(q => q.CreatedAtUtc >= prevMonthStart && q.CreatedAtUtc < monthStart)
            .Sum(q => q.TotalLandedCost);

        var renewalsWeek = refreshedSubs.Count(s =>
            s.ExpiresAt is not null
            && s.ExpiresAt.Value >= now
            && s.ExpiresAt.Value <= weekEnd
            && s.Status is SuiteAccessStatus.Active or SuiteAccessStatus.ExpiringSoon);
        var renewalsDay = refreshedSubs.Count(s =>
            s.ExpiresAt is not null
            && s.ExpiresAt.Value >= now
            && s.ExpiresAt.Value <= dayEnd
            && s.Status is SuiteAccessStatus.Active or SuiteAccessStatus.ExpiringSoon);

        var pendingPaymentQuotes = quotes
            .Select(q => q.ToDomain())
            .Where(q => q.Status is QuoteStatus.Approved or QuoteStatus.PaymentPending)
            .ToList();
        var readyShipments = shipments
            .Select(s => s.ToDomain())
            .Where(s => s.Status is ShipmentStatus.Paid or ShipmentStatus.Quoted or ShipmentStatus.AwaitingApproval)
            .ToList();

        var projectedShipmentRevenue = pendingPaymentQuotes.Sum(q => q.TotalLandedCost)
            + readyShipments.Sum(s => QuoteForShipment(quotes, s.Id)?.TotalLandedCost ?? EstimateShipmentRevenue(s, parcels));

        var totalPlatformMonth = suiteRevenueMonth + shipmentRevenueMonth;
        var totalPlatformPrev = suiteRevenuePrev + shipmentRevenuePrev;

        var revenueMonths = BuildRevenueMonths(now, refreshedSubs, paidQuotes, planById);
        var breakdown = BuildBreakdown(suiteRevenueMonth, shipmentRevenueMonth, totalPlatformMonth);
        var suitePerformance = BuildSuitePerformance(refreshedSubs, expiringSubs, expiredSubs, now, monthStart, prevMonthStart, planById);
        var shipmentBatches = BuildShipmentBatches(manifests, shipments, quotes, parcels, userById, now);
        var batchParcelTotal = shipmentBatches.Sum(b => b.Parcels);
        var batchRevenueTotal = shipmentBatches.Sum(b => b.RevenueZar);
        var corridors = BuildCorridors(paidQuotes, users, shipments);
        var quoteBuckets = BuildQuoteBuckets(pendingPaymentQuotes, now);
        var expiredCustomers = BuildExpiredCustomers(expiredSubs, userById, parcelsByUser, now);
        var expiredAttention = expiredCustomers.Sum(c => c.Parcels);

        var metrics = new List<OpsPlatformDashboardMetricDto>
        {
            new(
                "Active Suites",
                activeSubs.Count.ToString("N0", FormatCulture),
                TrendLabel(activeSubs.Count, CountActiveAt(refreshedSubs, prevMonthStart, monthStart)),
                TrendTone(activeSubs.Count, CountActiveAt(refreshedSubs, prevMonthStart, monthStart)),
                null,
                null,
                "home_work",
                "purple"),
            new(
                "Revenue from Suites (This Month)",
                FormatZar(suiteRevenueMonth),
                TrendLabel(suiteRevenueMonth, suiteRevenuePrev),
                TrendTone(suiteRevenueMonth, suiteRevenuePrev),
                null,
                null,
                "payments",
                "indigo"),
            new(
                "Renewals Due (This Week)",
                renewalsWeek.ToString("N0", FormatCulture),
                null,
                null,
                renewalsDay > 0 ? $"{renewalsDay} due in 24h" : "None due in 24h",
                renewalsDay > 0 ? "amber" : null,
                "event_repeat",
                "amber"),
            new(
                "Shipment Revenue (This Month)",
                FormatZar(shipmentRevenueMonth),
                TrendLabel(shipmentRevenueMonth, shipmentRevenuePrev),
                TrendTone(shipmentRevenueMonth, shipmentRevenuePrev),
                null,
                null,
                "local_shipping",
                "green"),
            new(
                "Projected Revenue from Next Shipments",
                FormatZar(projectedShipmentRevenue),
                null,
                null,
                $"From {readyShipments.Count + pendingPaymentQuotes.Count} shipments / quotes",
                null,
                "trending_up",
                "teal"),
            new(
                "Total Platform Revenue (This Month)",
                FormatZar(totalPlatformMonth),
                TrendLabel(totalPlatformMonth, totalPlatformPrev),
                TrendTone(totalPlatformMonth, totalPlatformPrev),
                null,
                null,
                "account_balance",
                "navy"),
        };

        var forecastItems = new List<OpsPlatformForecastItemDto>
        {
            new("Shipments awaiting payment", pendingPaymentQuotes.Count.ToString("N0", FormatCulture), null, null),
            new("Expected shipments to dispatch", readyShipments.Count.ToString("N0", FormatCulture), null, null),
            new("Estimated shipping revenue", FormatZar(projectedShipmentRevenue), null, null),
            new(
                "Estimated gross margin",
                FormatZar(Math.Round(projectedShipmentRevenue * 0.45m, 2)),
                "45.0%",
                "green"),
            new(
                "Average shipment value",
                readyShipments.Count + pendingPaymentQuotes.Count > 0
                    ? FormatZar(Math.Round(
                        projectedShipmentRevenue / (readyShipments.Count + pendingPaymentQuotes.Count),
                        2))
                    : FormatZar(0),
                null,
                null),
        };

        return new OpsPlatformDashboardDto(
            scopeLabel,
            metrics,
            revenueMonths,
            forecastItems,
            breakdown.Items,
            breakdown.Gradient,
            breakdown.TotalLabel,
            suitePerformance,
            shipmentBatches,
            batchParcelTotal,
            batchRevenueTotal,
            corridors,
            quoteBuckets,
            pendingPaymentQuotes.Count,
            expiredCustomers,
            expiredAttention);
    }

    private static int CountActiveAt(
        IReadOnlyList<SuiteSubscription> subs,
        DateTime from,
        DateTime to) =>
        subs.Count(s =>
            s.StartedAt is not null
            && s.StartedAt < to
            && (s.ExpiresAt is null || s.ExpiresAt >= from));

    private static List<OpsPlatformRevenueMonthDto> BuildRevenueMonths(
        DateTime now,
        List<SuiteSubscription> subs,
        List<Quote> paidQuotes,
        Dictionary<SuitePlanId, SuitePlan> planById)
    {
        var months = new List<OpsPlatformRevenueMonthDto>();
        for (var i = 5; i >= 0; i--)
        {
            var start = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-i);
            var end = start.AddMonths(1);
            var suite = subs
                .Where(s => s.StartedAt >= start && s.StartedAt < end)
                .Sum(s => planById.TryGetValue(s.PlanId, out var p) ? p.PriceZar : 0m);
            var shipment = paidQuotes
                .Where(q => q.CreatedAtUtc >= start && q.CreatedAtUtc < end)
                .Sum(q => q.TotalLandedCost);
            months.Add(new OpsPlatformRevenueMonthDto(
                start.ToString("MMM", FormatCulture),
                suite,
                shipment));
        }

        return months;
    }

    private static (IReadOnlyList<OpsPlatformRevenueBreakdownDto> Items, string Gradient, string TotalLabel) BuildBreakdown(
        decimal suiteRevenue,
        decimal shipmentRevenue,
        decimal total)
    {
        if (total <= 0)
        {
            return (
                [
                    new("Suite Subscriptions", 0, 0, "#6366f1"),
                    new("Shipment Fees", 0, 0, "#22c55e"),
                ],
                "conic-gradient(#e2e8f0 0% 100%)",
                "R0");
        }

        var addOn = Math.Round(total * 0.08m, 2);
        var other = Math.Round(total * 0.05m, 2);
        var suitePct = Math.Round(suiteRevenue / total * 100, 1);
        var shipPct = Math.Round(shipmentRevenue / total * 100, 1);
        var addPct = Math.Round(addOn / total * 100, 1);
        var otherPct = Math.Max(0, 100 - suitePct - shipPct - addPct);

        var endSuite = suitePct;
        var endShip = endSuite + shipPct;
        var endAdd = endShip + addPct;
        var gradient = $"conic-gradient(#6366f1 0% {endSuite.ToString(FormatCulture)}%, #22c55e {endSuite.ToString(FormatCulture)}% {endShip.ToString(FormatCulture)}%, #f59e0b {endShip.ToString(FormatCulture)}% {endAdd.ToString(FormatCulture)}%, #94a3b8 {endAdd.ToString(FormatCulture)}% 100%)";

        return (
            [
                new("Suite Subscriptions", suitePct, suiteRevenue, "#6366f1"),
                new("Shipment Fees", shipPct, shipmentRevenue, "#22c55e"),
                new("Add-on Services", addPct, addOn, "#f59e0b"),
                new("Other Fees", otherPct, other, "#94a3b8"),
            ],
            gradient,
            total >= 1_000_000 ? $"R{Math.Round(total / 1_000_000m, 1):0.#}M" : FormatZar(total));
    }

    private static List<OpsPlatformSuitePerformanceDto> BuildSuitePerformance(
        List<SuiteSubscription> subs,
        List<SuiteSubscription> expiringSubs,
        List<SuiteSubscription> expiredSubs,
        DateTime now,
        DateTime monthStart,
        DateTime prevMonthStart,
        Dictionary<SuitePlanId, SuitePlan> planById)
    {
        var newSold = subs.Count(s => s.StartedAt >= monthStart);
        var newPrev = subs.Count(s => s.StartedAt >= prevMonthStart && s.StartedAt < monthStart);
        var renewed = subs.Count(s =>
            s.StartedAt >= monthStart
            && s.ExpiresAt is not null
            && s.ExpiresAt.Value > now.AddMonths(2));
        var renewedPrev = subs.Count(s =>
            s.StartedAt >= prevMonthStart
            && s.StartedAt < monthStart
            && s.ExpiresAt is not null
            && s.ExpiresAt.Value > prevMonthStart.AddMonths(2));

        return
        [
            new("New Suites Sold", newSold.ToString("N0", FormatCulture), TrendLabel(newSold, newPrev), TrendTone(newSold, newPrev) ?? "green"),
            new("Renewed This Month", renewed.ToString("N0", FormatCulture), TrendLabel(renewed, renewedPrev), TrendTone(renewed, renewedPrev) ?? "green"),
            new("Expiring Soon (30 days)", expiringSubs.Count.ToString("N0", FormatCulture), null, "amber"),
            new("Churn / Expired Suites", expiredSubs.Count.ToString("N0", FormatCulture), null, "red"),
        ];
    }

    private static List<OpsPlatformShipmentBatchDto> BuildShipmentBatches(
        List<DispatchManifestDocument> manifests,
        List<ShipmentDocument> shipments,
        List<QuoteDocument> quotes,
        List<ParcelDocument> parcels,
        Dictionary<UserId, UserDocument> userById,
        DateTime now)
    {
        if (manifests.Count > 0)
        {
            return manifests.Take(4).Select(m =>
            {
                var shipmentIds = m.ShipmentIds ?? [];
                var batchParcels = parcels.Count(p =>
                    shipments.Any(s =>
                        shipmentIds.Contains(s.Id.Value)
                        && s.ParcelIds.Contains(p.Id)));
                var revenue = shipmentIds.Sum(id =>
                {
                    var ship = shipments.FirstOrDefault(s => s.Id.Value == id);
                    if (ship is null) return 0m;
                    return QuoteForShipment(quotes, ship.Id)?.TotalLandedCost
                        ?? EstimateShipmentRevenue(ship.ToDomain(), parcels);
                });
                return new OpsPlatformShipmentBatchDto(
                    m.DisplayId,
                    "Eswatini",
                    "🇸🇿",
                    Math.Max(batchParcels, shipmentIds.Count),
                    revenue,
                    m.DispatchDate.ToString("d MMM yyyy", FormatCulture),
                    ManifestStatusLabel(m.Status),
                    ManifestStatusTone(m.Status));
            }).ToList();
        }

        return shipments
            .Select(s => s.ToDomain())
            .Where(s => s.Status is ShipmentStatus.Paid or ShipmentStatus.Quoted or ShipmentStatus.InTransit)
            .OrderByDescending(s => s.Id.Value)
            .Take(4)
            .Select((s, idx) =>
            {
                var user = userById.GetValueOrDefault(s.UserId);
                var destination = CountryLabel(user?.DestinationCountry ?? "SZ");
                var quote = QuoteForShipment(quotes, s.Id);
                return new OpsPlatformShipmentBatchDto(
                    $"BCH-{now:yyyy-MMdd}-{idx + 1:00}",
                    destination,
                    CountryFlag(user?.DestinationCountry ?? "SZ"),
                    s.ParcelIds.Count,
                    quote?.TotalLandedCost ?? EstimateShipmentRevenue(s, parcels),
                    now.AddDays(idx + 2).ToString("d MMM yyyy", FormatCulture),
                    ShipmentStatusLabel(s.Status),
                    ShipmentStatusTone(s.Status));
            })
            .ToList();
    }

    private static List<OpsPlatformCorridorDto> BuildCorridors(
        List<Quote> paidQuotes,
        List<UserDocument> users,
        List<ShipmentDocument> shipments)
    {
        var groups = paidQuotes
            .GroupBy(q =>
            {
                var user = users.FirstOrDefault(u => u.Id == q.UserId);
                return user?.DestinationCountry?.ToUpperInvariant() ?? "SZ";
            })
            .Select(g => new
            {
                Code = g.Key,
                Revenue = g.Sum(x => x.TotalLandedCost),
            })
            .OrderByDescending(g => g.Revenue)
            .ToList();

        if (groups.Count == 0)
        {
            var parcelCount = shipments.Sum(s => s.ParcelIds.Count);
            if (parcelCount == 0)
            {
                return [new("South Africa → Eswatini", 0, 100)];
            }

            return [new("South Africa → Eswatini", parcelCount * 850m, 100)];
        }

        var top = groups[0]!.Revenue;
        return groups.Select(g => new OpsPlatformCorridorDto(
            $"South Africa → {CountryLabel(g.Code)}",
            g.Revenue,
            top <= 0 ? 100 : (int)Math.Round(g.Revenue / top * 100))).ToList();
    }

    private static List<OpsPlatformQuoteBucketDto> BuildQuoteBuckets(
        List<Quote> pendingQuotes,
        DateTime now)
    {
        int Bucket(DateTime created, int minDays, int? maxDays)
        {
            var age = (now - created).TotalDays;
            if (maxDays is null) return age >= minDays ? 1 : 0;
            return age >= minDays && age < maxDays ? 1 : 0;
        }

        var buckets = new[]
        {
            ("0–7 days", 0, 8),
            ("8–30 days", 8, 31),
            ("30+ days", 31, (int?)null),
        };

        return buckets.Select(b =>
        {
            var items = pendingQuotes.Where(q => Bucket(q.CreatedAtUtc, b.Item2, b.Item3) == 1).ToList();
            return new OpsPlatformQuoteBucketDto(b.Item1, items.Count, items.Sum(x => x.TotalLandedCost));
        }).ToList();
    }

    private static List<OpsPlatformExpiredCustomerDto> BuildExpiredCustomers(
        List<SuiteSubscription> expiredSubs,
        Dictionary<UserId, UserDocument> userById,
        Dictionary<UserId, List<ParcelDocument>> parcelsByUser,
        DateTime now)
    {
        var rows = new List<OpsPlatformExpiredCustomerDto>();
        foreach (var sub in expiredSubs.OrderByDescending(s => s.ExpiresAt))
        {
            if (!parcelsByUser.TryGetValue(sub.UserId, out var userParcels))
            {
                continue;
            }

            var stored = userParcels.Count(p =>
                p.Status is ParcelStatus.Received
                    or ParcelStatus.AwaitingInvoice
                    or ParcelStatus.ReadyToShip);
            if (stored == 0)
            {
                continue;
            }

            var daysExpired = sub.ExpiresAt is null
                ? 0
                : Math.Max(0, (int)Math.Floor((now - sub.ExpiresAt.Value).TotalDays));
            var name = userById.TryGetValue(sub.UserId, out var user)
                ? user.DisplayName
                : sub.SuiteNumber;
            rows.Add(new OpsPlatformExpiredCustomerDto(name, stored, daysExpired));
        }

        return rows.OrderByDescending(r => r.Parcels).Take(6).ToList();
    }

    private static Quote? QuoteForShipment(List<QuoteDocument> quotes, ShipmentId shipmentId) =>
        quotes.Select(q => q.ToDomain()).FirstOrDefault(q => q.ShipmentId == shipmentId);

    private static decimal EstimateShipmentRevenue(Shipment shipment, List<ParcelDocument> parcels)
    {
        var totalDeclared = parcels
            .Where(p => shipment.ParcelIds.Contains(p.Id))
            .Sum(p => p.DeclaredValueZar ?? 0m);
        if (totalDeclared <= 0)
        {
            return shipment.ParcelIds.Count * 850m;
        }

        return totalDeclared + 240m + Math.Round(totalDeclared * 0.15m, 2) + 165m;
    }

    private static string FormatZar(decimal amount) => $"R{amount:N0}";

    private static string TrendLabel(decimal current, decimal previous)
    {
        if (previous <= 0)
        {
            return current > 0 ? "New this period" : "No change vs last month";
        }

        var pct = Math.Round((current - previous) / previous * 100, 1);
        return pct >= 0 ? $"+{pct}% vs last month" : $"{pct}% vs last month";
    }

    private static string TrendLabel(int current, int previous)
    {
        if (previous <= 0)
        {
            return current > 0 ? "New this period" : "No change vs last month";
        }

        var pct = Math.Round((current - previous) / (decimal)previous * 100, 1);
        return pct >= 0 ? $"+{pct}% vs last month" : $"{pct}% vs last month";
    }

    private static string? TrendTone(decimal current, decimal previous)
    {
        if (previous <= 0) return current > 0 ? "green" : null;
        return current >= previous ? "green" : "red";
    }

    private static string? TrendTone(int current, int previous)
    {
        if (previous <= 0) return current > 0 ? "green" : null;
        return current >= previous ? "green" : "red";
    }

    private static string CountryLabel(string code) => code.ToUpperInvariant() switch
    {
        "SZ" => "Eswatini",
        "BW" => "Botswana",
        "NA" => "Namibia",
        "ZA" => "South Africa",
        _ => code,
    };

    private static string CountryFlag(string code) => code.ToUpperInvariant() switch
    {
        "SZ" => "🇸🇿",
        "BW" => "🇧🇼",
        "NA" => "🇳🇦",
        "ZA" => "🇿🇦",
        _ => "🏳️",
    };

    private static string ShipmentStatusLabel(ShipmentStatus status) => status switch
    {
        ShipmentStatus.Paid => "Ready to dispatch",
        ShipmentStatus.Quoted => "Awaiting payment",
        ShipmentStatus.AwaitingApproval => "Documents pending",
        ShipmentStatus.InTransit => "In transit",
        _ => status.ToString(),
    };

    private static string ShipmentStatusTone(ShipmentStatus status) => status switch
    {
        ShipmentStatus.Paid => "green",
        ShipmentStatus.Quoted => "amber",
        ShipmentStatus.AwaitingApproval => "orange",
        _ => "green",
    };

    private static string ManifestStatusLabel(string status) => status.ToUpperInvariant() switch
    {
        "READY" => "Ready to dispatch",
        "PRINTED" => "Ready to dispatch",
        "DRAFT" => "Awaiting payment",
        "HANDED_OVER" => "Handed over",
        _ => status,
    };

    private static string ManifestStatusTone(string status) => status.ToUpperInvariant() switch
    {
        "READY" or "PRINTED" or "HANDED_OVER" => "green",
        "DRAFT" => "amber",
        _ => "orange",
    };
}
