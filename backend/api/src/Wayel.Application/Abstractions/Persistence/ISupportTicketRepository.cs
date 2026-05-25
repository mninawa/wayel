using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISupportTicketRepository
{
    Task<SupportTicket?> GetByIdAsync(SupportTicketId id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SupportTicket>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(SupportTicket ticket, CancellationToken cancellationToken = default);
}
