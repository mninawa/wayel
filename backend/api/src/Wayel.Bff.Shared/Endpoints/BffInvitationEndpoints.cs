using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;
using Wayel.Bff.Shared.ApiClient;
using Wayel.Bff.Shared.Middleware;
using Wayel.Bff.Shared.Sessions;

namespace Wayel.Bff.Shared.Endpoints;

/// <summary>
/// BFF-side wrappers around the staff-invitation accept flows. The
/// canonical endpoints live on Wayel.Api — these wrappers forward
/// the call server-to-server and, on success, mint a BFF cookie
/// session from the returned <c>AuthSession</c> so the SPA lands in
/// a "fully signed in" state without a follow-up login.
///
/// Why we need a BFF wrapper at all:
///
///   The SPA calls <c>/api/v1/staff-invitations/accept-password</c>
///   anonymously through the YARP reverse proxy. The API mints a
///   real auth session and returns it in the response body, but the
///   BFF cookie pipeline never observes the sign-in (YARP doesn't
///   call <c>SignInAsync</c>), so the next <c>/api/v1/children</c>
///   call sees neither a cookie nor a bearer and 401s.
///
///   By routing through this BFF endpoint we close that gap: same
///   request body, same response body, plus a freshly-set
///   cookie auth ticket the relay middleware can use.
/// </summary>
public static class BffInvitationEndpoints
{
    /// <summary>
    /// Map <c>/bff/invitations/*</c> for the host BFF. Anonymous —
    /// the API still validates the one-shot token and rate-limits the
    /// route, so even if a client hammered this BFF wrapper they'd
    /// get the same protection as on the raw API.
    /// </summary>
    public static IEndpointRouteBuilder MapBffInvitations(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/bff/invitations").WithTags("BFF Invitations");

        group.MapPost("/accept-password", async (
                HttpContext http,
                [FromBody] BffAcceptPasswordRequest body,
                WayelAuthApiClient apiClient,
                BffSessionStore sessionStore,
                ILoggerFactory loggerFactory,
                CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Wayel.Bff.Invitations.AcceptPassword");

            if (body is null
                || string.IsNullOrWhiteSpace(body.Token)
                || string.IsNullOrWhiteSpace(body.Password))
            {
                return Results.Problem(
                    title: "invitation.token_invalid",
                    detail: "Both `token` and `password` are required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    type: "https://wayel.dev/errors/invitation.token_invalid");
            }

            var result = await apiClient.AcceptInvitationWithPasswordAsync(
                body.Token,
                body.Password,
                body.DisplayName,
                ct);

            if (!result.IsSuccess || result.Session is null)
            {
                logger.LogInformation(
                    "Wayel.Api refused accept-password (status={Status}, code={Code}).",
                    (int)result.StatusCode,
                    result.ErrorCode);

                // Pass the API's status + problem code through verbatim so
                // the SPA can keep using the same `code`-driven error map
                // it already has (invitation.expired, invitation.revoked,
                // invitation.email_already_registered, …).
                return Results.Problem(
                    title: result.ErrorCode ?? "invitation.token_invalid",
                    detail: result.ErrorMessage ?? "The invitation could not be accepted.",
                    statusCode: (int)result.StatusCode,
                    type: $"https://wayel.dev/errors/{result.ErrorCode ?? "invitation.token_invalid"}");
            }

            // Mint the cookie session. We mirror exactly what the OIDC
            // exchange does at /bff/auth/login — same scheme, same blob
            // shape, same persistence — so the relay middleware, /bff/me,
            // and CSRF flow all "just work" on the next request.
            var session = AccessTokenRelayMiddleware.MapSession(result.Session);
            var principal = sessionStore.BuildPrincipal(session, CookieAuthenticationDefaults.AuthenticationScheme);
            await http.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                principal,
                new AuthenticationProperties { IsPersistent = true });

            // Mirror the API's wire shape so the SPA can swap between
            // `/api/v1/staff-invitations/accept-password` and this BFF
            // wrapper without changing its response handling.
            return Results.Ok(new BffAcceptPasswordResponse(
                result.Session.AccessToken,
                result.Session.AccessTokenExpiresOnUtc,
                result.Session.RefreshToken,
                result.Session.RefreshTokenExpiresOnUtc,
                result.Session.SessionId,
                result.Session.UserId,
                result.Session.TenantId,
                result.Session.Email,
                result.Session.DisplayName,
                result.Session.Role));
        })
        .AllowAnonymous()
        .WithName("BffAcceptInvitationWithPassword")
        .WithSummary("Accept a staff invitation by setting a password; mints the BFF cookie session on success")
        .Accepts<BffAcceptPasswordRequest>("application/json")
        .Produces<BffAcceptPasswordResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status409Conflict);

        return routes;
    }

    public sealed record BffAcceptPasswordRequest(string Token, string Password, string? DisplayName);

    public sealed record BffAcceptPasswordResponse(
        string AccessToken,
        DateTime AccessTokenExpiresOnUtc,
        string RefreshToken,
        DateTime RefreshTokenExpiresOnUtc,
        string SessionId,
        Guid UserId,
        Guid? TenantId,
        string Email,
        string DisplayName,
        string Role);
}
