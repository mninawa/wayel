using Wayel.Domain.SuitePlans;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class SuitePlanDocument
{
    public SuitePlanId Id { get; set; }
    public string Name { get; set; } = "";
    public int DurationMonths { get; set; }
    public decimal PriceZar { get; set; }
    public bool IsRecommended { get; set; }
    public bool IsActive { get; set; }

    public static SuitePlanDocument From(SuitePlan p) => new() { Id=p.Id, Name=p.Name, DurationMonths=p.DurationMonths, PriceZar=p.PriceZar, IsRecommended=p.IsRecommended, IsActive=p.IsActive };
    public SuitePlan ToDomain() => SuitePlan.Rehydrate(Id, Name, DurationMonths, PriceZar, IsRecommended, IsActive);
}
