using System.Text;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Wayel.Bff.Shared.ApiClient;
using Wayel.Bff.Shared.Configuration;
using Wayel.Bff.Shared.Endpoints;
using Wayel.Bff.Shared.Middleware;
using Wayel.Bff.Shared.Sessions;
using Yarp.ReverseProxy.Configuration;

namespace Wayel.Bff.Shared.Composition;

/// <summary>
/// Single entry point for wiring up a BFF host. Each per-audience BFF
/// (admin, client, external) calls <see cref="AddBff"/> on its <see cref="IServiceCollection"/>
/// and <see cref="UseBff"/> on its <see cref="WebApplication"/>.
/// </summary>
public static class BffHostBuilder
{
    /// <summary>
    /// Cookie name used for the (non-HttpOnly) antiforgery token the SPA
    /// echoes back via the <c>X-XSRF-TOKEN</c> header. Same name Angular's
    /// <c>HttpClient</c> picks up by default, so SPAs need no extra wiring.
    /// </summary>
    public const string CsrfCookieName = "XSRF-TOKEN";

    /// <summary>
    /// Header name the antiforgery middleware looks for. Matches Angular's
    /// <c>HttpClientXsrfModule</c> defaults.
    /// </summary>
    public const string CsrfHeaderName = "X-XSRF-TOKEN";

