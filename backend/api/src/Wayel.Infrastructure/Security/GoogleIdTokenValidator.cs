using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;

namespace Wayel.Infrastructure.Security;

/// <summary>
/// Validates a Google id_token using Google's OpenID Connect discovery + JWKS.
/// JWKS is fetched lazily and cached by <see cref="ConfigurationManager{T}"/>.
/// </summary>
internal sealed class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    private static readonly Error MalformedToken =
        Error.Validation("identity.google.malformed_token", "Google id_token is malformed.");

    private static readonly Error InvalidToken =
        Error.Unauthorized("identity.google.invalid_token", "Google rejected this id_token.");

    private readonly GoogleAuthOptions _options;
    private readonly BaseConfigurationManager _configurationManager;
    private readonly ILogger<GoogleIdTokenValidator> _logger;
    private readonly JwtSecurityTokenHandler _handler = new() { MapInboundClaims = false };

    /// <summary>
    /// DI-facing constructor. Builds the production discovery-document manager
    /// pointed at <see cref="GoogleAuthOptions.DiscoveryUri"/> with the configured
    /// JWKS refresh interval.
    /// </summary>
    public GoogleIdTokenValidator(IOptions<GoogleAuthOptions> options, ILogger<GoogleIdTokenValidator> logger)
        : this(
            options,
            BuildDefaultConfigurationManager(options.Value),
            logger)
    {
    }

    /// <summary>
    /// Test seam: lets unit tests inject a <see cref="StaticConfigurationManager{T}"/>
    /// (or any other <see cref="BaseConfigurationManager"/>) so we can validate against
    /// a controlled set of signing keys without round-tripping to Google.
    /// </summary>
    internal GoogleIdTokenValidator(
        IOptions<GoogleAuthOptions> options,
        BaseConfigurationManager configurationManager,
        ILogger<GoogleIdTokenValidator> logger)
    {
        _options = options.Value;
        _configurationManager = configurationManager;
        _logger = logger;
    }

    private static ConfigurationManager<OpenIdConnectConfiguration> BuildDefaultConfigurationManager(
        GoogleAuthOptions options) =>
        new(
            options.DiscoveryUri.ToString(),
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true })
        {
            AutomaticRefreshInterval = options.JwksRefreshInterval,
        };

    private static readonly Error NotConfigured = Error.Unauthorized(
        "identity.google.not_configured",
        "Google sign-in is not configured for this environment.");

    public async Task<Result<GoogleIdToken>> ValidateAsync(string rawIdToken, CancellationToken cancellationToken)
    {
        if (_options.ClientIds.Count == 0)
        {
            _logger.LogWarning("Google id_token validation attempted but no client ids are configured.");
            return Result.Failure<GoogleIdToken>(NotConfigured);
        }

        if (string.IsNullOrWhiteSpace(rawIdToken) || !_handler.CanReadToken(rawIdToken))
        {
            return Result.Failure<GoogleIdToken>(MalformedToken);
        }

        BaseConfiguration configuration;
        try
        {
            configuration = await _configurationManager.GetBaseConfigurationAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch Google OIDC configuration.");
            return Result.Failure<GoogleIdToken>(IdentityErrors.ProviderRejected);
        }

        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = _options.AcceptedIssuers,
            ValidateAudience = true,
            ValidAudiences = _options.ClientIds,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = configuration.SigningKeys,
            // Two minutes matches Google's published guidance for tolerance of
            // clock drift between client + server. Tests pin this so they can
            // assert the boundary; production callers should not depend on it.
            ClockSkew = TimeSpan.FromMinutes(2),
            NameClaimType = "sub",
        };

        try
        {
            var result = await _handler.ValidateTokenAsync(rawIdToken, parameters);
            if (!result.IsValid)
            {
                _logger.LogInformation(result.Exception, "Google id_token rejected by validator.");
                return Result.Failure<GoogleIdToken>(InvalidToken);
            }

            var claims = result.Claims;
            var subject = GoogleClaimReader.ReadString(claims, "sub");
            var email = GoogleClaimReader.ReadString(claims, "email");
            var emailVerified = GoogleClaimReader.ReadBool(claims, "email_verified");
            var name = GoogleClaimReader.ReadString(claims, "name");
            var picture = GoogleClaimReader.ReadString(claims, "picture");
            var hostedDomain = GoogleClaimReader.ReadString(claims, "hd");

            if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(email))
            {
                return Result.Failure<GoogleIdToken>(InvalidToken);
            }

            return new GoogleIdToken(subject, email, emailVerified, name, picture, hostedDomain);
        }
        catch (SecurityTokenException ex)
        {
            _logger.LogInformation(ex, "Google id_token failed security validation.");
            return Result.Failure<GoogleIdToken>(InvalidToken);
        }
    }
}
