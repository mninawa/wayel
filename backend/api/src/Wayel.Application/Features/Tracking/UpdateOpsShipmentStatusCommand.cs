using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

public sealed record UpdateOpsShipmentStatusCommand(
    Guid ShipmentId,
    string Status,
    string? Location,
    string? Details) : ICommand<UpdateOpsShipmentStatusResultDto>;

internal sealed class UpdateOpsShipmentStatusCommandHandler(
    IShipmentRepository shipments,
    ShipmentTrackingEventWriter trackingEvents,
    IClock clock) : ICommandHandler<UpdateOpsShipmentStatusCommand, UpdateOpsShipmentStatusResultDto>
{
    public async Task<Result<UpdateOpsShipmentStatusResultDto>> Handle(
        UpdateOpsShipmentStatusCommand request,
        CancellationToken cancellationToken)
    {
        var shipmentId = new ShipmentId(request.ShipmentId);
        var shipment = await shipments.GetByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        if (!TryParseStatus(request.Status, out var target))
        {
            return Error.Validation("shipment.invalid_status", "Unsupported shipment status.");
        }

        if (!IsAllowedTransition(shipment.Status, target))
        {
            return Error.Validation(
                "shipment.invalid_transition",
                $"Cannot move shipment from {shipment.Status} to {target}.");
        }

        ApplyStatus(shipment, target);
        await shipments.UpdateAsync(shipment, cancellationToken);

        var eventLabel = await trackingEvents.RecordOpsStatusTransitionAsync(
            shipment,
            target,
            request.Location,
            request.Details,
            cancellationToken);

        return new UpdateOpsShipmentStatusResultDto(
            shipment.Id.Value,
            shipment.Status.ToString(),
            ToStatusLabel(shipment.Status),
            eventLabel,
            clock.UtcNow);
    }

    private static bool TryParseStatus(string raw, out ShipmentStatus status)
    {
        status = default;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return Enum.TryParse(raw.Trim(), ignoreCase: true, out status);
    }

    private static bool IsAllowedTransition(ShipmentStatus from, ShipmentStatus to) =>
        (from, to) switch
        {
            (ShipmentStatus.Paid, ShipmentStatus.InTransit) => true,
            (ShipmentStatus.InTransit, ShipmentStatus.Delivered) => true,
            (ShipmentStatus.Paid, ShipmentStatus.Delivered) => true,
            (ShipmentStatus.Quoted, ShipmentStatus.Paid) => true,
            (ShipmentStatus.AwaitingApproval, ShipmentStatus.Paid) => true,
            _ => false,
        };

    private static void ApplyStatus(Shipment shipment, ShipmentStatus target)
    {
        switch (target)
        {
            case ShipmentStatus.Paid:
                shipment.MarkPaid();
                break;
            case ShipmentStatus.InTransit:
                shipment.MarkInTransit();
                break;
            case ShipmentStatus.Delivered:
                shipment.MarkDelivered();
                break;
        }
    }

    private static string ToStatusLabel(ShipmentStatus status) =>
        status switch
        {
            ShipmentStatus.InTransit => "In Transit",
            ShipmentStatus.Delivered => "Delivered",
            ShipmentStatus.Paid => "Paid — preparing dispatch",
            ShipmentStatus.AwaitingApproval => "Awaiting approval",
            ShipmentStatus.Quoted => "Quoted",
            ShipmentStatus.Draft => "Draft",
            _ => status.ToString(),
        };
}
