namespace Wayel.Application.Abstractions.Persistence;

/// <summary>
/// Thrown by repositories when an insert violates a unique constraint
/// (e.g. tenant slug already taken). Lives in the abstractions layer so
/// application handlers can catch it without depending on a specific
/// storage technology.
/// </summary>
public sealed class DuplicateKeyException(string field, string value, Exception? inner = null)
    : Exception($"A record with {field} '{value}' already exists.", inner)
{
    public string Field { get; } = field;

    public string Value { get; } = value;
}
