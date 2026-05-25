using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface IParcelInvoiceRepository
{
    Task<ParcelInvoice?> GetForParcelAsync(ParcelId parcelId, CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<ParcelId, ParcelInvoice>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(ParcelInvoice invoice, CancellationToken cancellationToken = default);

    Task ReplaceAsync(ParcelInvoice invoice, CancellationToken cancellationToken = default);
}
