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

    public string Name { get; private set; }
    public int DurationMonths { get; private set; }
    public decimal PriceZar { get; private set; }
    public bool IsRecommended { get; private set; }
    public bool IsActive { get; private set; }

    /// <summary>Paystack plan code (PLN_…) when recurring billing is enabled.</summary>
    public string? PaystackPlanCode { get; private set; }

    public static SuitePlan Create(string name, int durationMonths, decimal priceZar, bool isRecommended) =>
        new(SuitePlanId.New(), name.Trim(), durationMonths, priceZar, isRecommended, isActive: true);

    public void Update(string name, int durationMonths, decimal priceZar, bool isRecommended)
    {
        Name = name.Trim();
        DurationMonths = durationMonths;
        PriceZar = priceZar;
        IsRecommended = isRecommended;
    }

    public void Activate() => IsActive = true;

    public void Deactivate() => IsActive = false;

    public void BindPaystackPlan(string planCode)
    {
        if (string.IsNullOrWhiteSpace(planCode))
        {
            throw new ArgumentException("Paystack plan code is required.", nameof(planCode));
        }

        PaystackPlanCode = planCode.Trim();
    }

    public void ClearPaystackPlanBinding() => PaystackPlanCode = null;

    public static SuitePlan Rehydrate(
        SuitePlanId id,
        string name,
        int durationMonths,
        decimal priceZar,
        bool isRecommended,
        bool isActive,
        string? paystackPlanCode = null)
    {
        var plan = new SuitePlan(id, name, durationMonths, priceZar, isRecommended, isActive);
        if (!string.IsNullOrWhiteSpace(paystackPlanCode))
        {
            plan.PaystackPlanCode = paystackPlanCode.Trim();
        }

        return plan;
    }
}
