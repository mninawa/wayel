namespace Wayel.Domain.SuiteSubscriptions;

/// <summary>Suite access lifecycle per WeYell Phase 1 spec.</summary>
public enum SuiteAccessStatus
{
    PendingPayment = 0,
    Active = 1,
    ExpiringSoon = 2,
    Expired = 3,
    Suspended = 4,
}
