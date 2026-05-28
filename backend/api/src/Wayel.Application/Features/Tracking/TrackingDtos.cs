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

/// <summary>
/// Customer-facing channels surfaced on the Support page so customers
/// can launch directly into WhatsApp or email. Either or both fields
/// may be empty when an operator has not configured the channel; the
/// UI hides any launcher that is missing.
/// </summary>
public sealed record SupportContactDto(
    string? WhatsAppLink,
    string? WhatsAppDisplay,
    string? EmailAddress);

/// <summary>
/// Slim payload backing the Support page (formerly Tracking &amp;
/// Support). The full active-shipment tracking timeline lives on
/// <c>/shipments/&lt;id&gt;/track</c>; we only return the active
/// shipment id here so the legacy <c>/shipments/active</c> alias keeps
/// resolving without a separate round-trip.
/// </summary>
public sealed record TrackingSupportOverviewDto(
    Guid? ActiveShipmentId,
    SupportTicketSummaryDto? RecentTicket,
    NotificationPreferencesDto Notifications,
    SupportContactDto Support,
    bool WhatsAppTestAvailable);
