using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Wayel.Api.Infrastructure.OpenApi;

/// <summary>
/// Tags every operation that requires authentication with a security
/// requirement that points at the <c>Bearer</c> scheme registered by
/// <see cref="SecuritySchemeDocumentTransformer"/>. Without this, Scalar
/// renders an "Authorize" button but never sends the token on individual
/// "Try it" calls.
///
/// We treat an operation as secured when the endpoint metadata carries an
/// <see cref="AuthorizeAttribute"/> and not an <see cref="AllowAnonymousAttribute"/>.
/// </summary>
internal sealed class AuthorizeSecurityRequirementOperationTransformer
    : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
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
                JwtBearerDefaults.AuthenticationScheme,
                context.Document)] = new List<string>(),
        });

        return Task.CompletedTask;
    }
}
