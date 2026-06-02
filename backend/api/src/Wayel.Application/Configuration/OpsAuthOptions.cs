namespace Wayel.Application.Configuration;

public sealed class OpsAuthOptions
{
    public const string SectionName = "OpsAuth";

    /// <summary>
    /// Emails that receive a bootstrap <c>lead</c> invitation on startup when no ops user exists yet.
    /// First sign-in still requires the invite link (logged on API startup).
    /// </summary>
    public List<string> BootstrapLeadEmails { get; init; } = [];

    /// <summary>JWT audience for warehouse ops access tokens.</summary>
    public string JwtAudience { get; init; } = "wayel-ops";
}
