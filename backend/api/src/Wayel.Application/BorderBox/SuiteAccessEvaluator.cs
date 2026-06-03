using Wayel.Domain.SuiteSubscriptions;

namespace Wayel.Application.BorderBox;

public sealed record SuiteAccessCapabilities(
    bool CanReceiveParcels,
    bool CanUploadInvoices,
    bool CanShipOut,
    bool ShipOutLocked,
    string CustomerMessage);

public static class SuiteAccessEvaluator
{
    public static SuiteAccessCapabilities Evaluate(SuiteSubscription? subscription, DateTime nowUtc)
    {
        subscription?.RefreshStatus(nowUtc);
        var status = subscription?.Status ?? SuiteAccessStatus.PendingPayment;

        return status switch
        {
            SuiteAccessStatus.PendingPayment => new(false, false, false, true,
                "Pay upfront to activate your suite address."),
            SuiteAccessStatus.Active => ActiveCapabilities(subscription),
            SuiteAccessStatus.ExpiringSoon => ExpiringSoonCapabilities(subscription),
            SuiteAccessStatus.Expired => new(true, true, false, true,
                "Suite reserved. Ship-out locked until renewal."),
            SuiteAccessStatus.Suspended => new(false, false, false, true,
                "Contact support."),
            _ => new(false, false, false, true, "Contact support."),
        };
    }

    private static SuiteAccessCapabilities ActiveCapabilities(SuiteSubscription? subscription) =>
        subscription?.AutoRenewEnabled == true
            ? new(true, true, true, false,
                "Suite active. Your card will auto-renew before access lapses.")
            : new(true, true, true, false,
                "Suite active. You can ship when ready.");

    private static SuiteAccessCapabilities ExpiringSoonCapabilities(SuiteSubscription? subscription) =>
        subscription?.AutoRenewEnabled == true
            ? new(true, true, true, false,
                "Auto-renew is scheduled. Your card will be charged before access lapses.")
            : new(true, true, true, false,
                "Renew soon to avoid interruption.");
}
