using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class SuiteNumberPoolEntryDocument
{
    public SuiteNumberPoolEntryId Id { get; set; }
    public string RegionCode { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public SuiteNumberPoolStatus Status { get; set; }
    public UserId? AssignedToUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? AssignedAtUtc { get; set; }
    public DateTime? ReleasedAtUtc { get; set; }

    public static SuiteNumberPoolEntryDocument From(SuiteNumberPoolEntry entry) => new()
    {
        Id = entry.Id,
        RegionCode = entry.RegionCode,
        Number = entry.Number,
        Status = entry.Status,
        AssignedToUserId = entry.AssignedToUserId,
        CreatedAtUtc = entry.CreatedAtUtc,
        AssignedAtUtc = entry.AssignedAtUtc,
        ReleasedAtUtc = entry.ReleasedAtUtc,
    };

    public SuiteNumberPoolEntry ToDomain() =>
        SuiteNumberPoolEntry.Rehydrate(
            Id,
            RegionCode,
            Number,
            Status,
            AssignedToUserId,
            CreatedAtUtc,
            AssignedAtUtc,
            ReleasedAtUtc);
}
