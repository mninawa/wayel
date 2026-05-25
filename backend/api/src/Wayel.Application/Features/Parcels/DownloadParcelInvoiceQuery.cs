using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record DownloadParcelInvoiceQuery(Guid ParcelId) : IQuery<ParcelInvoiceFileDto>;

public sealed record ParcelInvoiceFileDto(
    string FileName,
    string ContentType,
    Stream Content,
    string? DownloadUrl);

internal sealed class DownloadParcelInvoiceQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IInvoiceBlobStorage storage) : IQueryHandler<DownloadParcelInvoiceQuery, ParcelInvoiceFileDto>
{
    public async Task<Result<ParcelInvoiceFileDto>> Handle(
        DownloadParcelInvoiceQuery request,
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

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null || parcel.UserId != user.Id)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
        if (invoice is null || string.IsNullOrWhiteSpace(invoice.StorageKey))
        {
            return Error.NotFound("invoice.not_found", "No invoice file for this parcel.");
        }

        // Always stream via API so browser preview/download gets bytes (CDN redirect breaks iframe/blob).
        var stream = await storage.OpenReadAsync(invoice.StorageKey, cancellationToken);
        if (stream is null)
        {
            return Error.NotFound("invoice.file_missing", "Invoice file is not available.");
        }

        return new ParcelInvoiceFileDto(
            invoice.FileName,
            invoice.ContentType ?? "application/octet-stream",
            stream,
            null);
    }
}
