namespace Wayel.Domain.Common;

/// <summary>
/// Base type for domain entities. Identity-based equality.
/// </summary>
public abstract class Entity<TId>(TId id) : IEquatable<Entity<TId>>
    where TId : notnull
{
    public TId Id { get; protected set; } = id;

    public bool Equals(Entity<TId>? other) =>
        other is not null && other.GetType() == GetType() && other.Id.Equals(Id);

    public override bool Equals(object? obj) => obj is Entity<TId> other && Equals(other);

    public override int GetHashCode() => Id.GetHashCode();

    public static bool operator ==(Entity<TId>? left, Entity<TId>? right) =>
        left is null ? right is null : left.Equals(right);

    public static bool operator !=(Entity<TId>? left, Entity<TId>? right) => !(left == right);
}
