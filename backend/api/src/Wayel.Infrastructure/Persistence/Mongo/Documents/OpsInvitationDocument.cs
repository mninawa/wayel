using MongoDB.Bson.Serialization.Attributes;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class OpsInvitationDocument
{
    [BsonId]
    public Guid Id { get; set; }

    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = "clerk";
    public List<string> Regions { get; set; } = [];
    public string Token { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public DateTime ExpiresAtUtc { get; set; }
    public string InvitedByEmail { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? AcceptedAtUtc { get; set; }

    public static OpsInvitationDocument From(OpsInvitationRecord invitation) =>
        new()
        {
            Id = invitation.Id,
            Email = invitation.Email,
            Role = invitation.Role,
            Regions = invitation.Regions.ToList(),
            Token = invitation.Token,
            Status = invitation.Status,
            ExpiresAtUtc = invitation.ExpiresAtUtc,
            InvitedByEmail = invitation.InvitedByEmail,
            CreatedAtUtc = invitation.CreatedAtUtc,
            AcceptedAtUtc = invitation.AcceptedAtUtc,
        };

    public OpsInvitationRecord ToRecord() =>
        new(
            Id,
            Email,
            Role,
            OpsRegions.Normalize(Regions),
            Token,
            Status,
            ExpiresAtUtc,
            InvitedByEmail,
            CreatedAtUtc,
            AcceptedAtUtc);
}
