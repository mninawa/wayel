using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Parcels;

public sealed record ProcessAutoQuoteQueueCommand : ICommand<ProcessAutoQuoteQueueResultDto>;

public sealed record ProcessAutoQuoteQueueResultDto(int ProcessedCount);

internal sealed class ProcessAutoQuoteQueueCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsActivityRepository activities,
    IUserRepository users,
    IBorderBoxWhatsAppNotifier whatsApp,
    IUnitOfWork unitOfWork,
    IClock clock,
    IOptions<QuoteQueueAutoProcessorOptions> options) : ICommandHandler<ProcessAutoQuoteQueueCommand, ProcessAutoQuoteQueueResultDto>
{
    public async Task<Result<ProcessAutoQuoteQueueResultDto>> Handle(
        ProcessAutoQuoteQueueCommand request,
        CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return new ProcessAutoQuoteQueueResultDto(0);
        }

        var maxPerRun = Math.Clamp(options.Value.MaxParcelsPerRun, 1, 200);
        var processed = 0;
        const int batchSize = 100;
        var offset = 0;

        while (processed < maxPerRun)
        {
            var batch = await parcels.ListRecentPageAsync(offset, batchSize, cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            foreach (var parcel in batch)
            {
                if (processed >= maxPerRun)
                {
                    break;
                }

                var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
                var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
                var promoted = await OpsQuoteQueuePromoter.TryPromoteAsync(
                    parcel,
                    invoice,
                    meta,
                    parcels,
                    activities,
                    users,
                    whatsApp,
                    clock,
                    actor: "system",
                    cancellationToken);
                if (promoted)
                {
                    processed++;
                }
            }

            offset += batch.Count;
            if (batch.Count < batchSize)
            {
                break;
            }
        }

        if (processed > 0)
        {
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return new ProcessAutoQuoteQueueResultDto(processed);
    }
}
