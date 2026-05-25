using Wayel.Domain.Addresses;
using Wayel.Domain.Identities;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

internal enum DemoJourneyStage
{
    NewGoogleSignup,
    ProfileReadyForSuite,
    ActiveCustomer,
    ExpiringSoon,
    ExpiredSuite,
    QuoteApproved,
    HighVolumeInbox,
}

internal sealed record DemoPersonaSeedBundle(
    string Email,
    string Password,
    DemoJourneyStage Stage,
    string Description,
    User User,
    ExternalIdentityDocument? GoogleIdentity,
    SuiteSubscriptionDocument? Subscription,
    IReadOnlyList<CustomerAddressDocument> Addresses,
    IReadOnlyList<ParcelDocument> Parcels,
    IReadOnlyList<ParcelInvoiceDocument> Invoices,
    IReadOnlyList<ShipmentDocument> Shipments,
    IReadOnlyList<QuoteDocument> Quotes,
    IReadOnlyList<SupportTicketDocument> Tickets);

internal static class DemoPersonaSeedBuilder
{
    public static IReadOnlyList<DemoPersonaSeedBundle> BuildAll(
        string passwordHash,
        SuitePlanDocument quarterlyPlan,
        SuitePlanDocument monthlyPlan,
        DateTime now)
    {
        return
        [
            BuildNewGoogle(passwordHash, now),
            BuildReadySuite(passwordHash, now),
            BuildActive(passwordHash, quarterlyPlan, now),
            BuildExpiring(passwordHash, monthlyPlan, now),
            BuildExpired(passwordHash, quarterlyPlan, now),
            BuildQuoteApproved(passwordHash, quarterlyPlan, now),
            BuildInbox(passwordHash, quarterlyPlan, now),
        ];
    }

