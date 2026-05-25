namespace Wayel.Application.Features.Tracking;

public sealed record TrackingTimelineStepDto(string Label, bool Done, bool Current, DateTime? OccurredAtUtc);

public sealed record ShipmentTrackingDto(
    Guid ShipmentId,
    string Reference,
    string Status,
    string StatusLabel,
    string? PrimaryTrackingNumber,
    string From,
    string To,
    string Service,
    string WeightLabel,
    int PieceCount,
    string? EstimatedDelivery,
    IReadOnlyList<TrackingTimelineStepDto> Timeline);

public sealed record SupportTicketSummaryDto(
    Guid Id,
    string DisplayId,
    string Subject,
    string Snippet,
    string Status,
    DateTime CreatedAtUtc);

public sealed record NotificationPreferencesDto(bool Email, bool Sms, bool WhatsApp);

public sealed record TrackingSupportOverviewDto(
    ShipmentTrackingDto? ActiveShipment,
    SupportTicketSummaryDto? RecentTicket,
    NotificationPreferencesDto Notifications);
