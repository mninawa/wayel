namespace Wayel.Domain.SuiteSubscriptions;

/// <summary>Lifecycle state of a suite-number pool entry.</summary>
public enum SuiteNumberPoolStatus
{
    /// <summary>Pre-minted number waiting to be handed out to the next sign-up.</summary>
    Available = 0,

    /// <summary>Currently assigned to a user; cannot be claimed again until released.</summary>
    Assigned = 1,
}
