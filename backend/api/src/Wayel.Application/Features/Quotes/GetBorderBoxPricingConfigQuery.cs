using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Quotes;

public sealed record GetBorderBoxPricingConfigQuery : IQuery<BorderBoxPricingConfigDto>;

internal sealed class GetBorderBoxPricingConfigQueryHandler(
    IBorderBoxPricingConfigRepository repository,
    IOptions<BorderBoxPricingOptions> pricingOptions)
    : IQueryHandler<GetBorderBoxPricingConfigQuery, BorderBoxPricingConfigDto>
{
    public async Task<Result<BorderBoxPricingConfigDto>> Handle(
        GetBorderBoxPricingConfigQuery request,
        CancellationToken cancellationToken)
    {
        var settings = await BorderBoxPricingConfigLoader.LoadAsync(
            repository,
            pricingOptions,
            cancellationToken);
        return settings.ToDto();
    }
}
