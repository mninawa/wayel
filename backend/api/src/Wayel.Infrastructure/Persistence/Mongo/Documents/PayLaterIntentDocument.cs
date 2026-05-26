using Wayel.Domain.Onboarding;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class PayLaterIntentDocument
{
    public PayLaterIntentId Id { get; set; }
    public UserId UserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
    public DateTime? ResolvedAtUtc { get; set; }
    public SuitePlanId? PlanAtSignal { get; set; }
    public string? PlanAtSignalLabel { get; set; }

    public static PayLaterIntentDocument From(PayLaterIntent intent) => new()
    {
        Id = intent.Id,
        UserId = intent.UserId,
        CreatedAtUtc = intent.CreatedAtUtc,
        LastSeenAtUtc = intent.LastSeenAtUtc,
        ResolvedAtUtc = intent.ResolvedAtUtc,
        PlanAtSignal = intent.PlanAtSignal,
        PlanAtSignalLabel = intent.PlanAtSignalLabel,
    };

    public PayLaterIntent ToDomain() =>
        PayLaterIntent.Rehydrate(
            Id,
            UserId,
            CreatedAtUtc,
            LastSeenAtUtc,
            ResolvedAtUtc,
            PlanAtSignal,
            PlanAtSignalLabel);
}
