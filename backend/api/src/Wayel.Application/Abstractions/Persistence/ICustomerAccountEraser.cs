using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

/// <summary>
/// Hard-deletes a customer and every row in the platform that's owned by
/// them — parcels, shipments, quotes and all the dependent records (invoices,
/// ops metadata, tracking events, payments, notifications, KYC submissions,
/// addresses, suite subscriptions, refresh tokens, external identities).
///
/// Implementations MUST be idempotent: re-running for an already-deleted
/// user returns a zero-count report rather than throwing.
///
/// The audit-log collection is intentionally <em>not</em> touched — it's the
/// post-deletion forensic trail.
/// </summary>
public interface ICustomerAccountEraser
{
    Task<CustomerEraseReport> EraseAsync(UserId userId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Counts of every row removed during a customer account erase. Useful for
/// the audit log payload and for confirming the cascade in the ops UI.
/// </summary>
public sealed record CustomerEraseReport
{
    /// <summary>True if a user document existed and was deleted.</summary>
    public bool UserDeleted { get; init; }

    public long ExternalIdentities { get; init; }
    public long RefreshTokens { get; init; }

    public long Addresses { get; init; }
    public long SuiteSubscriptions { get; init; }
    public long SuiteCheckoutPayments { get; init; }

    public long Parcels { get; init; }
    public long ParcelInvoices { get; init; }
    public long ParcelOpsMetadata { get; init; }
    public long ParcelOpsExceptions { get; init; }
    public long ParcelOpsActivity { get; init; }
    public long ParcelOpsPhotos { get; init; }
    public long OpsPhotoUploadSessions { get; init; }
    public long WarehouseMovements { get; init; }
    public long QuoteParcels { get; init; }

    public long Shipments { get; init; }
    public long ShipmentTrackingEvents { get; init; }
    public long ShipmentCollections { get; init; }
    public long PickTasks { get; init; }
    public long PackingTasks { get; init; }

    public long Quotes { get; init; }
    public long QuoteCheckoutPayments { get; init; }
    public long QuotePaymentInvoices { get; init; }

    public long SupportTickets { get; init; }
    public long InAppNotifications { get; init; }
    public long KycSubmissions { get; init; }
    public long KycDocumentUploadSessions { get; init; }
    public long PayLaterIntents { get; init; }

    /// <summary>Sum of every dependent row removed (excluding the User document itself).</summary>
    public long TotalDependents =>
        ExternalIdentities + RefreshTokens
        + Addresses + SuiteSubscriptions + SuiteCheckoutPayments
        + Parcels + ParcelInvoices + ParcelOpsMetadata + ParcelOpsExceptions
        + ParcelOpsActivity + ParcelOpsPhotos + OpsPhotoUploadSessions
        + WarehouseMovements + QuoteParcels
        + Shipments + ShipmentTrackingEvents + ShipmentCollections
        + PickTasks + PackingTasks
        + Quotes + QuoteCheckoutPayments + QuotePaymentInvoices
        + SupportTickets + InAppNotifications
        + KycSubmissions + KycDocumentUploadSessions
        + PayLaterIntents;
}
