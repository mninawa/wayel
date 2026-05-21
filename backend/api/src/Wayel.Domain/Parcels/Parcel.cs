using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Parcels;

public sealed class Parcel : AggregateRoot<ParcelId>
{
    private Parcel(ParcelId id, UserId userId, string suiteNumber, string retailer, string? trackingNumber, ParcelStatus status, decimal? weightKg)
        : base(id)
    {
        UserId = userId;
        SuiteNumber = suiteNumber;
        Retailer = retailer;
        TrackingNumber = trackingNumber;
        Status = status;
        WeightKg = weightKg;
        ReceivedAtUtc = DateTime.UtcNow;
    }

    public UserId UserId { get; }
    public string SuiteNumber { get; }
    public string Retailer { get; }
    public string? TrackingNumber { get; }
    public ParcelStatus Status { get; private set; }
    public decimal? WeightKg { get; }
    public DateTime ReceivedAtUtc { get; private set; }

    public static Parcel Receive(UserId userId, string suiteNumber, string retailer, string? trackingNumber, decimal? weightKg) =>
        new(ParcelId.New(), userId, suiteNumber, retailer, trackingNumber, ParcelStatus.Received, weightKg);

    public static Parcel Rehydrate(ParcelId id, UserId userId, string suiteNumber, string retailer, string? trackingNumber,
        ParcelStatus status, decimal? weightKg, DateTime receivedAtUtc) =>
        new(id, userId, suiteNumber, retailer, trackingNumber, status, weightKg) { ReceivedAtUtc = receivedAtUtc };
}
