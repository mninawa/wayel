using Wayel.Domain.Addresses;
using Wayel.Domain.Identities;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Stable GUIDs per demo persona (prefix a1b2c3d4-e5f6-7890-abcd-ef…).</summary>
internal static class DemoPersonaIds
{
    internal static class NewGoogle
    {
        public static readonly UserId User = Id(0x01);
        public static readonly ExternalIdentityId Google = IdExt(0x01);
    }

    internal static class ReadySuite
    {
        public static readonly UserId User = Id(0x02);
        public static readonly CustomerAddressId Delivery = Addr(0x02);
    }

    internal static class Active
    {
        public static readonly UserId User = Id(0x03);
        public static readonly SuiteSubscriptionId Subscription = Sub(0x03);
        public static readonly CustomerAddressId Suite = Addr(0x03);
        public static readonly CustomerAddressId Delivery = Addr(0x13);
        public static readonly ParcelId P1 = Parcel(0x31);
        public static readonly ParcelId P2 = Parcel(0x32);
        public static readonly ParcelId P3 = Parcel(0x33);
        public static readonly ParcelId P4 = Parcel(0x34);
    }

    internal static class Expiring
    {
        public static readonly UserId User = Id(0x04);
        public static readonly SuiteSubscriptionId Subscription = Sub(0x04);
        public static readonly CustomerAddressId Suite = Addr(0x04);
        public static readonly CustomerAddressId Delivery = Addr(0x14);
        public static readonly ParcelId P1 = Parcel(0x41);
        public static readonly ParcelId P2 = Parcel(0x42);
    }

    internal static class Expired
    {
        public static readonly UserId User = Id(0x05);
        public static readonly SuiteSubscriptionId Subscription = Sub(0x05);
        public static readonly CustomerAddressId Suite = Addr(0x15);
        public static readonly CustomerAddressId Delivery = Addr(0x05);
        public static readonly ParcelId P1 = Parcel(0x51);
        public static readonly ParcelId P2 = Parcel(0x52);
        public static readonly ParcelId P3 = Parcel(0x53);
        public static readonly ParcelId P4 = Parcel(0x54);
        public static readonly ParcelId P5 = Parcel(0x55);
        public static readonly ParcelId P6 = Parcel(0x56);
        public static readonly ShipmentId InTransit = Ship(0x51);
        public static readonly ShipmentId QuoteShip = Ship(0x52);
        public static readonly QuoteId Quote = new(new Guid("a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
        public static readonly SupportTicketId Ticket = TicketIdWrap(0x51);
    }

    internal static class QuoteApproved
    {
        public static readonly UserId User = Id(0x06);
        public static readonly SuiteSubscriptionId Subscription = Sub(0x06);
        public static readonly CustomerAddressId Suite = Addr(0x06);
        public static readonly CustomerAddressId Delivery = Addr(0x16);
        public static readonly ParcelId P1 = Parcel(0x61);
        public static readonly ParcelId P2 = Parcel(0x62);
        public static readonly ShipmentId Shipment = Ship(0x61);
        public static readonly QuoteId Quote = QuoteIdWrap(0x61);
    }

    internal static class Inbox
    {
        public static readonly UserId User = Id(0x07);
        public static readonly SuiteSubscriptionId Subscription = Sub(0x07);
        public static readonly CustomerAddressId Suite = Addr(0x07);
        public static readonly CustomerAddressId Delivery = Addr(0x17);
        public static readonly ParcelId P1 = Parcel(0x71);
        public static readonly ParcelId P2 = Parcel(0x72);
        public static readonly ParcelId P3 = Parcel(0x73);
        public static readonly ParcelId P4 = Parcel(0x74);
        public static readonly ParcelId P5 = Parcel(0x75);
        public static readonly ParcelId P6 = Parcel(0x76);
        public static readonly ParcelId P7 = Parcel(0x77);
        public static readonly ParcelId P8 = Parcel(0x78);
        public static readonly SupportTicketId Ticket1 = TicketIdWrap(0x71);
        public static readonly SupportTicketId Ticket2 = TicketIdWrap(0x72);
    }

    private static UserId Id(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}01010101"));
    private static ExternalIdentityId IdExt(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}02020202"));
    private static CustomerAddressId Addr(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}03030303"));
    private static SuiteSubscriptionId Sub(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}04040404"));
    private static ParcelId Parcel(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}05050505"));
    private static ShipmentId Ship(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}06060606"));
    private static QuoteId QuoteIdWrap(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}07070707"));
    private static SupportTicketId TicketIdWrap(int n) => new(new Guid($"a1b2c3d4-e5f6-7890-abcd-ef{(n):x2}08080808"));

    /// <summary>Legacy quote id used in portal nav deep links.</summary>
    public static readonly QuoteId PortalQuote = Expired.Quote;
}
