using Wayel.Domain.Common;

namespace Wayel.Domain.SupportTickets;

public readonly record struct SupportTicketId(Guid Value) : IStronglyTypedId
{
    public static SupportTicketId New() => new(StronglyTypedId.NewId());
}
