using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record OpsParcelSearchHitDto(
    Guid ParcelId,
    string DisplayId,
    string? TrackingNumber,
    string Retailer,
    string ItemName,
    string CustomerDisplayName,
    string SuiteNumber,
    string StatusLabel,
    DateTime ReceivedAtUtc);

public sealed record SearchOpsReceivingQuery(string Query, int Limit = 30)
    : IQuery<IReadOnlyList<OpsParcelSearchHitDto>>;

internal sealed class SearchOpsReceivingQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IUserRepository users) : IQueryHandler<SearchOpsReceivingQuery, IReadOnlyList<OpsParcelSearchHitDto>>
{
    public async Task<Result<IReadOnlyList<OpsParcelSearchHitDto>>> Handle(
        SearchOpsReceivingQuery request,
        CancellationToken cancellationToken)
    {
        var term = request.Query.Trim();
        if (term.Length < 2)
        {
            return Error.Validation("search.too_short", "Enter at least 2 characters to search.");
        }

        var needle = term.ToLowerInvariant();
        var scanLimit = Math.Clamp(request.Limit * 10, 50, 500);
        var items = await parcels.ListRecentAsync(scanLimit, cancellationToken);
        var hits = new List<OpsParcelSearchHitDto>();

        foreach (var parcel in items)
        {
            var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
            _ = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
            var displayId = OpsParcelDisplayIds.Format(parcel);
            if (!Matches(parcel, displayId, user?.DisplayName, user?.Email.Value, needle))
            {
                continue;
            }

            hits.Add(new OpsParcelSearchHitDto(
                parcel.Id.Value,
                displayId,
                parcel.TrackingNumber,
                parcel.Retailer,
                parcel.ItemName,
                user?.DisplayName ?? "Customer",
                parcel.SuiteNumber,
                OpsParcelLabels.Status(parcel.Status),
                parcel.ReceivedAtUtc));

            if (hits.Count >= request.Limit)
            {
                break;
            }
        }

        return hits;
    }

    private static bool Matches(
        Parcel parcel,
        string displayId,
        string? customerName,
        string? customerEmail,
        string needle) =>
        Contains(displayId, needle) ||
        Contains(parcel.TrackingNumber, needle) ||
        Contains(parcel.Retailer, needle) ||
        Contains(parcel.ItemName, needle) ||
        Contains(parcel.SuiteNumber, needle) ||
        Contains(parcel.Id.Value.ToString(), needle) ||
        Contains(customerName, needle) ||
        Contains(customerEmail, needle);

    private static bool Contains(string? value, string needle) =>
        !string.IsNullOrWhiteSpace(value) && value.Contains(needle, StringComparison.OrdinalIgnoreCase);
}
