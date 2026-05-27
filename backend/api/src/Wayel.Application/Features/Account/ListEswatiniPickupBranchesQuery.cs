using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.PickupBranches;

namespace Wayel.Application.Features.Account;

public sealed record PickupBranchDto(
    string Id,
    string Name,
    string Line1,
    string? Line2,
    string City,
    string Region,
    string Description,
    string? PoBox,
    string PostalCode,
    string CountryCode,
    string? Phone,
    string? PhoneAlt,
    double? Latitude,
    double? Longitude,
    string? GooglePlaceId);

public sealed record ListEswatiniPickupBranchesQuery : IQuery<IReadOnlyList<PickupBranchDto>>;

internal sealed class ListEswatiniPickupBranchesQueryHandler(IPickupBranchRepository pickupBranches)
    : IQueryHandler<ListEswatiniPickupBranchesQuery, IReadOnlyList<PickupBranchDto>>
{
    public async Task<Result<IReadOnlyList<PickupBranchDto>>> Handle(
        ListEswatiniPickupBranchesQuery request,
        CancellationToken cancellationToken)
    {
        var branches = await pickupBranches.ListActiveAsync(cancellationToken);
        return branches.Select(Map).ToList();
    }

    private static PickupBranchDto Map(PickupBranch branch) =>
        new(
            branch.Id,
            branch.Name,
            branch.Line1,
            branch.Line2,
            branch.City,
            branch.Region,
            branch.Description,
            branch.PoBox,
            branch.PostalCode,
            branch.CountryCode,
            branch.Phone,
            branch.PhoneAlt,
            branch.Latitude,
            branch.Longitude,
            branch.GooglePlaceId);
}
