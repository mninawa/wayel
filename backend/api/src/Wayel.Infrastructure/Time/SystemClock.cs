using Wayel.Application.Abstractions.Time;

namespace Wayel.Infrastructure.Time;

internal sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
