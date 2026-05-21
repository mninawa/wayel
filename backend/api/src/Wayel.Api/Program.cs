using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Wayel.Api.Endpoints;
using Wayel.Api.Infrastructure;
using Wayel.Api.Infrastructure.OpenApi;
using Wayel.Application;
using Wayel.Application.Abstractions.Security;
using Wayel.Infrastructure;
using Wayel.Infrastructure.Persistence.Mongo;
using Scalar.AspNetCore;
using Serilog;

// Bootstrap loggers freeze once; several WebApplicationFactory fixtures in the same process otherwise fail host startup.
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .Enrich.WithMachineName()
    .Enrich.WithThreadId()
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, services, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithThreadId());

    builder.Services
        .AddApplication(builder.Configuration)
        .AddInfrastructure(builder.Configuration)
        .AddEndpoints();

    builder.Services
        .AddOptions<Wayel.Infrastructure.Notifications.NotificationsObservabilityOptions>()
        .Bind(builder.Configuration.GetSection(Wayel.Infrastructure.Notifications.NotificationsObservabilityOptions.SectionName));

    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ICurrentUser, CurrentUser>();

    builder.Services.AddProblemDetails();
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

    // Minimal APIs use these JSON options for both request body binding and
    // response serialization. JsonStringEnumConverter lets clients (BFFs,
    // tests, the SPA) send enums as strings ("Admin", "Client", ...) instead
    // of having to know the underlying numeric values.
    builder.Services.ConfigureHttpJsonOptions(options =>
    {
        options.SerializerOptions.PropertyNameCaseInsensitive = true;
        options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            var origins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>() ?? [
                    "http://localhost:4200",
                    "http://localhost:4201",
                    "http://localhost:4202",
                    "http://localhost:4203",
                ];

            policy
                .WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
    });

    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        // Per-IP fixed window for the auth surface (`/auth/login`,
        // `/auth/sso/google`, `/auth/refresh`). A global limiter would let a
        // single misbehaving client trip the breaker for every other tenant,
        // so we partition by remote IP and fall back to a shared "unknown"
        // bucket only when the proxy strips the header.
        //
        // Defaults (10 requests / minute) can be overridden per-environment via
        //   Auth:RateLimit:PermitLimit   (int, default 10)
        //   Auth:RateLimit:WindowSeconds (int, default 60)
        // Integration tests set these to effectively-unlimited because every
        // test call originates from loopback and would otherwise share the
        // same per-IP bucket across the whole class fixture.
        var permitLimit = builder.Configuration.GetValue("Auth:RateLimit:PermitLimit", 10);
        var windowSeconds = builder.Configuration.GetValue("Auth:RateLimit:WindowSeconds", 60);

        options.AddPolicy("auth", httpContext =>
        {
            var partitionKey = httpContext.Connection.RemoteIpAddress?.ToString()
                ?? httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault()
                ?? "unknown";

            return RateLimitPartition.GetFixedWindowLimiter(
                partitionKey,
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitLimit,
                    Window = TimeSpan.FromSeconds(windowSeconds),
                    QueueLimit = 0,
                });
        });
    });

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer();
    builder.Services.TryAddEnumerable(
        ServiceDescriptor.Singleton<IConfigureOptions<JwtBearerOptions>, JwtBearerOptionsSetup>());

    builder.Services.AddAuthorization(options => options.AddWayelPolicies());

    builder.Services.AddOpenApi(options =>
    {
        // Surface the JWT Bearer scheme on the generated document and tag
        // every [Authorize] operation with a matching security requirement
        // so Scalar's "Try it" panel forwards the captured token.
        options.AddDocumentTransformer<ApiInfoDocumentTransformer>();
        options.AddDocumentTransformer<SecuritySchemeDocumentTransformer>();
        options.AddOperationTransformer<AuthorizeSecurityRequirementOperationTransformer>();
    });

    var healthChecks = builder.Services
        .AddHealthChecks()
        .AddMongoDb(
            sp => sp.GetRequiredService<MongoDB.Driver.IMongoClient>(),
            name: "mongodb",
            failureStatus: HealthStatus.Unhealthy,
            tags: ["ready"]);

    // Outbox dispatcher heartbeat (defined in Infrastructure so it can stay
    // internal). Tagged "ready" so it gates the readiness probe alongside
    // Mongo.
    healthChecks.AddOutboxDispatcherHealthCheck(tags: ["ready"]);

    var app = builder.Build();

    app.UseExceptionHandler();
    app.UseStatusCodePages();

    app.UseSerilogRequestLogging();

    app.UseCors();
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();

    // OpenAPI is always-on by default outside Production so internal/staging
    // environments stay self-documenting. Operators can flip the kill-switch
    // by setting `OpenApi:Enabled=false` (e.g. in production appsettings) to
    // hide both the JSON document and the Scalar UI.
    var openApiEnabled = builder.Configuration.GetValue(
        "OpenApi:Enabled",
        defaultValue: !app.Environment.IsProduction());
    if (openApiEnabled)
    {
        app.MapOpenApi();
        app.MapScalarApiReference("/docs", options => options
            .WithTitle("Wayel Platform API")
            .WithTheme(ScalarTheme.Purple)
            .WithOpenApiRoutePattern("/openapi/v1.json"));
    }

    app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = _ => false,
    });
    app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready"),
    });

    app.MapEndpoints();

    Log.Information("Starting Wayel API on {Environment}", app.Environment.EnvironmentName);
    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "Wayel API terminated unexpectedly.");
    Environment.ExitCode = 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}

/// <summary>Translates unhandled exceptions to RFC 7807 ProblemDetails.</summary>
internal sealed class GlobalExceptionHandler(Serilog.ILogger logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        logger.Error(exception, "Unhandled exception for {Path}", httpContext.Request.Path);

        httpContext.Response.StatusCode = exception switch
        {
            FluentValidation.ValidationException => StatusCodes.Status400BadRequest,
            UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
            _ => StatusCodes.Status500InternalServerError,
        };

        await httpContext.Response.WriteAsJsonAsync(new
        {
            type = "https://wayel.dev/errors/unhandled",
            title = "An unexpected error occurred.",
            status = httpContext.Response.StatusCode,
            detail = httpContext.RequestServices
                .GetRequiredService<IHostEnvironment>()
                .IsDevelopment() ? exception.Message : "Please contact support.",
        }, cancellationToken);

        return true;
    }
}

public partial class Program;
