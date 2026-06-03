using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class SuiteSubscriptionDocument
{
    public SuiteSubscriptionId Id { get; set; }
    public UserId UserId { get; set; }
    public SuitePlanId PlanId { get; set; }
    public string SuiteNumber { get; set; } = "";
    public SuiteAccessStatus Status { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsTrial { get; set; }
    public string? PaystackSubscriptionCode { get; set; }
    public string? PaystackCustomerCode { get; set; }
    public bool AutoRenewEnabled { get; set; }

    public static SuiteSubscriptionDocument From(SuiteSubscription s) => new()
    {
        Id = s.Id,
        UserId = s.UserId,
        PlanId = s.PlanId,
        SuiteNumber = s.SuiteNumber,
        Status = s.Status,
        StartedAt = s.StartedAt,
        ExpiresAt = s.ExpiresAt,
        IsTrial = s.IsTrial,
        PaystackSubscriptionCode = s.PaystackSubscriptionCode,
        PaystackCustomerCode = s.PaystackCustomerCode,
        AutoRenewEnabled = s.AutoRenewEnabled,
    };

    public SuiteSubscription ToDomain() =>
        SuiteSubscription.Rehydrate(
            Id,
            UserId,
            PlanId,
            SuiteNumber,
            Status,
            StartedAt,
            ExpiresAt,
            IsTrial,
            PaystackSubscriptionCode,
            PaystackCustomerCode,
            AutoRenewEnabled);
}
