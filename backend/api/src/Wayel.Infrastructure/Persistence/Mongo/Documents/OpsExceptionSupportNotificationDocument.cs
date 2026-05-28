using Wayel.Domain.Parcels;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class OpsExceptionSupportNotificationDocument
{
    public ParcelId ParcelId { get; set; }

    public string ExceptionType { get; set; } = "";

    public DateTime NotifiedAtUtc { get; set; }
}
