using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoOpsExceptionSupportNotificationRepository(MongoContext context)
    : IOpsExceptionSupportNotificationRepository
{
    public async Task<bool> WasNotifiedAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default)
    {
        var type = NormalizeType(exceptionType);
        var count = await context.OpsExceptionSupportNotifications.CountDocumentsAsync(
            x => x.ParcelId == parcelId && x.ExceptionType == type,
            cancellationToken: cancellationToken);
        return count > 0;
    }

    public async Task MarkNotifiedAsync(
        ParcelId parcelId,
        string exceptionType,
        DateTime notifiedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var type = NormalizeType(exceptionType);
        var doc = new OpsExceptionSupportNotificationDocument
        {
            ParcelId = parcelId,
            ExceptionType = type,
            NotifiedAtUtc = notifiedAtUtc,
        };

        await context.OpsExceptionSupportNotifications.ReplaceOneAsync(
            x => x.ParcelId == parcelId && x.ExceptionType == type,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    public Task ClearAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default)
    {
        var type = NormalizeType(exceptionType);
        return context.OpsExceptionSupportNotifications.DeleteOneAsync(
            x => x.ParcelId == parcelId && x.ExceptionType == type,
            cancellationToken);
    }

    private static string NormalizeType(string exceptionType) =>
        exceptionType.Trim().ToUpperInvariant();
}
