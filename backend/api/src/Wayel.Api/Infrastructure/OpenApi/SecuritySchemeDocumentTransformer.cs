using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Wayel.Api.Infrastructure.OpenApi;

/// <summary>
/// Registers the security schemes the API uses on the generated OpenAPI
/// document so Scalar (and any other tool consuming /openapi/v1.json) can:
///
///   1. Render the "Authorize" panel with a Bearer-token field.
///   2. Send the captured token on "Try it" requests for every operation
///      decorated with <c>[Authorize]</c> (see
///      <see cref="AuthorizeSecurityRequirementOperationTransformer"/>).
///
/// We only emit the Bearer scheme when JwtBearer is actually registered in
/// the host so that the document stays accurate if a future deployment
/// strips out auth (e.g. an internal admin-only build).
/// </summary>
internal sealed class SecuritySchemeDocumentTransformer(
    IAuthenticationSchemeProvider schemeProvider) : IOpenApiDocumentTransformer
{
    public async Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        var schemes = await schemeProvider.GetAllSchemesAsync();
        if (!schemes.Any(s => s.Name == JwtBearerDefaults.AuthenticationScheme))
        {
            return;
        }

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??=
            new Dictionary<string, IOpenApiSecurityScheme>(StringComparer.Ordinal);

        document.Components.SecuritySchemes[JwtBearerDefaults.AuthenticationScheme] =
            new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = SecuritySchemeType.Http,
                Scheme = JwtBearerDefaults.AuthenticationScheme.ToLowerInvariant(),
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Description =
                    "Paste the access token returned by `POST /auth/login`, " +
                    "`POST /auth/sso/google`, or `POST /auth/refresh`. The Scalar " +
                    "explorer attaches it as `Authorization: Bearer <token>` on " +
                    "every secured request.",
            };
    }
}
