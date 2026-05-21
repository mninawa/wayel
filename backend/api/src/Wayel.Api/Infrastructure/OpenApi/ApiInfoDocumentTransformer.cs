using System.Reflection;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Wayel.Api.Infrastructure.OpenApi;

/// <summary>
/// Stamps the generated OpenAPI document with the human-friendly metadata
/// the Scalar UI surfaces in its left rail (title / description / version /
/// contact / license). Keeping this in a transformer lets the same set of
/// fields stay in code review with the API itself, instead of leaking into
/// per-environment configuration.
///
/// The version is read from the assembly's
/// <see cref="AssemblyInformationalVersionAttribute"/> when present so CI
/// builds that stamp the assembly produce a doc whose <c>info.version</c>
/// tracks the actual deploy. We fall back to <c>0.0.0-dev</c> for local
/// runs where the attribute is unset.
/// </summary>
internal sealed class ApiInfoDocumentTransformer : IOpenApiDocumentTransformer
{
    private const string Description = """
Wayel Platform API — the single backend behind the per-audience BFFs
(Admin, Client, External). Endpoints are grouped by tag:

- **Auth** — `POST /auth/sso/google`, refresh, logout, and the
  development-only password login. Rate-limited per remote IP.
- **AdminTenants** — SuperAdmin management of the tenant catalogue:
  create, rename, suspend, activate, archive.
- **AdminStaff** — SuperAdmin tenant-staff directory: list, change role,
  invite.
- **StaffInvitations** — TenantAdmin invitation lifecycle plus the
  signed-in-user accept endpoint.
- **Admin** — operator-only diagnostics: outbox snapshot/requeue and the
  durable audit log.

All non-anonymous routes accept an
`Authorization: Bearer <access_token>` header. Use the **Authorize**
button at the top to paste a token issued by `POST /auth/sso/google` (or
the dev-only `POST /auth/login`) — Scalar will then attach it to every
"Try it" call.
""";

    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        var assembly = typeof(ApiInfoDocumentTransformer).Assembly;
        var version = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? assembly.GetName().Version?.ToString()
            ?? "0.0.0-dev";

        document.Info ??= new OpenApiInfo();
        document.Info.Title = "Wayel Platform API";
        document.Info.Version = version;
        document.Info.Description = Description;
        document.Info.Contact = new OpenApiContact
        {
            Name = "Wayel Platform Team",
            Url = new Uri("https://wayel.dev"),
        };
        document.Info.License = new OpenApiLicense
        {
            Name = "Proprietary",
        };

        return Task.CompletedTask;
    }
}
