using Wayel.Domain.Common;

namespace Wayel.Domain.SuitePlans;

public sealed class SuitePlan : AggregateRoot<SuitePlanId>
{
    private SuitePlan(
        SuitePlanId id,
        string name,
        int durationMonths,
        decimal priceZar,
        bool isRecommended,
        bool isActive)
        : base(id)
    {
        Name = name;
        DurationMonths = durationMonths;
        PriceZar = priceZar;
        IsRecommended = isRecommended;
        IsActive = isActive;
    }

    public string Name { get; }
    public int DurationMonths { get; }
    public decimal PriceZar { get; }
    public bool IsRecommended { get; }
    public bool IsActive { get; }

    public static SuitePlan Create(string name, int durationMonths, decimal priceZar, bool isRecommended) =>
        new(SuitePlanId.New(), name, durationMonths, priceZar, isRecommended, isActive: true);

    public static SuitePlan Rehydrate(
        SuitePlanId id,
        string name,
        int durationMonths,
        decimal priceZar,
        bool isRecommended,
        bool isActive) =>
        new(id, name, durationMonths, priceZar, isRecommended, isActive);
}
