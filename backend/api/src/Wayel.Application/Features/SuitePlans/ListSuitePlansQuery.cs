using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlans;

public sealed record ListSuitePlansQuery : IQuery<IReadOnlyList<SuitePlanDto>>;

public sealed record SuitePlanDto(Guid Id, string Name, int DurationMonths, decimal PriceZar, bool IsRecommended);

internal sealed class ListSuitePlansQueryHandler(ISuitePlanRepository plans)
    : IQueryHandler<ListSuitePlansQuery, IReadOnlyList<SuitePlanDto>>
{
    public async Task<Result<IReadOnlyList<SuitePlanDto>>> Handle(ListSuitePlansQuery request, CancellationToken cancellationToken)
    {
        var items = await plans.ListActiveAsync(cancellationToken);
        return items
            .Select(p => new SuitePlanDto(p.Id.Value, p.Name, p.DurationMonths, p.PriceZar, p.IsRecommended))
            .ToList();
    }
}