    public static IServiceCollection AddBff(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddOptions<BffOptions>()
            .Bind(configuration.GetSection(BffOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<GoogleOidcOptions>()
            .Bind(configuration.GetSection(GoogleOidcOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // Validates bearer tokens issued by Wayel.Api so password-login SPAs
        // (admin, parent, staff) — which never go through OIDC and therefore
        // never get the BFF cookie — can still authenticate against
        // /api/* through the BFF.
        services.AddOptions<BffJwtOptions>()
            .Bind(configuration.GetSection(BffJwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<BffSessionStore>();
        services.AddSingleton<IPostConfigureOptions<OpenIdConnectOptions>, GoogleOidcStaticMetadataPostConfigure>();

        // Data Protection backs the cookie auth ticket's encryption AND the
        // antiforgery token pairing. Without a persisted, *shared* key ring
        // the ciphertext minted before a deploy is unreadable after the
        // deploy — every signed-in user is silently logged out on every
        // release, and the same is true for any future horizontally-scaled
        // replica that wasn't around when the cookie was minted.
        //
        // Default to a Mongo-backed key ring when the same MongoOptions
        // env vars the API uses are present on the BFF. Falls back to
        // the framework's in-memory store for local dev / tests where no
        // Mongo is configured (matches the old behaviour exactly, just
        // without the deployment-eats-sessions problem in production).
        var dataProtection = services.AddDataProtection()
            .SetApplicationName($"Wayel.Bff.{configuration[$"{BffOptions.SectionName}:Audience"] ?? "default"}");

        var mongoConnection = configuration["MongoOptions:ConnectionString"];
        var mongoDatabase = configuration["MongoOptions:DatabaseName"];
        if (!string.IsNullOrWhiteSpace(mongoConnection)
            && !string.IsNullOrWhiteSpace(mongoDatabase))
        {
            dataProtection.PersistKeysToMongo(mongoConnection, mongoDatabase);
        }

        services.AddHttpClient<WayelAuthApiClient>((sp, client) =>
        {
            var bff = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<BffOptions>>().Value;
            client.BaseAddress = bff.ApiBaseUri;
            client.Timeout = TimeSpan.FromSeconds(15);
        });

        services.AddAuthentication(options =>
            {
                options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                // We deliberately default to the cookie scheme for *challenges* so
                // an unauthenticated XHR to a [Authorize] endpoint (e.g.
                // /bff/auth/me, /api/...) flows through the cookie's
                // OnRedirectToLogin event and ends up as a JSON-friendly 401
                // instead of a 302 to Google's HTML login page. The OIDC
                // challenge is only used by the explicit /bff/auth/login
                // endpoint, which calls Results.Challenge(...) with the OIDC
                // scheme name directly.
                options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultSignOutScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, cookie =>
            {
                var bff = configuration.GetSection(BffOptions.SectionName).Get<BffOptions>() ?? new BffOptions();
                cookie.Cookie.Name = bff.CookieName;
                cookie.Cookie.HttpOnly = true;
                cookie.Cookie.SameSite = SameSiteMode.Lax;

                // When RequireHttpsCookie=false (Docker portal on http://localhost:8080)
                // cookies must be SameAsRequest or the browser never stores them.
                cookie.Cookie.SecurePolicy = bff.RequireHttpsCookie
                    ? CookieSecurePolicy.Always
                    : CookieSecurePolicy.SameAsRequest;
                cookie.ExpireTimeSpan = TimeSpan.FromMinutes(bff.SessionLifetimeMinutes);
                cookie.SlidingExpiration = true;

                cookie.Events = new CookieAuthenticationEvents
                {
                    OnRedirectToLogin = ctx =>
                    {
                        // SPA expects 401 instead of a 302 to the OIDC challenge.
                        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return Task.CompletedTask;
                    },
                    OnRedirectToAccessDenied = ctx =>
                    {
                        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return Task.CompletedTask;
                    },
                };
            })
            .AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, oidc =>
            {
                var google = configuration.GetSection(GoogleOidcOptions.SectionName).Get<GoogleOidcOptions>()
                    ?? new GoogleOidcOptions();
                var bff = configuration.GetSection(BffOptions.SectionName).Get<BffOptions>() ?? new BffOptions();

                oidc.Authority = google.Authority.ToString();
                oidc.ClientId = google.ClientId;
                oidc.ClientSecret = google.ClientSecret;
                oidc.ResponseType = "code";
                oidc.UsePkce = true;
                oidc.SaveTokens = false;
                oidc.GetClaimsFromUserInfoEndpoint = false;
                oidc.Scope.Clear();
                oidc.Scope.Add("openid");
                oidc.Scope.Add("email");
                oidc.Scope.Add("profile");

                // form_post is the secure default in production: Google posts the
                // auth code straight to /signin-oidc instead of leaking it into a
                // URL bar / referrer / proxy log. The handler then mints
                // SameSite=None;Secure correlation+nonce cookies so the
                // cross-site POST can carry them.
                //
                // On plain http://localhost (RequireHttpsCookie=false) browsers
                // refuse to *store* Secure cookies, so the callback would fail
                // with "correlation failed". We downgrade to query mode +
                // SameSite=Lax in that case — the callback is then a top-level
                // navigation and Lax cookies ride along.
                // Plain http://localhost (Docker portal on :8080, dev proxy) cannot
                // store Secure correlation cookies — use query + Lax in that case.
                if (!bff.RequireHttpsCookie)
                {
                    oidc.ResponseMode = "query";
                    oidc.CorrelationCookie.SameSite = SameSiteMode.Lax;
                    oidc.CorrelationCookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                    oidc.NonceCookie.SameSite = SameSiteMode.Lax;
                    oidc.NonceCookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                }

                oidc.TokenValidationParameters = new TokenValidationParameters
                {
                    NameClaimType = "name",
                    RoleClaimType = "role",
                };

                oidc.Events = new OpenIdConnectEvents
                {
                    OnTokenValidated = BffAuthEndpoints.ExchangeAndSignInAsync,
                    // After Google posts back to /signin-oidc the framework follows
                    // `Properties.RedirectUri` — a value that was captured when the
                    // user *first* hit /bff/auth/login. If the BFF has since been
                    // reconfigured (e.g. a dev stack rebuilt with a new SpaBaseUri,
                    // or the operator switched between localhost ports), an
                    // in-flight correlation cookie can still encode the OLD
                    // origin and bounce the user out to a host that no longer
                    // serves the SPA. We re-validate against the *current*
                    // SpaBaseUri here so a stale cookie can never leak the user
                    // off-origin: same-authority URLs are kept, anything else
                    // collapses to the SPA root.
                    OnTicketReceived = ctx =>
                    {
                        var bff = ctx.HttpContext.RequestServices
                            .GetRequiredService<Microsoft.Extensions.Options.IOptions<BffOptions>>()
                            .Value;
                        if (ctx.Properties is not null)
                        {
                            ctx.Properties.RedirectUri = BffAuthEndpoints.SafeReturnUrl(
                                ctx.Properties.RedirectUri,
                                bff.SpaBaseUri);
                        }
                        return Task.CompletedTask;
                    },
                    OnRemoteFailure = ctx =>
                    {
                        var spa = configuration[$"{BffOptions.SectionName}:SpaBaseUri"] ?? "/";
                        var signIn = $"{spa.TrimEnd('/')}/sign-in";
                        ctx.HandleResponse();
                        ctx.Response.Redirect(
                            $"{signIn}?sso_error={Uri.EscapeDataString(ctx.Failure?.Message ?? "unknown")}");
                        return Task.CompletedTask;
                    },
                };
            });

        // Second auth scheme: validate bearer tokens minted by Wayel.Api so
        // password-login SPAs (no OIDC, no cookie) authenticate against
        // /api/* through the BFF. Configured with the same Issuer / Audience
        // / SigningKey as the API so a token verified there verifies here too.
        services.AddAuthentication()
            .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, jwt =>
            {
                var jwtOpts = configuration.GetSection(BffJwtOptions.SectionName).Get<BffJwtOptions>()
                    ?? new BffJwtOptions();

                // Match Wayel.Api: keep inbound claim types verbatim so
                // policy lookups for "role" / "tid" still work.
                jwt.MapInboundClaims = false;

                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtOpts.Issuer,
                    ValidAudience = jwtOpts.Audience,
                    IssuerSigningKey = string.IsNullOrEmpty(jwtOpts.SigningKey)
                        ? null
                        : new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOpts.SigningKey)),
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });

        // Default policy authenticates against EITHER the cookie scheme
        // (OIDC sessions) OR the JwtBearer scheme (password-login SPAs).
        // Whichever one succeeds first wins — cookie users keep their
        // existing flow, bearer users no longer hit the cookie scheme's
        // 401-via-OnRedirectToLogin handler. The challenge scheme stays
        // Cookie so unauthenticated XHRs still get a JSON-friendly 401.
        services.AddAuthorization(options =>
        {
            options.DefaultPolicy = new AuthorizationPolicyBuilder(
                    CookieAuthenticationDefaults.AuthenticationScheme,
                    JwtBearerDefaults.AuthenticationScheme)
                .RequireAuthenticatedUser()
                .Build();
        });

        // CSRF: ASP.NET Core's antiforgery uses TWO cryptographically-linked
        // tokens — a cookie token (server-only) and a request token (echoed
        // by the SPA). Earlier we tried to fold both into a single
        // `XSRF-TOKEN` cookie by overriding `options.Cookie.Name`, but that
        // put the *cookie token* into the cookie that Angular reads, while
        // validation expected the *request token* in the header. The two
        // values are different, so every state-changing request returned
        // 400 "Invalid CSRF token" — even after the SPA started sending
        // the header.
        //
        // Correct setup (matches the official Microsoft SPA guidance):
        //   • Cookie token lives in the framework-default HttpOnly cookie
        //     (`.AspNetCore.Antiforgery.<id>`) — invisible to JS, just
        //     bound to the session via DataProtection.
        //   • Request token is written to a *separate* non-HttpOnly cookie
        //     called `XSRF-TOKEN` by the BffAntiforgeryMiddleware on every
        //     safe authenticated call. Angular reads that cookie and
        //     echoes it on `X-XSRF-TOKEN`. The framework then validates
        //     header-token-vs-cookie-token, which now line up.
        services.AddAntiforgery(options =>
        {
            var bff = configuration.GetSection(BffOptions.SectionName).Get<BffOptions>() ?? new BffOptions();
            options.HeaderName = CsrfHeaderName;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = bff.RequireHttpsCookie
                ? CookieSecurePolicy.Always
                : CookieSecurePolicy.SameAsRequest;
        });

        services.AddReverseProxy()
            .LoadFromMemory(BuildProxyRoutes(configuration), BuildProxyClusters(configuration));

        return services;
    }

    public static WebApplication UseBff(this WebApplication app)
    {
        // Trust X-Forwarded-* from nginx/Caddy so OIDC redirect_uri uses the
        // browser-facing host:port (e.g. http://localhost:8080/signin-oidc).
        var forwarded = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor
                | ForwardedHeaders.XForwardedProto
                | ForwardedHeaders.XForwardedHost,
        };
        forwarded.KnownIPNetworks.Clear();
        forwarded.KnownProxies.Clear();
        app.UseForwardedHeaders(forwarded);

        app.UseAuthentication();
        app.UseAuthorization();
        // Antiforgery sits behind authentication so the cookie can be tied
        // to the signed-in principal, but in front of the access-token relay
        // and YARP — both of which forward state-changing requests.
        app.UseMiddleware<BffAntiforgeryMiddleware>();
        app.UseMiddleware<AccessTokenRelayMiddleware>();

        app.MapBffAuth();
        app.MapBffBranding();
        app.MapBffInvitations();
        app.MapReverseProxy();

        return app;
    }

    private static List<RouteConfig> BuildProxyRoutes(IConfiguration configuration) =>
        [
            // Public, pre-sign-in catalogue surfaces. The API endpoints
            // themselves carry [AllowAnonymous], but YARP applies the route's
            // AuthorizationPolicy *before* hitting the upstream — so without
            // these explicit anon routes the catch-all below would 401 the
            // unauthenticated parent SPA and the subscribe page would render
            // an empty list. Order matters: more specific patterns must come
            // first.
            new RouteConfig
            {
                RouteId = "wayel-api-tenants-by-domain",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/tenants/by-domain/{**rest}",
                    Methods = ["GET"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-tenants-directory",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/tenants/directory",
                    Methods = ["GET"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-tenants-programs",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/tenants/{slug}/programs",
                    Methods = ["GET"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            // Anonymous auth/token endpoints. The API marks these AllowAnonymous,
            // but YARP evaluates the route policy first — without explicit anon
            // routes the catch-all below would return 401 before the upstream.
            new RouteConfig
            {
                RouteId = "wayel-api-auth-login",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/auth/login",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-auth-register",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/auth/register",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-auth-sso-google",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/auth/sso/google",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-auth-refresh",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/auth/refresh",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-auth-logout",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/auth/logout",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            // Pre-sign-in invitation surfaces. The accept page calls
            // /preview to render "you're joining X as Staff" before the
            // user signs in, and /accept-password lets a non-Google
            // recipient set a password to create their account in one
            // shot. Both are AllowAnonymous on the API; the catch-all
            // below would otherwise 401 unauthenticated callers.
            new RouteConfig
            {
                RouteId = "wayel-api-staff-invitations-preview",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/staff-invitations/preview",
                    Methods = ["GET"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api-staff-invitations-accept-password",
                ClusterId = "wayel-api",
                Match = new RouteMatch
                {
                    Path = "/api/v1/staff-invitations/accept-password",
                    Methods = ["POST"],
                },
                AuthorizationPolicy = "Anonymous",
            },
            // WeYell internal ops (KYC queue, warehouse parcel receive). Secured
            // upstream by X-Wayel-Ops-Key — must not require a BFF cookie so the
            // portal can call these after the user enters the ops key (the SPA
            // still gates /internal/* routes behind customerSignedInGuard).
            new RouteConfig
            {
                RouteId = "wayel-api-borderbox-ops",
                ClusterId = "wayel-api",
                Match = new RouteMatch { Path = "/api/v1/borderbox/ops/{**catch-all}" },
                AuthorizationPolicy = "Anonymous",
            },
            new RouteConfig
            {
                RouteId = "wayel-api",
                ClusterId = "wayel-api",
                Match = new RouteMatch { Path = "/api/{**catch-all}" },
                AuthorizationPolicy = "default",
            },
        ];

    private static List<ClusterConfig> BuildProxyClusters(IConfiguration configuration)
    {
        var bff = configuration.GetSection(BffOptions.SectionName).Get<BffOptions>() ?? new BffOptions();
        return [
            new ClusterConfig
            {
                ClusterId = "wayel-api",
                Destinations = new Dictionary<string, DestinationConfig>(StringComparer.OrdinalIgnoreCase)
                {
                    ["primary"] = new() { Address = bff.ApiBaseUri.ToString() },
                },
            },
        ];
    }
}
