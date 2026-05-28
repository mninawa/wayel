using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record ProcessOpsExceptionSupportAlertsCommand : ICommand<ProcessOpsExceptionSupportAlertsResultDto>;

public sealed record ProcessOpsExceptionSupportAlertsResultDto(
    int OpenExceptionCount,
    int NotifiedCount,
    int SkippedAlreadyNotified);

internal sealed class ProcessOpsExceptionSupportAlertsCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsExceptionRepository exceptionWorkflows,
    IUserRepository users,
    IOpsExceptionSupportNotificationRepository supportNotifications,
    IBorderBoxWhatsAppNotifier whatsApp,
    IOptions<OpsExceptionSupportAlertOptions> options,
    IClock clock) : ICommandHandler<ProcessOpsExceptionSupportAlertsCommand, ProcessOpsExceptionSupportAlertsResultDto>
{
    public async Task<Result<ProcessOpsExceptionSupportAlertsResultDto>> Handle(
        ProcessOpsExceptionSupportAlertsCommand request,
        CancellationToken cancellationToken)
    {
        var cfg = options.Value;
        var all = await OpsReceivingExceptionScanner.ScanAllAsync(
            parcels,
            invoices,
            opsMetadata,
            exceptionWorkflows,
            users,
            clock,
            cancellationToken);

        var open = all.Where(OpsReceivingExceptionScanner.IsOpen).ToList();
        if (open.Count == 0)
        {
            return new ProcessOpsExceptionSupportAlertsResultDto(0, 0, 0);
        }

        var queueUrl = BuildQueueUrl(cfg);
        var notified = 0;
        var skipped = 0;
        var now = clock.UtcNow;

        foreach (var item in open.OrderByDescending(x => x.IsOverdue).ThenBy(x => x.DueAtUtc))
        {
            if (notified >= cfg.MaxAlertsPerRun)
            {
                break;
            }

            var parcelId = new ParcelId(item.ParcelId);
            if (await supportNotifications.WasNotifiedAsync(parcelId, item.ExceptionType, cancellationToken))
            {
                skipped++;
                continue;
            }

            await whatsApp.NotifySupportInboxOfReceivingExceptionAsync(item, queueUrl, cancellationToken);
            await supportNotifications.MarkNotifiedAsync(parcelId, item.ExceptionType, now, cancellationToken);
            notified++;
        }

        return new ProcessOpsExceptionSupportAlertsResultDto(open.Count, notified, skipped);
    }

    private static string BuildQueueUrl(OpsExceptionSupportAlertOptions cfg)
    {
        var baseUrl = cfg.OpsPortalBaseUrl.Trim().TrimEnd('/');
        var path = cfg.ExceptionsPath.Trim();
        if (!path.StartsWith('/'))
        {
            path = "/" + path;
        }

        return baseUrl + path;
    }
}
