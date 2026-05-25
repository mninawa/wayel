using Wayel.Domain.Parcels;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelOpsActivityDocument
{
    public Guid Id { get; set; }
    public ParcelId ParcelId { get; set; }
    public string EventType { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Detail { get; set; }
    public string? Actor { get; set; }
    public DateTime OccurredAtUtc { get; set; }
}
