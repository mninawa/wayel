using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Seeds <see cref="MtnMomoRuntimeCredentials"/> from configuration at startup
/// and, when running against the MoMo sandbox with auto-provisioning enabled,
/// mints a fresh API user + API key via <see cref="MtnMomoSandboxProvisioner"/>.
///
/// <para>Failures are logged and swallowed — they should not block API startup.
/// The downstream <see cref="MtnMomoPaymentGateway"/> will simply surface a
/// typed <c>payment_gateway.misconfigured</c> error if credentials are missing
/// at request time.</para>
/// </summary>
internal sealed class MtnMomoBootstrapHostedService(
    IOptions<MtnMomoOptions> options,
    MtnMomoRuntimeCredentials credentials,
    MtnMomoSandboxProvisioner provisioner,
    ILogger<MtnMomoBootstrapHostedService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var opts = options.Value;
        credentials.Set(opts.ApiUser, opts.ApiKey);

        if (!opts.Enabled)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(opts.ApiUser) && !string.IsNullOrWhiteSpace(opts.ApiKey))
        {
            logger.LogInformation(
                "MoMo credentials present in configuration; skipping sandbox provisioning. ApiUser={ApiUser}",
                opts.ApiUser);
            return;
        }

        if (!opts.AutoProvisionSandbox)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(opts.SubscriptionKey))
        {
            logger.LogWarning(
                "MoMo AutoProvisionSandbox=true but SubscriptionKey is empty. Skipping.");
            return;
        }

        try
        {
            var callbackHostInput = string.IsNullOrWhiteSpace(opts.CallbackHost)
                ? "wayel.dev"
                : opts.CallbackHost.Trim();
            if (!callbackHostInput.Contains("://", StringComparison.Ordinal))
            {
                callbackHostInput = $"https://{callbackHostInput}";
            }
            var callbackUri = new Uri(callbackHostInput);

            logger.LogInformation(
                "Provisioning MoMo sandbox API user (callback host: {CallbackHost})…",
                callbackUri.Host);

            var creds = await provisioner
                .ProvisionAsync(opts.SubscriptionKey, callbackUri, cancellationToken)
                .ConfigureAwait(false);
            credentials.Set(creds.ApiUser, creds.ApiKey);

            logger.LogInformation(
                "MoMo sandbox provisioned successfully. ApiUser={ApiUser}",
                creds.ApiUser);
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "MoMo sandbox auto-provisioning failed. MoMo payments will be unavailable until credentials are supplied.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
