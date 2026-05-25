using Wayel.Application.Features.Quotes;

namespace Wayel.Application.Abstractions.Persistence;

public interface IBorderBoxPricingConfigRepository
{
    Task<BorderBoxPricingSettings?> GetAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(BorderBoxPricingSettings settings, CancellationToken cancellationToken = default);
}
