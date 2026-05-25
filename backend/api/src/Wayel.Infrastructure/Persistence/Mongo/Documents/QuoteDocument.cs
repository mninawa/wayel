using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class QuoteDocument
{
    public QuoteId Id { get; set; }
    public UserId UserId { get; set; }
    public ShipmentId? ShipmentId { get; set; }
    public decimal TotalLandedCost { get; set; }
    public string DeliveryMethod { get; set; } = "Door-to-Door";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? PublishedAtUtc { get; set; }
    public DateTime ValidUntil { get; set; }
    public QuoteStatus Status { get; set; }
    public string? StatusReason { get; set; }

    /// <summary>Legacy field — used when <see cref="Status"/> is missing on old rows.</summary>
    public QuoteApprovalStatus ApprovalStatus { get; set; }

    public string? ApprovalLockedReason { get; set; }

    public static QuoteDocument From(Quote q) =>
        new()
        {
            Id = q.Id,
            UserId = q.UserId,
            ShipmentId = q.ShipmentId,
            TotalLandedCost = q.TotalLandedCost,
            DeliveryMethod = q.DeliveryMethod,
            CreatedAtUtc = q.CreatedAtUtc,
            PublishedAtUtc = q.PublishedAtUtc,
            ValidUntil = q.ValidUntil,
            Status = q.Status,
            StatusReason = q.StatusReason,
            ApprovalStatus = q.ApprovalStatus,
            ApprovalLockedReason = q.ApprovalLockedReason,
        };

    public Quote ToDomain()
    {
        if (UserId.Value == Guid.Empty && ShipmentId is { } sid)
        {
            return Quote.FromLegacy(
                Id,
                UserId,
                sid,
                TotalLandedCost,
                ValidUntil,
                ApprovalStatus,
                ApprovalLockedReason,
                string.IsNullOrWhiteSpace(DeliveryMethod) ? "Door-to-Door" : DeliveryMethod,
                CreatedAtUtc == default ? ValidUntil.AddDays(-7) : CreatedAtUtc);
        }

        return Quote.Rehydrate(
            Id,
            UserId,
            ShipmentId,
            TotalLandedCost,
            DeliveryMethod,
            CreatedAtUtc == default ? ValidUntil.AddDays(-7) : CreatedAtUtc,
            PublishedAtUtc,
            ValidUntil,
            Status,
            StatusReason);
    }
}
