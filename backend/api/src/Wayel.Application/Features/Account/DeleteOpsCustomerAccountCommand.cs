using System.Globalization;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Auditing;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

/// <summary>
/// Hard-deletes a customer account (and everything they own) from ops.
/// The caller MUST supply the customer's e-mail address as a typed
/// confirmation token — a guardrail against accidental deletion when the
/// wrong row is clicked in the UI.
/// </summary>
public sealed record DeleteOpsCustomerAccountCommand(
    Guid UserId,
    string ConfirmEmail) : ICommand<DeleteCustomerAccountResultDto>;

public sealed record DeleteCustomerAccountResultDto(
    Guid UserId,
    string Email,
    string DisplayName,
    DateTime DeletedAtUtc,
    bool UserDeleted,
    long TotalDependents,
    DeletedCounts Counts);

public sealed record DeletedCounts(
    long Parcels,
    long Shipments,
    long Quotes,
    long Invoices,
    long Notifications,
    long SupportTickets,
    long Addresses,
    long SuiteSubscriptions,
    long PaymentRecords,
    long KycSubmissions,
    long TrackingEvents,
    long WarehouseMovements,
    long OtherDependents);

internal sealed class DeleteOpsCustomerAccountCommandHandler(
    IUserRepository users,
    ICustomerAccountEraser eraser,
    IAuditLogger auditLogger,
    IOpsCallerContext caller,
    IClock clock,
    ILogger<DeleteOpsCustomerAccountCommandHandler> logger)
    : ICommandHandler<DeleteOpsCustomerAccountCommand, DeleteCustomerAccountResultDto>
{
    public async Task<Result<DeleteCustomerAccountResultDto>> Handle(
        DeleteOpsCustomerAccountCommand request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "Customer not found.");
        }

        // Ops staff carry a customer role too; refuse to delete anything that
        // isn't a regular customer through this endpoint. Ops users live in
        // a different collection and should be removed via the team-settings
        // workflow.
        if (user.Role != UserRole.Customer)
        {
            return Error.Validation(
                "user.not_customer",
                "This endpoint can only delete customer accounts.");
        }

        var supplied = (request.ConfirmEmail ?? string.Empty).Trim();
        if (!string.Equals(supplied, user.Email.Value, StringComparison.OrdinalIgnoreCase))
        {
            return Error.Validation(
                "user.confirm_email_mismatch",
                "Confirmation email does not match the customer's account email.");
        }

        var snapshotEmail = user.Email.Value;
        var snapshotDisplayName = user.DisplayName;
        var report = await eraser.EraseAsync(userId, cancellationToken);

        var deletedAt = clock.UtcNow;

        try
        {
            await auditLogger.WriteAsync(
                new AuditEntry
                {
                    Action = "customer.account.deleted",
                    Outcome = AuditOutcome.Succeeded,
                    OccurredOnUtc = deletedAt,
                    ActorUserId = null,
                    ActorEmail = caller.Actor,
                    Audience = "Admin",
                    Metadata = new Dictionary<string, string?>
                    {
                        ["target.userId"] = userId.Value.ToString(),
                        ["target.email"] = snapshotEmail,
                        ["target.displayName"] = snapshotDisplayName,
                        ["counts.parcels"] = report.Parcels.ToString(CultureInfo.InvariantCulture),
                        ["counts.shipments"] = report.Shipments.ToString(CultureInfo.InvariantCulture),
                        ["counts.quotes"] = report.Quotes.ToString(CultureInfo.InvariantCulture),
                        ["counts.totalDependents"] = report.TotalDependents.ToString(CultureInfo.InvariantCulture),
                    },
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Audit log write failed for customer deletion {UserId} — cascade already applied.",
                userId.Value);
        }

        var paymentRecords = report.SuiteCheckoutPayments
            + report.QuoteCheckoutPayments
            + report.QuotePaymentInvoices;

        var otherDependents = report.ExternalIdentities
            + report.RefreshTokens
            + report.ParcelOpsMetadata
            + report.ParcelOpsExceptions
            + report.ParcelOpsActivity
            + report.ParcelOpsPhotos
            + report.OpsPhotoUploadSessions
            + report.QuoteParcels
            + report.ShipmentCollections
            + report.PickTasks
            + report.PackingTasks
            + report.KycDocumentUploadSessions;

        var counts = new DeletedCounts(
            Parcels: report.Parcels,
            Shipments: report.Shipments,
            Quotes: report.Quotes,
            Invoices: report.ParcelInvoices,
            Notifications: report.InAppNotifications,
            SupportTickets: report.SupportTickets,
            Addresses: report.Addresses,
            SuiteSubscriptions: report.SuiteSubscriptions,
            PaymentRecords: paymentRecords,
            KycSubmissions: report.KycSubmissions,
            TrackingEvents: report.ShipmentTrackingEvents,
            WarehouseMovements: report.WarehouseMovements,
            OtherDependents: otherDependents);

        return new DeleteCustomerAccountResultDto(
            UserId: userId.Value,
            Email: snapshotEmail,
            DisplayName: snapshotDisplayName,
            DeletedAtUtc: deletedAt,
            UserDeleted: report.UserDeleted,
            TotalDependents: report.TotalDependents,
            Counts: counts);
    }
}
