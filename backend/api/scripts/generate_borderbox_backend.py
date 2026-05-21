#!/usr/bin/env python3
"""Generates WeYell persistence, features, and API wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

def w(rel: str, content: str) -> None:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")

# --- More domain enums & entities ---
w("Wayel.Domain/Parcels/ParcelStatus.cs", "namespace Wayel.Domain.Parcels;\n\npublic enum ParcelStatus { Received = 0, AwaitingInvoice = 1, ReadyToShip = 2, InShipment = 3, Delivered = 4 }")
w("Wayel.Domain/ParcelInvoices/InvoiceVerificationStatus.cs", "namespace Wayel.Domain.ParcelInvoices;\n\npublic enum InvoiceVerificationStatus { Pending = 0, Verified = 1, Rejected = 2 }")
w("Wayel.Domain/Shipments/ShipmentStatus.cs", "namespace Wayel.Domain.Shipments;\n\npublic enum ShipmentStatus { Draft = 0, Quoted = 1, AwaitingApproval = 2, Paid = 3, InTransit = 4, Delivered = 5 }")
w("Wayel.Domain/Quotes/QuoteApprovalStatus.cs", "namespace Wayel.Domain.Quotes;\n\npublic enum QuoteApprovalStatus { Pending = 0, Approved = 1, Rejected = 2, Locked = 3 }")
w("Wayel.Domain/Payments/PaymentType.cs", "namespace Wayel.Domain.Payments;\n\npublic enum PaymentType { SuiteAccess = 0, Shipping = 1 }")
w("Wayel.Domain/Payments/PaymentStatus.cs", "namespace Wayel.Domain.Payments;\n\npublic enum PaymentStatus { Pending = 0, Succeeded = 1, Failed = 2 }")
w("Wayel.Domain/SupportTickets/SupportTicketStatus.cs", "namespace Wayel.Domain.SupportTickets;\n\npublic enum SupportTicketStatus { Open = 0, InProgress = 1, Resolved = 2, Closed = 3 }")

w("Wayel.Domain/Addresses/CustomerAddress.cs", '''
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Addresses;

public sealed class CustomerAddress : AggregateRoot<CustomerAddressId>
{
    private CustomerAddress(CustomerAddressId id, UserId userId, string type, string line1, string? line2,
        string city, string province, string country, string postalCode, bool isSuiteAddress)
        : base(id)
    {
        UserId = userId;
        Type = type;
        Line1 = line1;
        Line2 = line2;
        City = city;
        Province = province;
        Country = country;
        PostalCode = postalCode;
        IsSuiteAddress = isSuiteAddress;
    }

    public UserId UserId { get; }
    public string Type { get; }
    public string Line1 { get; }
    public string? Line2 { get; }
    public string City { get; }
    public string Province { get; }
    public string Country { get; }
    public string PostalCode { get; }
    public bool IsSuiteAddress { get; }

    public static CustomerAddress CreateSuite(UserId userId, string suiteNumber, string warehouseLine) =>
        new(CustomerAddressId.New(), userId, "suite", warehouseLine, null, "Johannesburg", "Gauteng", "ZA", "2000", true)
        { SuiteNumber = suiteNumber };

    public string SuiteNumber { get; private set; } = string.Empty;

    public static CustomerAddress Rehydrate(CustomerAddressId id, UserId userId, string type, string line1, string? line2,
        string city, string province, string country, string postalCode, bool isSuiteAddress, string suiteNumber) =>
        new(id, userId, type, line1, line2, city, province, country, postalCode, isSuiteAddress) { SuiteNumber = suiteNumber };
}
''')

w("Wayel.Domain/Parcels/Parcel.cs", '''
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
    public DateTime ReceivedAtUtc { get; }

    public static Parcel Receive(UserId userId, string suiteNumber, string retailer, string? trackingNumber, decimal? weightKg) =>
        new(ParcelId.New(), userId, suiteNumber, retailer, trackingNumber, ParcelStatus.Received, weightKg);

    public static Parcel Rehydrate(ParcelId id, UserId userId, string suiteNumber, string retailer, string? trackingNumber,
        ParcelStatus status, decimal? weightKg, DateTime receivedAtUtc) =>
        new(id, userId, suiteNumber, retailer, trackingNumber, status, weightKg) { ReceivedAtUtc = receivedAtUtc };
}
''')

w("Wayel.Domain/Shipments/Shipment.cs", '''
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Domain.Shipments;

public sealed class Shipment : AggregateRoot<ShipmentId>
{
    private Shipment(ShipmentId id, UserId userId, IReadOnlyList<ParcelId> parcelIds, ShipmentStatus status, string deliveryMethod, string? shipOutLockedReason)
        : base(id)
    {
        UserId = userId;
        ParcelIds = parcelIds;
        Status = status;
        DeliveryMethod = deliveryMethod;
        ShipOutLockedReason = shipOutLockedReason;
    }

    public UserId UserId { get; }
    public IReadOnlyList<ParcelId> ParcelIds { get; }
    public ShipmentStatus Status { get; private set; }
    public string DeliveryMethod { get; }
    public string? ShipOutLockedReason { get; }

    public static Result<Shipment> Create(UserId userId, IReadOnlyList<ParcelId> parcelIds, string deliveryMethod, bool shipOutLocked, string? lockReason)
    {
        if (shipOutLocked)
        {
            return Result.Failure<Shipment>(Error.Forbidden("suite.ship_out_locked", lockReason ?? "Suite access expired."));
        }
        if (parcelIds.Count == 0)
        {
            return Result.Failure<Shipment>(Error.Validation("shipment.parcels_required", "Select at least one parcel."));
        }
        return new Shipment(ShipmentId.New(), userId, parcelIds, ShipmentStatus.Draft, deliveryMethod, null);
    }

    public static Shipment Rehydrate(ShipmentId id, UserId userId, IReadOnlyList<ParcelId> parcelIds, ShipmentStatus status, string deliveryMethod, string? shipOutLockedReason) =>
        new(id, userId, parcelIds, status, deliveryMethod, shipOutLockedReason);
}
''')

w("Wayel.Domain/Quotes/Quote.cs", '''
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;

namespace Wayel.Domain.Quotes;

public sealed class Quote : AggregateRoot<QuoteId>
{
    private Quote(QuoteId id, ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil, QuoteApprovalStatus approvalStatus, string? approvalLockedReason)
        : base(id)
    {
        ShipmentId = shipmentId;
        TotalLandedCost = totalLandedCost;
        ValidUntil = validUntil;
        ApprovalStatus = approvalStatus;
        ApprovalLockedReason = approvalLockedReason;
    }

    public ShipmentId ShipmentId { get; }
    public decimal TotalLandedCost { get; }
    public DateTime ValidUntil { get; }
    public QuoteApprovalStatus ApprovalStatus { get; private set; }
    public string? ApprovalLockedReason { get; }

    public static Quote Create(ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil, bool approvalLocked, string? lockReason) =>
        new(QuoteId.New(), shipmentId, totalLandedCost, validUntil,
            approvalLocked ? QuoteApprovalStatus.Locked : QuoteApprovalStatus.Pending, lockReason);

    public Result Approve(bool approvalLocked, string? lockReason)
    {
        if (approvalLocked)
        {
            return Result.Failure(Error.Forbidden("suite.approval_locked", lockReason ?? "Renew suite access to approve quotes."));
        }
        ApprovalStatus = QuoteApprovalStatus.Approved;
        return Result.Success();
    }

    public static Quote Rehydrate(QuoteId id, ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil,
        QuoteApprovalStatus approvalStatus, string? approvalLockedReason) =>
        new(id, shipmentId, totalLandedCost, validUntil, approvalStatus, approvalLockedReason);
}
''')

# Repo interfaces
for name, entity, extra in [
    ("ISuitePlanRepository", "SuitePlan", "Task<IReadOnlyList<SuitePlan>> ListActiveAsync(CancellationToken cancellationToken = default);\n    Task<SuitePlan?> GetByIdAsync(SuitePlanId id, CancellationToken cancellationToken = default);"),
    ("ISuiteSubscriptionRepository", "SuiteSubscription", "Task<SuiteSubscription?> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default);\n    Task AddAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);\n    Task UpdateAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);"),
    ("ICustomerAddressRepository", "CustomerAddress", "Task<CustomerAddress?> GetSuiteForUserAsync(UserId userId, CancellationToken cancellationToken = default);\n    Task AddAsync(CustomerAddress address, CancellationToken cancellationToken = default);"),
    ("IParcelRepository", "Parcel", "Task<IReadOnlyList<Parcel>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);\n    Task<Parcel?> GetByIdAsync(ParcelId id, CancellationToken cancellationToken = default);\n    Task AddAsync(Parcel parcel, CancellationToken cancellationToken = default);"),
    ("IShipmentRepository", "Shipment", "Task<Shipment?> GetByIdAsync(ShipmentId id, CancellationToken cancellationToken = default);\n    Task AddAsync(Shipment shipment, CancellationToken cancellationToken = default);\n    Task UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default);"),
    ("IQuoteRepository", "Quote", "Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default);\n    Task AddAsync(Quote quote, CancellationToken cancellationToken = default);\n    Task UpdateAsync(Quote quote, CancellationToken cancellationToken = default);"),
]:
    ns = entity.replace("CustomerAddress", "Addresses").replace("SuitePlan", "SuitePlans").replace("SuiteSubscription", "SuiteSubscriptions").replace("Parcel", "Parcels").replace("Shipment", "Shipments").replace("Quote", "Quotes")
    if "SuitePlan" in entity: ns = "SuitePlans"
    elif "SuiteSubscription" in entity: ns = "SuiteSubscriptions"
    elif "CustomerAddress" in entity: ns = "Addresses"
    elif "Parcel" == entity: ns = "Parcels"
    elif "Shipment" in entity: ns = "Shipments"
    elif "Quote" in entity: ns = "Quotes"
    w(f"Wayel.Application/Abstractions/Persistence/{name}.cs", f'''
using Wayel.Domain.{ns};

namespace Wayel.Application.Abstractions.Persistence;

public interface {name}
{{
    {extra}
}}
''')

print("generated domain + repo interfaces")
