using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Users;

namespace Wayel.Api.Infrastructure;

public static class AuthorizationPolicies
{
    public const string AuthenticatedUser = "AuthenticatedUser";
    public const string CustomerOnly = "CustomerOnly";
    public const string KycOps = "KycOps";

    public static AuthorizationOptions AddWayelPolicies(this AuthorizationOptions options)
    {
        options.AddPolicy(AuthenticatedUser, policy => policy.RequireAuthenticatedUser());

        options.AddPolicy(CustomerOnly, policy => policy
            .RequireAuthenticatedUser()
            .RequireAssertion(ctx => ctx.User.HasRole(UserRole.Customer)));

        options.AddPolicy(KycOps, policy =>
        {
            policy.AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme);
            policy.Requirements.Add(new KycOpsRequirement());
        });

        return options;
    }

    private static bool HasRole(this ClaimsPrincipal user, UserRole role) =>
        user.FindFirst(JwtClaimTypes.Role)?.Value == role.ToString();
}
