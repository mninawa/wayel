using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.SupportTickets;

public sealed class SupportTicket : AggregateRoot<SupportTicketId>
{
    private SupportTicket(
        SupportTicketId id,
        UserId userId,
        string subject,
        string body,
        SupportTicketStatus status,
        DateTime createdAtUtc)
        : base(id)
    {
        UserId = userId;
        Subject = subject;
        Body = body;
        Status = status;
        CreatedAtUtc = createdAtUtc;
    }

    public UserId UserId { get; }
    public string Subject { get; }
    public string Body { get; }
    public SupportTicketStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; }

    public static SupportTicket Open(UserId userId, string subject, string body, DateTime createdAtUtc) =>
        new(SupportTicketId.New(), userId, subject.Trim(), body.Trim(), SupportTicketStatus.Open, createdAtUtc);

    public static SupportTicket Rehydrate(
        SupportTicketId id,
        UserId userId,
        string subject,
        string body,
        SupportTicketStatus status,
        DateTime createdAtUtc) =>
        new(id, userId, subject, body, status, createdAtUtc);
}
