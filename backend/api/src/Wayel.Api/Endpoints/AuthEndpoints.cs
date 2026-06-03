using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Wayel.Api.Infrastructure;
using Wayel.Application.Abstractions.Auditing;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Auth.Login;
using Wayel.Application.Features.Auth.Logout;
using Wayel.Application.Features.Auth.Me;
using Wayel.Application.Features.Auth.RefreshAccessToken;
using Wayel.Application.Features.Auth.Register;
using Wayel.Application.Features.Auth.SsoSignInGoogle;
using Wayel.Domain.Common;
using Wayel.Infrastructure.Persistence.Mongo.Seed;

namespace Wayel.Api.Endpoints;

public sealed class AuthEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/auth").WithTags("Auth");

        // Password sign-in posture (see AuthOptions):
        //   • Production default: disabled. The /login and /register
        //     endpoints are still mapped so OpenAPI documents them, but
        //     the handler short-circuits with a typed 403 carrying the
        //     code `auth.password_login_disabled`. SPAs feature-detect
        //     against /auth/config and hide the password form.
        //   • Development host or `Auth:EnablePasswordSignIn=true`: the
        //     real handler runs, exercising the credential code path.
        // The typed 403 (instead of the previous "endpoint not mapped"
        // posture, which surfaced as a confusing 404) gives operators
        // and the SPAs a clear policy signal.
        group.MapPost("/register", async (
                RegisterRequest body,
                HttpContext http,
                IMediator mediator,
                IAuditLogger audit,
                IClock clock,
                IOptions<AuthOptions> auth,
                IHostEnvironment env,
                CancellationToken ct) =>
        {
            if (!IsPasswordSignInEnabled(env, auth.Value))
            {
                var disabled = Result.Failure<AuthSession>(PasswordSignInDisabledError);
                await WriteAuthAuditAsync(
                    audit, clock, http, AuditActions.AuthRegister, disabled,
                    actorEmailOnFailure: body.Email,
                    audience: null,
                    ct: ct);
                return disabled.ToHttpResult();
            }

            var command = new RegisterCommand(
                body.Email,
                body.Password,
                body.DisplayName,
                body.Phone,
                body.Role ?? "parent",
                http.GetClientIp(),
                http.GetUserAgent());
            var result = await mediator.Send(command, ct);

            await WriteAuthAuditAsync(
                audit, clock, http, AuditActions.AuthRegister, result,
                actorEmailOnFailure: body.Email,
                audience: null,
                ct: ct);

            return result.ToHttpResult(value =>
                Results.Created($"/auth/me", value));
        })
        .AllowAnonymous()
        .RequireRateLimiting("auth")
        .WithName("Register")
        .WithSummary("Create a parent account and immediately sign in (gated by Auth:EnablePasswordSignIn)")
        .Accepts<RegisterRequest>("application/json")
        .Produces<AuthSession>(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/login", async (
                LoginRequest body,
                HttpContext http,
                IMediator mediator,
                IAuditLogger audit,
                IClock clock,
                IOptions<AuthOptions> auth,
                IHostEnvironment env,
                CancellationToken ct) =>
        {
            if (!IsPasswordSignInEnabled(env, auth.Value))
            {
                var disabled = Result.Failure<AuthSession>(PasswordSignInDisabledError);
                await WriteAuthAuditAsync(
                    audit, clock, http, AuditActions.AuthLogin, disabled,
                    actorEmailOnFailure: body.Email,
                    audience: null,
                    ct: ct);
                return disabled.ToHttpResult();
            }

            var command = new LoginCommand(body.Email, body.Password, http.GetClientIp(), http.GetUserAgent());
            var result = await mediator.Send(command, ct);

            await WriteAuthAuditAsync(
                audit, clock, http, AuditActions.AuthLogin, result,
                actorEmailOnFailure: body.Email,
                audience: null,
                ct: ct);

            return result.ToHttpResult(value => Results.Ok(value));
        })
        .AllowAnonymous()
        .RequireRateLimiting("auth")
        .WithName("Login")
        .WithSummary("Exchange credentials for an access + refresh token pair (gated by Auth:EnablePasswordSignIn)")
        .Accepts<LoginRequest>("application/json")
        .Produces<AuthSession>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status429TooManyRequests);

        // Public capability probe — anonymous so the SPA can decide
        // whether to render the password form before the user is
        // signed in. Returns the *effective* policy (i.e. honours the
        // Development auto-enable) rather than the raw config.
        group.MapGet("/config", (
                IOptions<AuthOptions> auth,
                IOptions<DemoDataOptions> demoSeed,
                IOptions<TestParcelSeedOptions> testParcels,
                IHostEnvironment env) => Results.Ok(new AuthConfigResponse(
                PasswordSignInEnabled: IsPasswordSignInEnabled(env, auth.Value),
                DemoDataEnabled: SeedFeatureFlags.IsDemoDataEnabled(env, demoSeed.Value),
                TestParcelsEnabled: SeedFeatureFlags.IsTestParcelsEnabled(env, testParcels.Value))))
        .AllowAnonymous()
        .WithName("AuthConfig")
        .WithSummary("Public auth feature flags so SPAs can hide the password form when SSO-only")
        .Produces<AuthConfigResponse>(StatusCodes.Status200OK);

        group.MapPost("/sso/google", async (
                SsoSignInGoogleRequest body,
                HttpContext http,
                IMediator mediator,
                IAuditLogger audit,
                IClock clock,
                CancellationToken ct) =>
        {
            var command = new SsoSignInGoogleCommand(
                body.IdToken,
                body.Audience,
                http.GetClientIp(),
                http.GetUserAgent());
            var result = await mediator.Send(command, ct);

            await WriteAuthAuditAsync(
                audit, clock, http, AuditActions.AuthSsoGoogle, result,
                actorEmailOnFailure: null,
                audience: body.Audience.ToString(),
                ct: ct);

            return result.ToHttpResult(value => Results.Ok(value));
        })
        .AllowAnonymous()
        .RequireRateLimiting("auth")
        .WithName("SsoSignInWithGoogle")
        .WithSummary("Exchange a Google id_token for a Wayel auth session for a given BFF audience")
        .Accepts<SsoSignInGoogleRequest>("application/json")
        .Produces<AuthSession>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/refresh", async (
                RefreshRequest body,
                HttpContext http,
                IMediator mediator,
                IAuditLogger audit,
                IClock clock,
                CancellationToken ct) =>
        {
            var command = new RefreshAccessTokenCommand(body.RefreshToken, http.GetClientIp(), http.GetUserAgent());
            var result = await mediator.Send(command, ct);

            await WriteAuthAuditAsync(
                audit, clock, http, AuditActions.AuthRefresh, result,
                actorEmailOnFailure: null,
                audience: null,
                ct: ct);

            return result.ToHttpResult(value => Results.Ok(value));
        })
        .AllowAnonymous()
        .RequireRateLimiting("auth")
        .WithName("RefreshAccessToken")
        .WithSummary("Rotate a refresh token for a fresh access + refresh pair")
        .Accepts<RefreshRequest>("application/json")
        .Produces<AuthSession>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/logout", async (
                LogoutRequest body,
                HttpContext http,
                IMediator mediator,
                IAuditLogger audit,
                IClock clock,
                ICurrentUser currentUser,
                CancellationToken ct) =>
        {
            var result = await mediator.Send(new LogoutCommand(body.RefreshToken), ct);

            // Logout returns a non-generic Result. Treat "success" as a
            // successful session termination regardless of whether the caller
            // was still authenticated (idempotent by design).
            await audit.WriteAsync(new AuditEntry
            {
                Action = AuditActions.AuthLogout,
                Outcome = result.IsSuccess ? AuditOutcome.Succeeded : AuditOutcome.Failed,
                OccurredOnUtc = clock.UtcNow,
                ActorUserId = currentUser.UserId?.Value,
                ActorEmail = currentUser.Email,
                Ip = http.GetClientIp(),
                UserAgent = http.GetUserAgent(),
                Reason = result.IsSuccess ? null : result.Error.Code,
            }, ct);

            return result.ToHttpResult();
        })
        .AllowAnonymous()
        .WithName("Logout")
        .WithSummary("Revoke the entire session that owns this refresh token")
        .Accepts<LogoutRequest>("application/json")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status400BadRequest);

        group.MapGet("/me", [Authorize] async (IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new MeQuery(), ct);
            return result.ToHttpResult();
        })
        .WithName("Me")
        .WithSummary("Return the current user's profile")
        .Produces<MeResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized);
    }

    /// <summary>
    /// Emits a single audit entry for an auth operation that returned a
    /// <see cref="Result{AuthSession}"/>. On success we record the issued
    /// user + email so operators can answer "who just signed in?" at a
    /// glance. On failure we record the <c>Error.Code</c> as the reason and
    /// — where safe — the email the caller claimed to be.
    /// </summary>
    private static Task WriteAuthAuditAsync(
        IAuditLogger audit,
        IClock clock,
        HttpContext http,
        string action,
        Result<AuthSession> result,
        string? actorEmailOnFailure,
        string? audience,
        CancellationToken ct)
    {
        var entry = new AuditEntry
        {
            Action = action,
            Outcome = result.IsSuccess ? AuditOutcome.Succeeded : AuditOutcome.Failed,
            OccurredOnUtc = clock.UtcNow,
            Audience = audience,
            Ip = http.GetClientIp(),
            UserAgent = http.GetUserAgent(),
            ActorUserId = result.IsSuccess ? result.Value.UserId : null,
            ActorEmail = result.IsSuccess ? result.Value.Email : actorEmailOnFailure,
            Reason = result.IsSuccess ? null : result.Error.Code,
        };

        return audit.WriteAsync(entry, ct);
    }

    /// <summary>
    /// Effective password sign-in policy. Development auto-enables for
    /// developer convenience (so seed `@*.test` users keep working);
    /// every other host honours the `Auth:EnablePasswordSignIn` flag
    /// verbatim.
    /// </summary>
    private static bool IsPasswordSignInEnabled(IHostEnvironment env, AuthOptions options) =>
        env.IsDevelopment() || options.EnablePasswordSignIn;

    /// <summary>
    /// Single-source-of-truth for the wire-level error returned by
    /// <c>/auth/login</c> + <c>/auth/register</c> when password sign-in
    /// is disabled. Code is stable across versions so SPAs and the
    /// mobile app can switch on it without parsing the title.
    /// </summary>
    private static readonly Error PasswordSignInDisabledError = Error.Forbidden(
        "auth.password_login_disabled",
        "Password sign-in is disabled on this deployment. Continue with Google or your operator-issued single sign-on provider.");

    public sealed record LoginRequest(string Email, string Password);

    public sealed record RegisterRequest(
        string Email,
        string Password,
        string DisplayName,
        string? Phone,
        string? Role);

    public sealed record SsoSignInGoogleRequest(string IdToken, SsoAudience Audience);

    public sealed record RefreshRequest(string RefreshToken);

    public sealed record LogoutRequest(string RefreshToken);

    /// <summary>
    /// Public response for <c>GET /auth/config</c>. SPAs read this once
    /// at boot to decide whether to render the email/password form.
    /// More flags (e.g. SSO providers, magic-link policy) can be added
    /// without breaking older clients — they ignore unknown fields.
    /// </summary>
    public sealed record AuthConfigResponse(
        bool PasswordSignInEnabled,
        bool DemoDataEnabled,
        bool TestParcelsEnabled);
}
