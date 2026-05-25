using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class SupportTicketDocument
{
    public SupportTicketId Id { get; set; }
    public UserId UserId { get; set; }
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public SupportTicketStatus Status { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public static SupportTicketDocument From(SupportTicket t) => new()
    {
        Id = t.Id,
        UserId = t.UserId,
        Subject = t.Subject,
        Body = t.Body,
        Status = t.Status,
        CreatedAtUtc = t.CreatedAtUtc,
    };

    public SupportTicket ToDomain() =>
        SupportTicket.Rehydrate(Id, UserId, Subject, Body, Status, CreatedAtUtc);
}
