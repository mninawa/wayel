using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Behaviors;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Account;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Application.Features.Tracking;
using Wayel.Application.Security;

namespace Wayel.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(assembly);
            cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));
            cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
            cfg.AddOpenBehavior(typeof(PerformanceBehavior<,>));
        });

        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);

        services.AddOptions<SsoAdmissionOptions>()
            .Bind(configuration.GetSection(SsoAdmissionOptions.SectionName));

        services.AddOptions<AuthOptions>()
            .Bind(configuration.GetSection(AuthOptions.SectionName));

        services.AddOptions<WaSenderNotificationOptions>()
            .Bind(configuration.GetSection(WaSenderNotificationOptions.SectionName));

        services.AddScoped<ISsoAdmissionPolicy, ConfigBackedSsoAdmissionPolicy>();
        services.AddScoped<ISuiteNumberAllocator, SuiteNumberAllocator>();
        services.AddScoped<CustomerAccountResponseBuilder>();
        services.AddScoped<ShipmentTrackingDetailLoader>();
        services.AddScoped<ShipmentTrackingEventWriter>();
        services.AddScoped<CustomerSuiteNumberChanger>();

        return services;
    }
}
