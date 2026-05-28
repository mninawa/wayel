using MongoDB.Bson.Serialization.Attributes;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class OpsUserDocument
{
    [BsonId]
    public Guid Id { get; set; }

    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "clerk";
    public string? GoogleSubject { get; set; }
    public bool IsDisabled { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? LastLoginAtUtc { get; set; }

    public List<string> Regions { get; set; } = [];

    public static OpsUserDocument From(OpsUserRecord user) =>
        new()
        {
            Id = user.Id,
            Email = user.Email,
            DisplayName = user.DisplayName,
            Role = user.Role,
            GoogleSubject = user.GoogleSubject,
            IsDisabled = user.IsDisabled,
            CreatedAtUtc = user.CreatedAtUtc,
            LastLoginAtUtc = user.LastLoginAtUtc,
            Regions = user.Regions.ToList(),
        };

    public OpsUserRecord ToRecord() =>
        new(
            Id,
            Email,
            DisplayName,
            Role,
            GoogleSubject,
            IsDisabled,
            CreatedAtUtc,
            LastLoginAtUtc,
            OpsRegions.Normalize(Regions));
}
