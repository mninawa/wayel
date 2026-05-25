namespace Wayel.Application.Configuration;

public sealed class OpsAuthOptions
{
    public const string SectionName = "OpsAuth";

    /// <summary>
    /// Emails that are provisioned as <c>lead</c> on startup when no ops user exists yet.
    /// </summary>
    public List<string> BootstrapLeadEmails { get; init; } = [];

    /// <summary>JWT audience for warehouse ops access tokens.</summary>
    public string JwtAudience { get; init; } = "wayel-ops";
}
