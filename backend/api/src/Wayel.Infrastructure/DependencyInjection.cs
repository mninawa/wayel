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
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Kyc;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Configuration;
using Wayel.Application.Kyc;
using Wayel.Infrastructure.Billing;
using Wayel.Infrastructure.Billing.Momo;
using Wayel.Infrastructure.Kyc;
using Wayel.Infrastructure.Notifications;
using Wayel.Infrastructure.Parcels;
using Wayel.Infrastructure.Persistence.Mongo;
using Wayel.Infrastructure.Storage;
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

        services.AddOptions<NotificationWaSenderOptions>()
            .Bind(configuration.GetSection(NotificationWaSenderOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<NotificationWaSenderOptions>, NotificationWaSenderOptionsValidator>();

        services.AddOptions<InvoiceStorageOptions>()
            .Bind(configuration.GetSection(InvoiceStorageOptions.SectionName));

        services.AddOptions<DemoDataOptions>()
            .Bind(configuration.GetSection(DemoDataOptions.SectionName));

        services.AddOptions<TestParcelSeedOptions>()
            .Bind(configuration.GetSection(TestParcelSeedOptions.SectionName));

        services.AddOptions<OpsAuthOptions>()
            .Bind(configuration.GetSection(OpsAuthOptions.SectionName));

        services.AddOptions<PaystackOptions>()
            .Bind(configuration.GetSection(PaystackOptions.SectionName));

        services.AddOptions<KycOptions>()
            .Bind(configuration.GetSection(KycOptions.SectionName));

        services.AddHttpClient(nameof(IdAnalyzerKycIdentityProvider), (sp, client) =>
        {
            var opts = sp.GetRequiredService<IOptions<KycOptions>>().Value;
            var baseUrl = string.IsNullOrWhiteSpace(opts.IdAnalyzerBaseUrl)
                ? "https://api2.idanalyzer.com"
                : opts.IdAnalyzerBaseUrl.TrimEnd('/');
            client.BaseAddress = new Uri(baseUrl + "/");
            client.Timeout = TimeSpan.FromSeconds(120);
        });
        services.AddScoped<StubKycIdentityProvider>();
        services.AddScoped<IdAnalyzerKycIdentityProvider>();
        services.AddScoped<IKycIdentityProvider>(sp =>
        {
            var opts = sp.GetRequiredService<IOptions<KycOptions>>().Value;
            if (opts.IdAnalyzerEnabled && !string.IsNullOrWhiteSpace(opts.IdAnalyzerApiKey))
            {
                return sp.GetRequiredService<IdAnalyzerKycIdentityProvider>();
            }

            return sp.GetRequiredService<StubKycIdentityProvider>();
        });

        services.AddOptions<BorderBoxPricingOptions>()
            .Bind(configuration.GetSection(BorderBoxPricingOptions.SectionName));

        services.AddOptions<BorderBoxOptions>()
            .Bind(configuration.GetSection(BorderBoxOptions.SectionName));

        services.AddOptions<QuoteQueueAutoProcessorOptions>()
            .Bind(configuration.GetSection(QuoteQueueAutoProcessorOptions.SectionName));
        services.AddOptions<OpsExceptionSupportAlertOptions>()
            .Bind(configuration.GetSection(OpsExceptionSupportAlertOptions.SectionName));

        services.AddOptions<MtnMomoOptions>()
            .Bind(configuration.GetSection(MtnMomoOptions.SectionName));

        services.AddHttpClient(nameof(PaystackPaymentGateway));
        services.AddHttpClient(nameof(MtnMomoTokenManager));
        services.AddHttpClient(nameof(MtnMomoCollectionsClient));
        services.AddHttpClient(nameof(MtnMomoDisbursementsClient));
        services.AddHttpClient(nameof(MtnMomoSandboxProvisioner));

        services.AddSingleton<MtnMomoRuntimeCredentials>();
        services.AddSingleton<MtnMomoTokenManager>();
        services.AddSingleton<MtnMomoCollectionsClient>();
        services.AddSingleton<MtnMomoDisbursementsClient>();
        services.AddSingleton<MtnMomoSandboxProvisioner>();
        services.AddHostedService<MtnMomoBootstrapHostedService>();

        services.AddSingleton<ICardVerificationBillingOptions, CardVerificationBillingOptions>();
        services.AddSingleton<IPaymentGateway, PaystackPaymentGateway>();
        services.AddSingleton<IPaymentGateway, MtnMomoPaymentGateway>();
        services.AddSingleton<IPaymentGatewayResolver, PaymentGatewayResolver>();
        services.AddSingleton<IMomoAccountValidator, MtnMomoAccountValidator>();

        services.AddScoped<IOpsPhotoUploadSessionStore, MongoOpsPhotoUploadSessionStore>();
        services.AddScoped<IKycDocumentUploadSessionStore, MongoKycDocumentUploadSessionStore>();

        var configuredProvider = configuration.GetValue<string>($"{InvoiceStorageOptions.SectionName}:Provider");
        var hasS3Settings =
            !string.IsNullOrWhiteSpace(configuration.GetValue<string>($"{InvoiceStorageOptions.SectionName}:Region"))
            && !string.IsNullOrWhiteSpace(configuration.GetValue<string>($"{InvoiceStorageOptions.SectionName}:BucketName"));

        // Prefer S3 when an explicit provider says so, OR when region + bucket are
        // configured and we have AWS credentials available. KYC documents are PII
        // so we want them off the API host whenever real storage is available.
        var useS3 = HasAwsCredentials()
            && (string.Equals(configuredProvider, "s3", StringComparison.OrdinalIgnoreCase)
                || (string.IsNullOrWhiteSpace(configuredProvider) && hasS3Settings));

        if (useS3)
        {
            services.AddSingleton<IInvoiceBlobStorage, S3InvoiceBlobStorage>();
        }
        else
        {
            services.AddSingleton<IInvoiceBlobStorage, InMemoryInvoiceBlobStorage>();
        }

        services.AddSingleton<IMongoClient>(sp =>
        {
            var opts = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            var settings = MongoClientSettings.FromConnectionString(opts.ConnectionString);
            settings.ApplicationName = "weyell-api";
            return new MongoClient(settings);
        });

        services.AddSingleton<MongoContext>();
        services.AddHostedService<MongoIndexInitializer>();
        services.AddHostedService<BorderBoxPricingConfigSeeder>();
        services.AddHostedService<SuitePlatformConfigSeeder>();
        services.AddHostedService<SuitePlanSeeder>();
        services.AddHostedService<PickupBranchSeeder>();
        services.AddHostedService<PickupBranchLocationMigrator>();
        services.AddHostedService<DemoDataSeeder>();
        services.AddHostedService<OpsUserSeeder>();
        services.AddHostedService<WarehouseLocationSeeder>();
        services.AddHostedService<SuiteLocationSyncSeeder>();
        services.AddHostedService<ShipmentTrackingEventBackfillSeeder>();
        services.AddHostedService<LegacyOriginRebrandMigrator>();
        services.AddHostedService<MockParcelDataCleanupMigrator>();
        services.AddHostedService<SuiteNumberPoolBackfillMigrator>();
        services.AddHostedService<KycVerifiedSubmissionBackfillSeeder>();

        services.AddScoped<IUserRepository, MongoUserRepository>();
        services.AddScoped<IExternalIdentityRepository, MongoExternalIdentityRepository>();
        services.AddScoped<IRefreshTokenRepository, MongoRefreshTokenRepository>();
        services.AddScoped<ISuitePlanRepository, MongoSuitePlanRepository>();
        services.AddScoped<ISuiteSubscriptionRepository, MongoSuiteSubscriptionRepository>();
        services.AddScoped<ICustomerAddressRepository, MongoCustomerAddressRepository>();
        services.AddScoped<ICustomerInAppNotificationRepository, MongoCustomerInAppNotificationRepository>();
        services.AddScoped<IParcelRepository, MongoParcelRepository>();
        services.AddScoped<IParcelOpsMetadataRepository, MongoParcelOpsMetadataRepository>();
        services.AddScoped<IParcelOpsExceptionRepository, MongoParcelOpsExceptionRepository>();
        services.AddScoped<IOpsExceptionSupportNotificationRepository, MongoOpsExceptionSupportNotificationRepository>();
        services.AddScoped<IParcelOpsActivityRepository, MongoParcelOpsActivityRepository>();
        services.AddScoped<IParcelOpsPhotoRepository, MongoParcelOpsPhotoRepository>();
        services.AddScoped<IParcelInvoiceRepository, MongoParcelInvoiceRepository>();
        services.AddScoped<IShipmentRepository, MongoShipmentRepository>();
        services.AddScoped<IShipmentTrackingEventRepository, MongoShipmentTrackingEventRepository>();
        services.AddScoped<IQuoteRepository, MongoQuoteRepository>();
        services.AddScoped<IQuoteParcelRepository, MongoQuoteParcelRepository>();
        services.AddScoped<ISupportTicketRepository, MongoSupportTicketRepository>();
        services.AddScoped<ISuiteCheckoutPaymentRepository, MongoSuiteCheckoutPaymentRepository>();
        services.AddScoped<ICustomerSavedCardRepository, MongoCustomerSavedCardRepository>();
        services.AddScoped<IPaymentMethodAddIntentRepository, MongoPaymentMethodAddIntentRepository>();
        services.AddScoped<IQuoteCheckoutPaymentRepository, MongoQuoteCheckoutPaymentRepository>();
        services.AddScoped<IQuotePaymentInvoiceRepository, MongoQuotePaymentInvoiceRepository>();
        services.AddScoped<IBorderBoxPricingConfigRepository, MongoBorderBoxPricingConfigRepository>();
        services.AddScoped<ISuitePlatformConfigRepository, MongoSuitePlatformConfigRepository>();
        services.AddScoped<IPickupBranchRepository, MongoPickupBranchRepository>();
        services.AddScoped<IWarehouseLocationRepository, MongoWarehouseLocationRepository>();
        services.AddScoped<IWarehouseMovementRepository, MongoWarehouseMovementRepository>();
        services.AddScoped<IPickTaskRepository, MongoPickTaskRepository>();
        services.AddScoped<IPackingTaskRepository, MongoPackingTaskRepository>();
        services.AddScoped<IDispatchManifestRepository, MongoDispatchManifestRepository>();
        services.AddScoped<IShipmentCollectionRepository, MongoShipmentCollectionRepository>();
        services.AddScoped<IPlatformDashboardRepository, MongoPlatformDashboardRepository>();
        services.AddScoped<IKycSubmissionRepository, MongoKycSubmissionRepository>();
        services.AddScoped<IPayLaterIntentRepository, MongoPayLaterIntentRepository>();
        services.AddScoped<ISuiteNumberPoolRepository, MongoSuiteNumberPoolRepository>();
        services.AddScoped<ICustomerAccountEraser, MongoCustomerAccountEraser>();

        services.AddScoped<IUnitOfWork, MongoUnitOfWork>();
        services.AddScoped<IDomainEventCollector, DomainEventCollector>();
        services.AddScoped<IOutboxStore, MongoOutboxStore>();
        services.AddScoped<IAuditLogger, MongoAuditLogger>();
        services.AddScoped<IAuditLogReader, MongoAuditLogReader>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IPasswordHasher, BCryptPasswordHasher>();
        services.AddScoped<IJwtTokenIssuer, JwtTokenIssuer>();
        services.AddScoped<IOpsJwtTokenIssuer, OpsJwtTokenIssuer>();
        services.AddScoped<IOpsUserRepository, MongoOpsUserRepository>();
        services.AddScoped<IOpsInvitationRepository, MongoOpsInvitationRepository>();
        services.AddScoped<IAuthSessionIssuer, AuthSessionIssuer>();
        services.AddScoped<IGoogleIdTokenValidator, GoogleIdTokenValidator>();

        services.AddScoped<INotificationSender, EmailNotificationSender>();
        services.AddHttpClient<IWhatsAppSender, WasenderApiWhatsAppSender>((_, client) =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });
        services.AddSingleton<IBorderBoxWhatsAppNotifier, BorderBoxWhatsAppNotifier>();
        services.AddScoped<IBorderBoxEmailNotifier, BorderBoxEmailNotifier>();
        services.AddScoped<IBorderBoxInAppNotifier, BorderBoxInAppNotifier>();

        var outboxEnabled = configuration.GetValue($"{OutboxOptions.SectionName}:Enabled", true);
        if (outboxEnabled)
        {
            services.AddSingleton<OutboxDispatcherHeartbeat>();
            services.AddHostedService<OutboxDispatcherHostedService>();
        }

        var quoteQueueAutoProcessorEnabled = configuration.GetValue(
            $"{QuoteQueueAutoProcessorOptions.SectionName}:Enabled",
            true);
        if (quoteQueueAutoProcessorEnabled)
        {
            services.AddHostedService<QuoteQueueAutoProcessorHostedService>();
        }

        var opsExceptionAlertsEnabled = configuration.GetValue(
            $"{OpsExceptionSupportAlertOptions.SectionName}:Enabled",
            true);
        if (opsExceptionAlertsEnabled)
        {
            services.AddHostedService<OpsExceptionSupportAlertHostedService>();
        }

        RegisterEmailTransport(services, configuration);

        return services;
    }

    private static void RegisterEmailTransport(IServiceCollection services, IConfiguration configuration)
    {
        var sesEnabled = configuration.GetValue<bool>($"{NotificationSesOptions.SectionName}:Enabled");
        var sesRegion = configuration.GetValue<string>($"{NotificationSesOptions.SectionName}:Region");
        var useSes = sesEnabled
            && HasAwsCredentials()
            && !string.IsNullOrWhiteSpace(sesRegion);

        if (useSes)
        {
            services.AddSingleton<Amazon.SimpleEmail.IAmazonSimpleEmailService>(_ =>
                new Amazon.SimpleEmail.AmazonSimpleEmailServiceClient(
                    new Amazon.SimpleEmail.AmazonSimpleEmailServiceConfig
                    {
                        RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(sesRegion!),
                    }));
            services.AddScoped<IEmailTransport, SesEmailTransport>();
        }
        else
        {
            services.AddScoped<IEmailTransport, LoggingEmailTransport>();
        }
    }

    private static bool HasAwsCredentials()
    {
        static bool Present(string? value) => !string.IsNullOrWhiteSpace(value);

        return Present(Environment.GetEnvironmentVariable("AWS_ACCESS_KEY_ID"))
            && Present(Environment.GetEnvironmentVariable("AWS_SECRET_ACCESS_KEY"));
    }
}
