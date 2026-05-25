using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record ParcelOpsPhoto(
    Guid Id,
    ParcelId ParcelId,
    string Category,
    string FileName,
    string ContentType,
    string StorageKey,
    DateTime UploadedAtUtc,
    string? UploadedBy);

public interface IParcelOpsPhotoRepository
{
    Task AddAsync(ParcelOpsPhoto photo, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ParcelOpsPhoto>> ListForParcelAsync(
        ParcelId parcelId,
        string? category,
        CancellationToken cancellationToken = default);

    Task<ParcelOpsPhoto?> GetByIdAsync(Guid photoId, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid photoId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, Guid>> ListLatestPhotoIdByParcelIdsAsync(
        IReadOnlyList<Guid> parcelIds,
        CancellationToken cancellationToken = default);
}
