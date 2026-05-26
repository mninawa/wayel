using Wayel.Domain.Addresses;
using Wayel.Domain.Identities;
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

/// <summary>
/// Bundle of seed rows for a single demo persona. We intentionally do NOT
/// seed parcels / invoices / shipments / quotes any more — those are owned
/// by the real ops "receive parcel" flow and were causing journey tests to
/// run against stale fixtures. Personas keep the user identity, suite
/// subscription, addresses (suite + delivery) and any free-text support
/// tickets so login + onboarding + support flows still work out of the box.
/// </summary>
internal sealed record DemoPersonaSeedBundle(
    string Email,
    string Password,
    DemoJourneyStage Stage,
    string Description,
    User User,
    ExternalIdentityDocument? GoogleIdentity,
    SuiteSubscriptionDocument? Subscription,
    IReadOnlyList<CustomerAddressDocument> Addresses,
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
            BuildNewGoogle(now),
            BuildReadySuite(passwordHash, now),
            BuildActive(passwordHash, quarterlyPlan, now),
            BuildExpiring(passwordHash, monthlyPlan, now),
            BuildExpired(passwordHash, quarterlyPlan, now),
            BuildQuoteApproved(passwordHash, quarterlyPlan, now),
            BuildInbox(passwordHash, quarterlyPlan, now),
        ];
    }

    private static DemoPersonaSeedBundle BuildNewGoogle(DateTime now)
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
            Subscription: null,
            Addresses: [],
            Tickets: []);
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
            GoogleIdentity: null,
            Subscription: null,
            Addresses: [delivery],
            Tickets: []);
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

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ActiveCustomer,
            "Active suite — receive real parcels via ops to populate the dashboard",
            user,
            GoogleIdentity: null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            Tickets: []);
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

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.ExpiringSoon,
            "Suite expiring in a few days — renew banner",
            user,
            GoogleIdentity: null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            Tickets: []);
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

        // Free-text ticket — references "a shipment" generically, no FK risk.
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
            "Expired suite — renew to unlock ship-out",
            user,
            GoogleIdentity: null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
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

        return new DemoPersonaSeedBundle(
            user.Email.Value,
            "demo1234",
            DemoJourneyStage.QuoteApproved,
            "Active suite — kept for journey navigation continuity",
            user,
            GoogleIdentity: null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
            Tickets: []);
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

        var tickets = new[]
        {
            SupportTicket.Rehydrate(
                DemoPersonaIds.Inbox.Ticket1,
                user.Id,
                "Missing parcel scan",
                "I'm following up on a parcel that arrived at the warehouse but still shows awaiting invoice.",
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
            "Active suite — support history kept for ticket-list testing",
            user,
            GoogleIdentity: null,
            SuiteSubscriptionDocument.From(sub),
            [suiteAddr, delivery],
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
}
