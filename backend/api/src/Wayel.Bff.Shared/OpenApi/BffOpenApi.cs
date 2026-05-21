using System.Reflection;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi;
using Scalar.AspNetCore;

namespace Wayel.Bff.Shared.OpenApi;

/// <summary>
/// Reusable OpenAPI + Scalar wiring for every BFF host. Each per-audience
/// BFF (Admin / Client / External) calls
/// <see cref="AddBffOpenApi(IServiceCollection, string)"/> on its
/// <see cref="IServiceCollection"/> and
/// <see cref="MapBffOpenApi(WebApplication, string)"/> on its
/// <see cref="WebApplication"/>.
///
/// Documentation is on by default outside Production; flip
/// <c>OpenApi:Enabled</c> in configuration to <c>false</c> to hide both
/// the JSON document and the Scalar UI.
/// </summary>
public static class BffOpenApi
{
    /// <summary>The URL path the Scalar UI is mapped on.</summary>
    public const string DocsPath = "/docs";

    /// <summary>The URL path the OpenAPI JSON document is served on.</summary>
    public const string DocumentRoute = "/openapi/v1.json";

    /// <summary>
    /// Registers the OpenAPI generator with BFF-appropriate metadata.
    /// </summary>
    /// <param name="services">The host's service collection.</param>
    /// <param name="audience">
    /// The BFF audience (e.g. <c>"Admin"</c>, <c>"Client"</c>,
    /// <c>"External"</c>) — purely cosmetic, surfaces in the doc title and
    /// Scalar header so operators don't confuse one BFF's docs for another.
    /// </param>
    public static IServiceCollection AddBffOpenApi(this IServiceCollection services, string audience)
    {
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                var assembly = typeof(BffOpenApi).Assembly;
                var version = assembly
                    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                    ?? assembly.GetName().Version?.ToString()
                    ?? "0.0.0-dev";

                document.Info ??= new OpenApiInfo();
                document.Info.Title = $"Wayel {audience} BFF";
                document.Info.Version = version;
                document.Info.Description = BuildDescription(audience);
                document.Info.Contact = new OpenApiContact
                {
                    Name = "Wayel Platform Team",
                    Url = new Uri("https://wayel.dev"),
                };
                document.Info.License = new OpenApiLicense { Name = "Proprietary" };

                // Document the cookie session as the BFF's primary security
                // scheme so the Scalar UI explains what callers need (a
                // logged-in cookie via /bff/auth/login). State-changing
                // requests additionally need an `X-XSRF-TOKEN` header
                // mirrored from the `XSRF-TOKEN` cookie — capture that as a
                // second scheme so consumers see both.
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??=
                    new Dictionary<string, IOpenApiSecurityScheme>(StringComparer.Ordinal);

                document.Components.SecuritySchemes[CookieAuthenticationDefaults.AuthenticationScheme] =
                    new OpenApiSecurityScheme
                    {
                        Type = SecuritySchemeType.ApiKey,
                        Name = "wayel.bff.session",
                        In = ParameterLocation.Cookie,
                        Description =
                            "Session cookie minted by `GET /bff/auth/login` after the OIDC " +
                            "round-trip. The Scalar 'Try it' panel will reuse the browser " +
                            "session — sign in once at /bff/auth/login then come back here.",
                    };

                document.Components.SecuritySchemes["XSRF-TOKEN"] =
                    new OpenApiSecurityScheme
                    {
                        Type = SecuritySchemeType.ApiKey,
                        Name = "X-XSRF-TOKEN",
                        In = ParameterLocation.Header,
                        Description =
                            "CSRF token mirrored from the non-HttpOnly `XSRF-TOKEN` cookie. " +
                            "Required on every non-GET request under `/bff` and `/api`.",
                    };

                return Task.CompletedTask;
            });

            options.AddOperationTransformer((operation, context, _) =>
            {
                var metadata = context.Description.ActionDescriptor.EndpointMetadata;
                var hasAuthorize = metadata.OfType<AuthorizeAttribute>().Any();
                var hasAnonymous = metadata.OfType<AllowAnonymousAttribute>().Any();

                if (!hasAuthorize || hasAnonymous)
                {
                    return Task.CompletedTask;
                }

                operation.Security ??= new List<OpenApiSecurityRequirement>();
                operation.Security.Add(new OpenApiSecurityRequirement
                {
                    [new OpenApiSecuritySchemeReference(
                        CookieAuthenticationDefaults.AuthenticationScheme,
                        context.Document)] = new List<string>(),
                });

                return Task.CompletedTask;
            });
        });

        return services;
    }

    /// <summary>
    /// Maps the OpenAPI document and Scalar reference UI when
    /// <c>OpenApi:Enabled</c> is true (default outside Production).
    /// </summary>
    public static WebApplication MapBffOpenApi(this WebApplication app, string audience)
    {
        var enabled = app.Configuration.GetValue(
            "OpenApi:Enabled",
            defaultValue: !app.Environment.IsProduction());
        if (!enabled)
        {
            return app;
        }

        app.MapOpenApi();
        app.MapScalarApiReference(DocsPath, options => options
            .WithTitle($"Wayel {audience} BFF")
            .WithTheme(ScalarTheme.Purple)
            .WithOpenApiRoutePattern(DocumentRoute));

        return app;
    }

    private static string BuildDescription(string audience) => $$"""
Wayel {{audience}} BFF — the cookie-bearing facade between the
{{audience}} SPA and the Wayel Platform API.

This BFF exposes two surfaces:

- **`/bff/auth`** — sign-in (OIDC challenge → Google → Wayel
  session-exchange), sign-out, and the cookie-bound `/me` endpoint.
- **`/api/**`** — transparent reverse-proxy to the Wayel Platform API,
  with the BFF cookie translated into an upstream
  `Authorization: Bearer <access_token>` header by
  `AccessTokenRelayMiddleware`. Refer to the Platform API docs at
  <a href="/openapi/v1.json">the upstream's `/openapi/v1.json`</a> for
  the full proxied surface.

Authentication is **cookie-based**: hit `GET /bff/auth/login` first to
mint a session, then keep using the same browser tab. State-changing
requests additionally need the `X-XSRF-TOKEN` header echoed from the
`XSRF-TOKEN` cookie.
""";
}
