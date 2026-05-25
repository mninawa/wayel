using Wayel.Domain.Parcels;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelOpsExceptionDocument
{
    public ParcelId ParcelId { get; set; }
    public string ExceptionType { get; set; } = "";
    public string Status { get; set; } = "NEW";
    public string? AssignedTo { get; set; }
    public string? EscalatedTo { get; set; }
    public string? Notes { get; set; }
    public DateTime? DueAtUtc { get; set; }
    public DateTime? EscalatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}
