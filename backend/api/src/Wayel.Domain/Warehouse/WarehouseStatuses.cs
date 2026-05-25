namespace Wayel.Domain.Warehouse;

public static class ParcelWarehouseStatuses
{
    public const string NotStored = "NOT_STORED";
    public const string Stored = "STORED";
    public const string OnHold = "ON_HOLD";
    public const string AllocatedToShipment = "ALLOCATED_TO_SHIPMENT";
    public const string PickingPending = "PICKING_PENDING";
    public const string Picked = "PICKED";
    public const string PackingPending = "PACKING_PENDING";
    public const string Packed = "PACKED";
    public const string DispatchStaging = "DISPATCH_STAGING";
    public const string Dispatched = "DISPATCHED";
}

public static class WarehouseLocationStatuses
{
    public const string Active = "ACTIVE";
    public const string Full = "FULL";
    public const string Disabled = "DISABLED";
    public const string HoldArea = "HOLD_AREA";
    public const string PackingArea = "PACKING_AREA";
    public const string DispatchArea = "DISPATCH_AREA";
}

public static class PickTaskStatuses
{
    public const string Pending = "PENDING";
    public const string Assigned = "ASSIGNED";
    public const string InProgress = "IN_PROGRESS";
    public const string PartiallyPicked = "PARTIALLY_PICKED";
    public const string Picked = "PICKED";
    public const string Blocked = "BLOCKED";
    public const string Cancelled = "CANCELLED";
}

public static class PickParcelStatuses
{
    public const string PickPending = "PICK_PENDING";
    public const string Picked = "PICKED";
}

public static class PackingTaskStatuses
{
    public const string Pending = "PENDING";
    public const string InProgress = "IN_PROGRESS";
    public const string Packed = "PACKED";
    public const string VarianceReview = "VARIANCE_REVIEW";
    public const string Blocked = "BLOCKED";
}

public static class DispatchStagingStatuses
{
    public const string ReadyForDispatch = "READY_FOR_DISPATCH";
    public const string AwaitingCourier = "AWAITING_COURIER";
    public const string InManifest = "IN_MANIFEST";
    public const string Dispatched = "DISPATCHED";
    public const string Blocked = "BLOCKED";
}

public static class ManifestStatuses
{
    public const string Draft = "DRAFT";
    public const string Ready = "READY";
    public const string Printed = "PRINTED";
    public const string HandedOver = "HANDED_OVER";
    public const string Cancelled = "CANCELLED";
}

public static class WarehouseMovementTypes
{
    public const string InitialStorage = "Initial Storage";
    public const string ToPicking = "To Picking";
    public const string ToPacking = "To Packing";
    public const string ToDispatchStaging = "To Dispatch Staging";
    public const string ToHold = "To Hold";
    public const string Relocate = "Relocate";
    public const string CourierHandover = "Courier Handover";
}
