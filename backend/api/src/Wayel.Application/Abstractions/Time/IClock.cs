namespace Wayel.Application.Abstractions.Time;

/// <summary>
/// Clock abstraction so handlers don't read <c>DateTime.UtcNow</c> directly.
/// Tests substitute a frozen clock; in production it's a thin wrapper around the system clock.
/// </summary>
public interface IClock
{
    DateTime UtcNow { get; }
}
