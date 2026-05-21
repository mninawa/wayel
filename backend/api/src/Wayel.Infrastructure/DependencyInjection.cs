using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Auditing;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Infrastructure.Notifications;
using Wayel.Infrastructure.Persistence.Mongo;
using Wayel.Infrastructure.Persistence.Mongo.Repositories;
using Wayel.Infrastructure.Persistence.Mongo.Seed;
using Wayel.Infrastructure.Security;
using Wayel.Infrastructure.Time;

namespace Wayel.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<MongoOptions>()
            .Bind(configuration.GetSection(MongoOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<AuthSessionOptions>()
            .Bind(configuration.GetSection(AuthSessionOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<GoogleAuthOptions>()
            .Bind(configuration.GetSection(GoogleAuthOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<OutboxOptions>()
            .Bind(configuration.GetSection(OutboxOptions.SectionName));

        services.AddOptions<NotificationOptions>()
            .Bind(configuration.GetSection(NotificationOptions.SectionName));

        services.AddOptions<NotificationSesOptions>()
            .Bind(configuration.GetSection(NotificationSesOptions.SectionName));

        services.AddSingleton<IMongoClient>(sp =>
        {
            var opts = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            var settings = MongoClientSettings.FromConnectionString(opts.ConnectionString);
            settings.ApplicationName = "weyell-api";
            return new MongoClient(settings);
        });

        services.AddSingleton<MongoContext>();
        services.AddHostedService<MongoIndexInitializer>();
        services.AddHostedService<SuitePlanSeeder>();

        services.AddScoped<IUserRepository, MongoUserRepository>();
        services.AddScoped<IExternalIdentityRepository, MongoExternalIdentityRepository>();
        services.AddScoped<IRefreshTokenRepository, MongoRefreshTokenRepository>();
        services.AddScoped<ISuitePlanRepository, MongoSuitePlanRepository>();
        services.AddScoped<ISuiteSubscriptionRepository, MongoSuiteSubscriptionRepository>();
        services.AddScoped<ICustomerAddressRepository, MongoCustomerAddressRepository>();
        services.AddScoped<IParcelRepository, MongoParcelRepository>();
        services.AddScoped<IShipmentRepository, MongoShipmentRepository>();
        services.AddScoped<IQuoteRepository, MongoQuoteRepository>();

        services.AddScoped<IUnitOfWork, MongoUnitOfWork>();
        services.AddScoped<IDomainEventCollector, DomainEventCollector>();
        services.AddScoped<IOutboxStore, MongoOutboxStore>();
        services.AddScoped<IAuditLogger, MongoAuditLogger>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IPasswordHasher, BCryptPasswordHasher>();
        services.AddScoped<IJwtTokenIssuer, JwtTokenIssuer>();
        services.AddScoped<IAuthSessionIssuer, AuthSessionIssuer>();
        services.AddScoped<IGoogleIdTokenValidator, GoogleIdTokenValidator>();

        services.AddSingleton<INotificationSender, LoggingNotificationSender>();

        var outboxEnabled = configuration.GetValue($"{OutboxOptions.SectionName}:Enabled", true);
        if (outboxEnabled)
        {
            services.AddHostedService<OutboxDispatcherHostedService>();
        }

        services.AddScoped<IEmailTransport, LoggingEmailTransport>();

        return services;
    }
}