    private static DemoPersonaSeedBundle BuildNewGoogle(string passwordHash, DateTime now)
    {
        var user = User.Rehydrate(
            DemoPersonaIds.NewGoogle.User,
            Email("new.google@weyell.demo"),
            User.SsoOnlyPasswordSentinel,
            "Alex Mokoena",
            null,
            "SZ",
            KycStatus.NotStarted,
            UserRole.Customer,
            false,
            now.AddDays(-1),
            null,
            "Alex",
            "Mokoena",
            string.Empty,
            string.Empty,
            string.Empty,
            notifyEmail: true,
            notifySms: false,
            notifyWhatsApp: false,
            notifyMarketing: false);

        var google = ExternalIdentityDocument.FromDomain(
            ExternalIdentity.Rehydrate(
                DemoPersonaIds.NewGoogle.Google,
                user.Id,
                IdentityProvider.Google,
                "google-sub-alex-mokoena",
                user.Email.Value,
                now.AddDays(-1),
                null));

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.NewGoogleSignup,
            "Just signed in with Google → complete profile",
            user,
            google,
            null,
            [],
            [],
            [],
            [],
            [],
            []);
    }

    private static DemoPersonaSeedBundle BuildReadySuite(string passwordHash, DateTime now)
    {
        var user = BuildUser(
            DemoPersonaIds.ReadySuite.User,
            "ready.suite@weyell.demo",
            passwordHash,
            "Nomsa Dube",
            "+268 76 222 3344",
            "7602025432109",
            now.AddMonths(-1));

        var delivery = DeliveryAddress(
            DemoPersonaIds.ReadySuite.Delivery,
            user.Id,
            "Home",
            "Nomsa Dube",
            "+268 76 222 3344",
            "Plot 8, Sidwashini",
            "Mbabane",
            true);

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ProfileReadyForSuite,
            "Profile complete → choose suite plan & pay",
            user,
            null,
            null,
            [delivery],
            [],
            [],
            [],
            [],
            []);
    }

    private static DemoPersonaSeedBundle BuildActive(
        string passwordHash,
        SuitePlanDocument plan,
        DateTime now)
    {
        const string suite = "24801";
        var user = BuildUser(
            DemoPersonaIds.Active.User,
            "active@weyell.demo",
            passwordHash,
            "Thabo Nkosi",
            "+268 76 333 4455",
            "8003036543210",
            now.AddMonths(-3));

        var sub = SuiteSubscription.Rehydrate(
            DemoPersonaIds.Active.Subscription,
            user.Id,
            plan.Id,
            suite,
            SuiteAccessStatus.Active,
            now.AddMonths(-2),
            now.AddMonths(1));

        var suiteAddr = SuiteAddress(DemoPersonaIds.Active.Suite, user.Id, suite, user.DisplayName);
        var delivery = DeliveryAddress(
            DemoPersonaIds.Active.Delivery,
            user.Id,
            "Home",
            user.DisplayName,
            user.Phone!,
            "12 Main St, Manzini",
            "Manzini",
            true);

        var parcels = new[]
        {
            MakeParcel(DemoPersonaIds.Active.P1, user.Id, suite, "Takealot", "BRC200012301ZA", "Logitech MX Keys", "Electronics", 1899m, "40x20x5", 0.9m, ParcelStatus.ReadyToShip, now.AddDays(-3)),
            MakeParcel(DemoPersonaIds.Active.P2, user.Id, suite, "Superbalist", "BRC200012302ZA", "Running Shoes", "Footwear", 1299m, "35x25x12", 1.1m, ParcelStatus.ReadyToShip, now.AddDays(-4)),
            MakeParcel(DemoPersonaIds.Active.P3, user.Id, suite, "Makro", "BRC200012303ZA", "Kettle 1.7L", "Homeware", 499m, "25x20x20", 1.5m, ParcelStatus.AwaitingInvoice, now.AddDays(-2)),
            MakeParcel(DemoPersonaIds.Active.P4, user.Id, suite, "Zando", "BRC200012304ZA", "Summer Dress", "Clothing", 650m, "30x22x4", 0.4m, ParcelStatus.Received, now.AddDays(-5)),
        };

        var invoices = new[]
        {
            Invoice(DemoPersonaIds.Active.P1, user.Id, suite, "takealot-mx.pdf", 180_000, now.AddDays(-2)),
            Invoice(DemoPersonaIds.Active.P2, user.Id, suite, "superbalist-shoes.pdf", 210_000, now.AddDays(-3)),
        };

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ActiveCustomer,
            "Active suite — create shipments, upload invoices",
            user,
            null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            parcels.Select(ParcelDocument.From).ToList(),
            invoices.Select(ParcelInvoiceDocument.From).ToList(),
            [],
            [],
            []);
    }

    private static DemoPersonaSeedBundle BuildExpiring(
        string passwordHash,
        SuitePlanDocument plan,
        DateTime now)
    {
        const string suite = "24802";
        var user = BuildUser(
            DemoPersonaIds.Expiring.User,
            "expiring@weyell.demo",
            passwordHash,
            "Zanele Maseko",
            "+268 76 444 5566",
            "9004047654321",
            now.AddMonths(-4));

        var sub = SuiteSubscription.Rehydrate(
            DemoPersonaIds.Expiring.Subscription,
            user.Id,
            plan.Id,
            suite,
            SuiteAccessStatus.ExpiringSoon,
            now.AddMonths(-1),
            now.AddDays(4));

        var suiteAddr = SuiteAddress(DemoPersonaIds.Expiring.Suite, user.Id, suite, user.DisplayName);
        var delivery = DeliveryAddress(
            DemoPersonaIds.Expiring.Delivery,
            user.Id,
            "Office",
            user.DisplayName,
            user.Phone!,
            "Matsapha Industrial",
            "Matsapha",
            true);

        var parcels = new[]
        {
            MakeParcel(DemoPersonaIds.Expiring.P1, user.Id, suite, "Woolworths", "BRC200012401ZA", "Baby Formula x3", "Groceries", 720m, "30x20x15", 2.1m, ParcelStatus.ReadyToShip, now.AddDays(-6)),
            MakeParcel(DemoPersonaIds.Expiring.P2, user.Id, suite, "Takealot", "BRC200012402ZA", "Tablet Stand", "Electronics", 399m, "28x15x8", 0.6m, ParcelStatus.Received, now.AddDays(-7)),
        };

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ExpiringSoon,
            "Suite expiring in a few days — renew banner",
            user,
            null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            parcels.Select(ParcelDocument.From).ToList(),
            new[] { Invoice(DemoPersonaIds.Expiring.P1, user.Id, suite, "woolworths.pdf", 95_000, now.AddDays(-5)) }
                .Select(ParcelInvoiceDocument.From)
                .ToList(),
            [],
            [],
            []);
    }

    private static DemoPersonaSeedBundle BuildExpired(
        string passwordHash,
        SuitePlanDocument plan,
        DateTime now)
    {
        const string suite = "24789";
        var user = BuildUser(
            DemoPersonaIds.Expired.User,
            "sabelo@weyell.demo",
            passwordHash,
            "Sabelo Dlamini",
            "+268 76 123 4567",
            "8001011234567",
            now.AddMonths(-6));

        var sub = SuiteSubscription.Rehydrate(
            DemoPersonaIds.Expired.Subscription,
            user.Id,
            plan.Id,
            suite,
            SuiteAccessStatus.Expired,
            now.AddMonths(-4),
            now.AddDays(-5));

        var delivery = DeliveryAddress(
            DemoPersonaIds.Expired.Delivery,
            user.Id,
            "Home",
            user.DisplayName,
            user.Phone!,
            "Plot 42, Matsapha Industrial Site",
            "Manzini",
            true);

        var suiteAddr = SuiteAddress(DemoPersonaIds.Expired.Suite, user.Id, suite, user.DisplayName);

        var parcels = new[]
        {
            MakeParcel(DemoPersonaIds.Expired.P1, user.Id, suite, "Takealot", "BRC100012345ZA", "Sony WH-1000XM5", "Headphones", 2899m, "30x22x15", 0.65m, ParcelStatus.InShipment, now.AddDays(-5)),
            MakeParcel(DemoPersonaIds.Expired.P2, user.Id, suite, "Superbalist", "BRC100012346ZA", "Nike Air Max Excee", "Men's Shoes", 1650m, "35x25x12", 1.2m, ParcelStatus.ReadyToShip, now.AddDays(-6)),
            MakeParcel(DemoPersonaIds.Expired.P3, user.Id, suite, "Makro", "BRC100012347ZA", "Samsung Galaxy Buds2", "Electronics", 1299m, "12x10x8", 0.4m, ParcelStatus.AwaitingInvoice, now.AddDays(-7)),
            MakeParcel(DemoPersonaIds.Expired.P4, user.Id, suite, "Woolworths", "BRC100012348ZA", "Linen Shirt Bundle", "Clothing", 890m, "28x20x6", 0.55m, ParcelStatus.Received, now.AddDays(-8)),
            MakeParcel(DemoPersonaIds.Expired.P5, user.Id, suite, "Zando", "BRC100012349ZA", "Levi's 501 Jeans", "Clothing", 749m, "32x24x8", 0.7m, ParcelStatus.ReadyToShip, now.AddDays(-9)),
            MakeParcel(DemoPersonaIds.Expired.P6, user.Id, suite, "Dis-Chem", "BRC100012350ZA", "Skincare Gift Set", "Health & Beauty", 520m, "22x18x10", 0.85m, ParcelStatus.Received, now.AddDays(-10)),
        };

        var quoteParcels = new[] { DemoPersonaIds.Expired.P2, DemoPersonaIds.Expired.P5 };
        var loaded = parcels.Where(p => quoteParcels.Contains(p.Id)).ToList();
        var declared = loaded.Sum(p => p.DeclaredValueZar ?? 0m);
        var quoteTotal = declared + 240m + Math.Round(declared * 0.15m, 2) * 2 + 165m;

        var inTransit = Shipment.Rehydrate(
            DemoPersonaIds.Expired.InTransit,
            user.Id,
            [DemoPersonaIds.Expired.P1],
            ShipmentStatus.InTransit,
            "Standard Delivery",
            null);

        var quoteShip = Shipment.Rehydrate(
            DemoPersonaIds.Expired.QuoteShip,
            user.Id,
            quoteParcels,
            ShipmentStatus.Quoted,
            "Door-to-Door",
            null);

        var quote = Quote.FromLegacy(
            DemoPersonaIds.Expired.Quote,
            user.Id,
            quoteShip.Id,
            quoteTotal,
            now.AddDays(7),
            QuoteApprovalStatus.Locked,
            "Suite reserved. Ship-out locked until renewal.",
            "Door-to-Door",
            now.AddDays(-3));

        var ticket = SupportTicket.Rehydrate(
            DemoPersonaIds.Expired.Ticket,
            user.Id,
            "Delivery delay inquiry",
            "Hi, I wanted to check on the status of my shipment and expected arrival in Eswatini.",
            SupportTicketStatus.Open,
            now.AddDays(-1));

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ExpiredSuite,
            "Expired suite — renew to unlock ship-out & approve quote",
            user,
            null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            parcels.Select(ParcelDocument.From).ToList(),
            BuildExpiredInvoices(user.Id, suite, now).Select(ParcelInvoiceDocument.From).ToList(),
            [ShipmentDocument.From(inTransit), ShipmentDocument.From(quoteShip)],
            [QuoteDocument.From(quote)],
            [SupportTicketDocument.From(ticket)]);
    }

    private static DemoPersonaSeedBundle BuildQuoteApproved(
        string passwordHash,
        SuitePlanDocument plan,
        DateTime now)
    {
        const string suite = "24803";
        var user = BuildUser(
            DemoPersonaIds.QuoteApproved.User,
            "quote.done@weyell.demo",
            passwordHash,
            "Lungile Khumalo",
            "+268 76 555 6677",
            "8805058765432",
            now.AddMonths(-2));

        var sub = SuiteSubscription.Rehydrate(
            DemoPersonaIds.QuoteApproved.Subscription,
            user.Id,
            plan.Id,
            suite,
            SuiteAccessStatus.Active,
            now.AddMonths(-1),
            now.AddMonths(2));

        var suiteAddr = SuiteAddress(DemoPersonaIds.QuoteApproved.Suite, user.Id, suite, user.DisplayName);
        var delivery = DeliveryAddress(
            DemoPersonaIds.QuoteApproved.Delivery,
            user.Id,
            "Home",
            user.DisplayName,
            user.Phone!,
            "Ezulwini Valley",
            "Ezulwini",
            true);

        var parcels = new[]
        {
            MakeParcel(DemoPersonaIds.QuoteApproved.P1, user.Id, suite, "Takealot", "BRC200012501ZA", "PlayStation Controller", "Electronics", 1099m, "18x15x10", 0.5m, ParcelStatus.InShipment, now.AddDays(-8)),
            MakeParcel(DemoPersonaIds.QuoteApproved.P2, user.Id, suite, "Incredible Connection", "BRC200012502ZA", "USB-C Hub", "Electronics", 899m, "20x12x4", 0.3m, ParcelStatus.InShipment, now.AddDays(-8)),
        };

        var shipment = Shipment.Rehydrate(
            DemoPersonaIds.QuoteApproved.Shipment,
            user.Id,
            [DemoPersonaIds.QuoteApproved.P1, DemoPersonaIds.QuoteApproved.P2],
            ShipmentStatus.AwaitingApproval,
            "Door-to-Door",
            null);

        var declared = parcels.Sum(p => p.DeclaredValueZar ?? 0m);
        var quoteTotal = declared + 240m + Math.Round(declared * 0.15m, 2) * 2 + 165m;
        var quote = Quote.FromLegacy(
            DemoPersonaIds.QuoteApproved.Quote,
            user.Id,
            shipment.Id,
            quoteTotal,
            now.AddDays(10),
            QuoteApprovalStatus.Approved,
            null,
            "Door-to-Door",
            now.AddDays(-2));

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.QuoteApproved,
            "Active suite — quote already approved (payment next)",
            user,
            null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            parcels.Select(ParcelDocument.From).ToList(),
            parcels.Select(p => Invoice(p.Id, user.Id, suite, "invoice.pdf", 100_000, now.AddDays(-6))).Select(ParcelInvoiceDocument.From).ToList(),
            [ShipmentDocument.From(shipment)],
            [QuoteDocument.From(quote)],
            []);
    }

    private static DemoPersonaSeedBundle BuildInbox(
        string passwordHash,
        SuitePlanDocument plan,
        DateTime now)
    {
        const string suite = "24804";
        var user = BuildUser(
            DemoPersonaIds.Inbox.User,
            "inbox@weyell.demo",
            passwordHash,
            "Musa Vilakati",
            "+268 76 666 7788",
            "7706069876543",
            now.AddMonths(-5));

        var sub = SuiteSubscription.Rehydrate(
            DemoPersonaIds.Inbox.Subscription,
            user.Id,
            plan.Id,
            suite,
            SuiteAccessStatus.Active,
            now.AddMonths(-3),
            now.AddMonths(3));

        var suiteAddr = SuiteAddress(DemoPersonaIds.Inbox.Suite, user.Id, suite, user.DisplayName);
        var delivery = DeliveryAddress(
            DemoPersonaIds.Inbox.Delivery,
            user.Id,
            "Home",
            user.DisplayName,
            user.Phone!,
            "Nhlangano Street, Manzini",
            "Manzini",
            true);

        var parcels = new List<Parcel>
        {
            MakeParcel(DemoPersonaIds.Inbox.P1, user.Id, suite, "Takealot", "BRC300010001ZA", "Monitor 27\"", "Electronics", 4999m, "60x40x15", 7.2m, ParcelStatus.ReadyToShip, now.AddDays(-2)),
            MakeParcel(DemoPersonaIds.Inbox.P2, user.Id, suite, "Makro", "BRC300010002ZA", "Rice 10kg", "Groceries", 299m, "40x30x12", 10m, ParcelStatus.Received, now.AddDays(-3)),
            MakeParcel(DemoPersonaIds.Inbox.P3, user.Id, suite, "Superbalist", "BRC300010003ZA", "Handbag", "Accessories", 899m, "35x28x12", 0.8m, ParcelStatus.ReadyToShip, now.AddDays(-4)),
            MakeParcel(DemoPersonaIds.Inbox.P4, user.Id, suite, "Zando", "BRC300010004ZA", "Kids Sneakers", "Footwear", 449m, "32x20x12", 0.9m, ParcelStatus.AwaitingInvoice, now.AddDays(-5)),
            MakeParcel(DemoPersonaIds.Inbox.P5, user.Id, suite, "Woolworths", "BRC300010005ZA", "Coffee Beans 2kg", "Groceries", 380m, "25x18x18", 2m, ParcelStatus.Received, now.AddDays(-6)),
            MakeParcel(DemoPersonaIds.Inbox.P6, user.Id, suite, "Dis-Chem", "BRC300010006ZA", "Vitamins Pack", "Health", 620m, "20x15x15", 0.5m, ParcelStatus.ReadyToShip, now.AddDays(-7)),
            MakeParcel(DemoPersonaIds.Inbox.P7, user.Id, suite, "Takealot", "BRC300010007ZA", "Router WiFi 6", "Electronics", 1899m, "25x20x8", 1.1m, ParcelStatus.Delivered, now.AddDays(-30)),
            MakeParcel(DemoPersonaIds.Inbox.P8, user.Id, suite, "Incredible Connection", "BRC300010008ZA", "Phone Case", "Accessories", 299m, "15x10x3", 0.1m, ParcelStatus.Delivered, now.AddDays(-45)),
        };

        var tickets = new[]
        {
            SupportTicket.Rehydrate(
                DemoPersonaIds.Inbox.Ticket1,
                user.Id,
                "Missing parcel scan",
                "Parcel BRC300010004ZA arrived at warehouse but still shows awaiting invoice.",
                SupportTicketStatus.InProgress,
                now.AddDays(-2)),
            SupportTicket.Rehydrate(
                DemoPersonaIds.Inbox.Ticket2,
                user.Id,
                "Billing question",
                "Can I renew quarterly early and keep the same suite number?",
                SupportTicketStatus.Resolved,
                now.AddDays(-12)),
        };

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.HighVolumeInbox,
            "Active suite — busy parcels list & support history",
            user,
            null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            parcels.Select(ParcelDocument.From).ToList(),
            [],
            [],
            [],
            tickets.Select(SupportTicketDocument.From).ToList());
    }

    private static User BuildUser(
        UserId id,
        string email,
        string passwordHash,
        string displayName,
        string phone,
        string idNumber,
        DateTime created) =>
        User.Rehydrate(
            id,
            Email(email),
            passwordHash,
            displayName,
            phone,
            "SZ",
            KycStatus.Verified,
            UserRole.Customer,
            false,
            created,
            null,
            displayName.Split(' ')[0],
            displayName.Split(' ').Length > 1 ? displayName.Split(' ')[1] : "",
            idNumber,
            "NationalId",
            "Door-to-Door",
            notifyEmail: true,
            notifySms: true,
            notifyWhatsApp: true,
            notifyMarketing: false);

    private static Email Email(string value) => Wayel.Domain.Users.Email.Create(value).Value;

    private static CustomerAddressDocument SuiteAddress(
        CustomerAddressId id,
        UserId userId,
        string suiteNumber,
        string recipient) =>
        CustomerAddressDocument.From(
            CustomerAddress.Rehydrate(
                id,
                userId,
                "suite",
                "Unit 12, Jet Park Warehouse",
                null,
                "Johannesburg",
                "Gauteng",
                "ZA",
                "2000",
                isSuiteAddress: true,
                suiteNumber,
                "SA Suite",
                recipient,
                null,
                false));

    private static CustomerAddressDocument DeliveryAddress(
        CustomerAddressId id,
        UserId userId,
        string label,
        string recipient,
        string phone,
        string line1,
        string city,
        bool isDefault) =>
        CustomerAddressDocument.From(
            CustomerAddress.Rehydrate(
                id,
                userId,
                "delivery",
                line1,
                null,
                city,
                "Manzini Region",
                "SZ",
                string.Empty,
                isSuiteAddress: false,
                suiteNumber: string.Empty,
                label,
                recipient,
                phone,
                isDefault));

    private static Parcel MakeParcel(
        ParcelId id,
        UserId userId,
        string suite,
        string retailer,
        string tracking,
        string item,
        string category,
        decimal value,
        string dims,
        decimal weight,
        ParcelStatus status,
        DateTime received) =>
        Wayel.Domain.Parcels.Parcel.Rehydrate(id, userId, suite, retailer, tracking, item, category, value, dims, status, weight, received);

    private static ParcelInvoice Invoice(
        ParcelId parcelId,
        UserId userId,
        string suiteNumber,
        string fileName,
        long size,
        DateTime uploadedAt)
    {
        var invoice = ParcelInvoice.Upload(parcelId, userId, fileName, size, uploadedAt);
        var suiteFolder = Wayel.Application.Features.Parcels.ParcelInvoiceStoragePaths.SanitizeSuiteFolder(suiteNumber);
        invoice.AttachStorage($"{suiteFolder}/invoices/{parcelId.Value:D}/seed.pdf", "application/pdf");
        return invoice;
    }

    private static IEnumerable<ParcelInvoice> BuildExpiredInvoices(UserId userId, string suiteNumber, DateTime now) =>
    [
        Invoice(DemoPersonaIds.Expired.P1, userId, suiteNumber, "takealot-invoice.pdf", 245_000, now.AddDays(-4)),
        Invoice(DemoPersonaIds.Expired.P2, userId, suiteNumber, "superbalist-invoice.pdf", 198_000, now.AddDays(-5)),
        Invoice(DemoPersonaIds.Expired.P4, userId, suiteNumber, "woolworths-invoice.pdf", 120_000, now.AddDays(-7)),
        Invoice(DemoPersonaIds.Expired.P6, userId, suiteNumber, "dischem-invoice.pdf", 88_000, now.AddDays(-9)),
    ];
}
