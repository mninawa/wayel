using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record GetTrackingSupportOverviewQuery : IQuery<TrackingSupportOverviewDto>;

internal sealed class GetTrackingSupportOverviewQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IShipmentRepository shipments,
    ISupportTicketRepository tickets,
    IOptions<BorderBoxOptions> borderBoxOptions,
    IOptions<WaSenderNotificationOptions> waSenderOptions) : IQueryHandler<GetTrackingSupportOverviewQuery, TrackingSupportOverviewDto>
{
    public async Task<Result<TrackingSupportOverviewDto>> Handle(
        GetTrackingSupportOverviewQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var allShipments = await shipments.ListForUserAsync(user.Id, cancellationToken);
        var active = PickActiveShipment(allShipments);

        var ticketList = await tickets.ListForUserAsync(user.Id, cancellationToken);
        SupportTicketSummaryDto? recentTicket = ticketList.Count > 0
            ? MapTicket(ticketList[0])
            : null;

        return new TrackingSupportOverviewDto(
            ActiveShipmentId: active?.Id.Value,
            RecentTicket: recentTicket,
            Notifications: new NotificationPreferencesDto(
                user.NotifyEmail,
                user.NotifySms,
                user.NotifyWhatsApp),
            Support: BuildSupportContact(borderBoxOptions.Value, waSenderOptions.Value),
            WhatsAppTestAvailable: waSenderOptions.Value.IsConfiguredForDelivery);
    }

    private static Shipment? PickActiveShipment(IReadOnlyList<Shipment> items) =>
        items.FirstOrDefault(s => s.Status == ShipmentStatus.InTransit)
        ?? items.FirstOrDefault(s => s.Status is ShipmentStatus.AwaitingApproval or ShipmentStatus.Paid)
        ?? items.FirstOrDefault(s => s.Status != ShipmentStatus.Draft);

    private static SupportContactDto BuildSupportContact(
        BorderBoxOptions borderBox,
        WaSenderNotificationOptions waSender)
    {
        var whatsAppLink = NormalizeWaMeLink(borderBox.SupportWhatsAppLink);
        string? whatsAppDisplay = null;
        if (whatsAppLink is not null)
        {
            var label = borderBox.SupportWhatsAppLabel?.Trim();
            whatsAppDisplay = string.IsNullOrWhiteSpace(label) ? "Chat with our team" : label;
        }
        else
        {
            var rawWhatsApp = borderBox.SupportWhatsAppE164?.Trim();
            if (string.IsNullOrWhiteSpace(rawWhatsApp))
            {
                rawWhatsApp = waSender.SupportInboxPhoneE164?.Trim() ?? string.Empty;
            }

            var digits = new string(rawWhatsApp.Where(char.IsDigit).ToArray());
            whatsAppLink = digits.Length >= 8 ? $"https://wa.me/{digits}" : null;
            whatsAppDisplay = digits.Length >= 8 ? FormatE164ForDisplay(digits) : null;
        }

        var email = borderBox.SupportEmail?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            email = null;
        }

        return new SupportContactDto(whatsAppLink, whatsAppDisplay, email);
    }

    private static string? NormalizeWaMeLink(string? raw)
    {
        var trimmed = raw?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return null;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            return null;
        }

        if (!uri.Host.Equals("wa.me", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var path = uri.AbsolutePath;
        if (string.IsNullOrEmpty(path) || path == "/")
        {
            return null;
        }

        return $"https://wa.me{path}";
    }

    private static string FormatE164ForDisplay(string digits) =>
        digits.Length switch
        {
            >= 10 => "+" + digits,
            _ => digits,
        };

    private static SupportTicketSummaryDto MapTicket(Domain.SupportTickets.SupportTicket t) =>
        new(
            t.Id.Value,
            $"SUP-{t.Id.Value.ToString("N")[..5].ToUpperInvariant()}",
            t.Subject,
            t.Body.Length > 120 ? t.Body[..117] + "…" : t.Body,
            t.Status.ToString(),
            t.CreatedAtUtc);
}
