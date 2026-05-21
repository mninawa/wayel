namespace Wayel.Domain.Common;

/// <summary>
/// Marker interface for strongly-typed identifiers. Concrete IDs are <c>readonly record struct</c>
/// wrappers around a <see cref="Guid"/> (UUID v7 by default — time-ordered, index-friendly).
/// </summary>
public interface IStronglyTypedId
{
    Guid Value { get; }
}

public static class StronglyTypedId
{
    /// <summary>
    /// Generate a UUID v7 — sortable by creation time, ideal for MongoDB primary indexes.
    /// </summary>
    public static Guid NewId() => Guid.CreateVersion7();
}
