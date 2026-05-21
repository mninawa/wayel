namespace Wayel.Application.Configuration;

/// <summary>
/// Top-level auth feature flags. Bound from the <c>Auth</c> configuration
/// section. Sibling sub-sections (<c>Auth:Sso</c>, <c>Auth:Session</c>) are
/// bound by their own option types and are intentionally not modelled here
/// — this class is the single switchboard for "what credential paths does
/// the API accept?".
///
/// <para>
/// The default posture is <b>SSO-only</b>:
/// <list type="bullet">
///   <item><description>Production deployments leave <see cref="EnablePasswordSignIn"/> at <c>false</c> so <c>POST /auth/login</c> and <c>POST /auth/register</c> short-circuit with a typed 403 (<c>auth.password_login_disabled</c>).</description></item>
///   <item><description>The host bumps it to <c>true</c> in <c>appsettings.Development.json</c>, and integration tests opt in explicitly via <see cref="AuthOptions"/>.<see cref="EnablePasswordSignIn"/>=<c>true</c> so they keep exercising the password code path.</description></item>
/// </list>
/// </para>
/// </summary>
public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>
    /// When <c>false</c> (production default), the password sign-in
    /// endpoints (<c>/auth/login</c> + <c>/auth/register</c>) accept the
    /// request, audit the attempt, and return <c>403 Forbidden</c> with
    /// the typed code <c>auth.password_login_disabled</c>. SPAs feature-
    /// detect via <c>GET /auth/config</c> and hide the password form when
    /// this is <c>false</c>.
    ///
    /// <para>
    /// Hosts in <c>Development</c> auto-enable this in
    /// <c>Program.cs</c> so <c>@*.test</c> seed users keep working
    /// locally without per-developer config.
    /// </para>
    /// </summary>
    public bool EnablePasswordSignIn { get; init; }
}
