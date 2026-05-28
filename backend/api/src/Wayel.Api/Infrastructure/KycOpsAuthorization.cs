using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Wayel.Application.Configuration;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Api.Infrastructure;

public sealed class KycOpsRequirement : IAuthorizationRequirement;

public sealed class KycOpsAuthorizationHandler(IOptions<KycOptions> options)
    : AuthorizationHandler<KycOpsRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        KycOpsRequirement requirement)
    {
        if (context.Resource is not HttpContext http)
        {
            return Task.CompletedTask;
        }

        if (TryAuthenticateOpsBearer(context, http))
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        var kyc = options.Value;
        if (string.IsNullOrWhiteSpace(kyc.OpsApiKey) && kyc.OpsRoleByApiKey.Count == 0)
        {
            return Task.CompletedTask;
        }

        if (!http.Request.Headers.TryGetValue("X-Wayel-Ops-Key", out var provided))
        {
            return Task.CompletedTask;
        }

        var key = provided.ToString();
        if (!IsValidOpsKey(kyc, key))
        {
            return Task.CompletedTask;
        }

        var role = ResolveRole(kyc, key);
        var actor = http.Request.Headers.TryGetValue("X-Wayel-Ops-Actor", out var actorHeader) &&
                    !string.IsNullOrWhiteSpace(actorHeader)
            ? actorHeader.ToString().Trim()
            : role;

        http.Items[OpsHttpContextKeys.Role] = role;
        http.Items[OpsHttpContextKeys.Actor] = actor;
        http.Items[OpsHttpContextKeys.Regions] = OpsRegions.ResolveForRole(role, null);
        context.Succeed(requirement);
        return Task.CompletedTask;
    }

    private static bool TryAuthenticateOpsBearer(AuthorizationHandlerContext context, HttpContext http)
    {
        var principal = context.User;
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return false;
        }

        var opsRole = principal.FindFirst(OpsAuthClaimTypes.Role)?.Value;
        if (string.IsNullOrWhiteSpace(opsRole))
        {
            return false;
        }

        var actor = principal.FindFirst(ClaimTypes.Name)?.Value
            ?? principal.FindFirst("name")?.Value
            ?? principal.FindFirst(ClaimTypes.Email)?.Value
            ?? principal.FindFirst("email")?.Value
            ?? "Ops User";

        var role = opsRole.Trim().ToLowerInvariant();
        var regions = ReadRegionsClaim(principal);
        http.Items[OpsHttpContextKeys.Role] = role;
        http.Items[OpsHttpContextKeys.Actor] = actor;
        http.Items[OpsHttpContextKeys.Regions] = OpsRegions.ResolveForRole(role, regions);
        return true;
    }

    private static IReadOnlyList<string> ReadRegionsClaim(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirst(OpsAuthClaimTypes.Regions)?.Value;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return [];
        }

        return OpsRegions.Normalize(raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static bool IsValidOpsKey(KycOptions kyc, string key) =>
        string.Equals(key, kyc.OpsApiKey, StringComparison.Ordinal) ||
        kyc.OpsRoleByApiKey.ContainsKey(key);

    private static string ResolveRole(KycOptions kyc, string key)
    {
        if (kyc.OpsRoleByApiKey.TryGetValue(key, out var mapped) &&
            !string.IsNullOrWhiteSpace(mapped))
        {
            return mapped.Trim().ToLowerInvariant();
        }

        return string.Equals(key, kyc.OpsApiKey, StringComparison.Ordinal)
            ? "lead"
            : "clerk";
    }
}
