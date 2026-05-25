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
    IOptions<BorderBoxOptions> borderBoxOptions) : IQueryHandler<GetTrackingSupportOverviewQuery, TrackingSupportOverviewDto>
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
            Support: BuildSupportContact(borderBoxOptions.Value));
    }

    private static Shipment? PickActiveShipment(IReadOnlyList<Shipment> items) =>
        items.FirstOrDefault(s => s.Status == ShipmentStatus.InTransit)
        ?? items.FirstOrDefault(s => s.Status is ShipmentStatus.AwaitingApproval or ShipmentStatus.Paid)
        ?? items.FirstOrDefault(s => s.Status != ShipmentStatus.Draft);

    private static SupportContactDto BuildSupportContact(BorderBoxOptions options)
    {
        var rawWhatsApp = options.SupportWhatsAppE164?.Trim() ?? string.Empty;
        var digits = new string(rawWhatsApp.Where(char.IsDigit).ToArray());
        var whatsAppLink = digits.Length >= 8 ? $"https://wa.me/{digits}" : null;
        var whatsAppDisplay = digits.Length >= 8 ? FormatE164ForDisplay(digits) : null;

        var email = options.SupportEmail?.Trim();
        if (string.IsNullOrWhiteSpace(email))
        {
            email = null;
        }

        return new SupportContactDto(whatsAppLink, whatsAppDisplay, email);
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
