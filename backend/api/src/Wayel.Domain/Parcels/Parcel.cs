using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Parcels;

public sealed class Parcel : AggregateRoot<ParcelId>
{
    private Parcel(
        ParcelId id,
        UserId userId,
        string suiteNumber,
        string retailer,
        string? trackingNumber,
        string itemName,
        string category,
        decimal? declaredValueZar,
        string? dimensionsLabel,
        ParcelStatus status,
        decimal? weightKg,
        DateTime receivedAtUtc)
        : base(id)
    {
        UserId = userId;
        SuiteNumber = suiteNumber;
        Retailer = retailer;
        TrackingNumber = trackingNumber;
        ItemName = itemName;
        Category = category;
        DeclaredValueZar = declaredValueZar;
        DimensionsLabel = dimensionsLabel;
        Status = status;
        WeightKg = weightKg;
        ReceivedAtUtc = receivedAtUtc;
    }

    public UserId UserId { get; private set; }
    public string SuiteNumber { get; private set; }
    public string Retailer { get; }
    public string? TrackingNumber { get; }
    public string ItemName { get; }
    public string Category { get; }
    public decimal? DeclaredValueZar { get; private set; }
    public string? DimensionsLabel { get; private set; }
    public ParcelStatus Status { get; private set; }
    public decimal? WeightKg { get; private set; }
    public DateTime ReceivedAtUtc { get; private set; }

    public static Parcel Receive(
        UserId userId,
        string suiteNumber,
        string retailer,
        string? trackingNumber,
        string itemName,
        string category,
        decimal? declaredValueZar,
        string? dimensionsLabel,
        decimal? weightKg,
        ParcelStatus status = ParcelStatus.Received) =>
        new(
            ParcelId.New(),
            userId,
            suiteNumber,
            retailer,
            trackingNumber,
            itemName,
            category,
            declaredValueZar,
            dimensionsLabel,
            status,
            weightKg,
            DateTime.UtcNow);

    public void MarkReadyToShip() => Status = ParcelStatus.ReadyToShip;

    public Result LinkToCustomer(UserId userId, string suiteNumber)
    {
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            return Result.Failure(Error.Validation("parcel.suite_required", "Suite number is required."));
        }

        UserId = userId;
        SuiteNumber = suiteNumber.Trim();
        return Result.Success();
    }

    public void RebindSuiteNumber(string suiteNumber)
    {
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            throw new ArgumentException("Suite number is required.", nameof(suiteNumber));
        }

        SuiteNumber = suiteNumber.Trim();
    }

    public Result UpdatePhysicalAttributes(
        decimal? weightKg,
        string? dimensionsLabel,
        decimal? declaredValueZar)
    {
        if (Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
        {
            return Result.Failure(
                Error.Validation("parcel.physical_locked", "Physical attributes cannot be changed after ship-out."));
        }

        if (weightKg is < 0)
        {
            return Result.Failure(Error.Validation("parcel.weight_invalid", "Weight must be zero or greater."));
        }

        if (declaredValueZar is < 0)
        {
            return Result.Failure(Error.Validation("parcel.value_invalid", "Declared value must be zero or greater."));
        }

        WeightKg = weightKg;
        DimensionsLabel = string.IsNullOrWhiteSpace(dimensionsLabel) ? null : dimensionsLabel.Trim();
        DeclaredValueZar = declaredValueZar;
        return Result.Success();
    }

    public Result MarkInShipment()
    {
        if (Status is not (ParcelStatus.ReadyToShip or ParcelStatus.Received or ParcelStatus.AwaitingInvoice))
        {
            return Result.Failure(Error.Validation("parcel.not_shippable", "Parcel is not available for shipment."));
        }

        Status = ParcelStatus.InShipment;
        return Result.Success();
    }

    public Result MarkDelivered()
    {
        if (Status != ParcelStatus.InShipment)
        {
            return Result.Failure(Error.Validation("parcel.not_in_shipment", "Parcel is not in an active shipment."));
        }

        Status = ParcelStatus.Delivered;
        return Result.Success();
    }

    public static Parcel Rehydrate(
        ParcelId id,
        UserId userId,
        string suiteNumber,
        string retailer,
        string? trackingNumber,
        string itemName,
        string category,
        decimal? declaredValueZar,
        string? dimensionsLabel,
        ParcelStatus status,
        decimal? weightKg,
        DateTime receivedAtUtc) =>
        new(
            id,
            userId,
            suiteNumber,
            retailer,
            trackingNumber,
            itemName,
            category,
            declaredValueZar,
            dimensionsLabel,
            status,
            weightKg,
            receivedAtUtc);
}
