using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Wayel.Bff.Shared.ApiClient;
using Wayel.Bff.Shared.Middleware;
using Wayel.Bff.Shared.Sessions;

namespace Wayel.Bff.IntegrationTests.Infrastructure;

/// <summary>
/// Inserts a single test-only middleware at the very front of the BFF pipeline:
/// <c>POST /__test/sign-in</c> reads a <see cref="WayelAuthSessionDto"/> JSON body,
/// builds a BFF principal off it, and signs the caller in via the cookie auth scheme.
/// <para>
/// Lets the round-trip tests synthesise a cookie session from a real Wayel.Api
/// session DTO without driving the Google OIDC challenge. The endpoint is only
/// registered when this <see cref="IStartupFilter"/> is in DI, which is itself
/// only added by <see cref="WayelBffCustomerFactory"/>.
/// </para>
/// </summary>
internal sealed class BffTestSignInStartupFilter : IStartupFilter
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            app.Use(async (ctx, nextDelegate) =>
            {
                if (ctx.Request.Path.Equals("/__test/sign-in", StringComparison.Ordinal)
                    && HttpMethods.IsPost(ctx.Request.Method))
                {
                    await HandleSignInAsync(ctx);
                    return;
                }

                await nextDelegate();
            });

            next(app);
        };

    private static async Task HandleSignInAsync(HttpContext ctx)
    {
        var dto = await JsonSerializer.DeserializeAsync<WayelAuthSessionDto>(
            ctx.Request.Body, JsonOpts, ctx.RequestAborted);
        if (dto is null)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var sessionStore = ctx.RequestServices.GetRequiredService<BffSessionStore>();
        var session = AccessTokenRelayMiddleware.MapSession(dto);
        var principal = sessionStore.BuildPrincipal(session, CookieAuthenticationDefaults.AuthenticationScheme);

        await ctx.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties { IsPersistent = true });

        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    }
}
