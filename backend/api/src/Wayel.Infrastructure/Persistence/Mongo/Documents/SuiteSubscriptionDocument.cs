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

    public static SuiteSubscriptionDocument From(SuiteSubscription s) => new() { Id=s.Id, UserId=s.UserId, PlanId=s.PlanId, SuiteNumber=s.SuiteNumber, Status=s.Status, StartedAt=s.StartedAt, ExpiresAt=s.ExpiresAt };
    public SuiteSubscription ToDomain() => SuiteSubscription.Rehydrate(Id, UserId, PlanId, SuiteNumber, Status, StartedAt, ExpiresAt);
}
