using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record CreateSupportTicketCommand(string Subject, string Body)
    : ICommand<SupportTicketSummaryDto>;

internal sealed class CreateSupportTicketCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISupportTicketRepository tickets,
    IUnitOfWork unitOfWork,
    IClock clock,
    IBorderBoxWhatsAppNotifier whatsApp) : ICommandHandler<CreateSupportTicketCommand, SupportTicketSummaryDto>
{
    public async Task<Result<SupportTicketSummaryDto>> Handle(
        CreateSupportTicketCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Body))
        {
            return Error.Validation("ticket.invalid", "Subject and message are required.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var ticket = SupportTicket.Open(user.Id, request.Subject, request.Body, clock.UtcNow);
        await tickets.AddAsync(ticket, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var ticketRef = $"SUP-{ticket.Id.Value.ToString("N")[..5].ToUpperInvariant()}";
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);

        await whatsApp.ForwardSupportTicketToInboxAsync(
            user,
            subscription?.SuiteNumber,
            ticketRef,
            ticket.Subject,
            ticket.Body,
            cancellationToken);
        await whatsApp.NotifySupportTicketOpenedAsync(user, ticketRef, ticket.Subject, cancellationToken);

        return new SupportTicketSummaryDto(
            ticket.Id.Value,
            ticketRef,
            ticket.Subject,
            ticket.Body.Length > 120 ? ticket.Body[..117] + "…" : ticket.Body,
            ticket.Status.ToString(),
            ticket.CreatedAtUtc);
    }
}
