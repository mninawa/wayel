using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>Ops report: every suite number currently assigned to more than one user.</summary>
public sealed record ListSuiteNumberDuplicatesQuery : IQuery<IReadOnlyList<SuiteNumberDuplicateGroupDto>>;

public sealed record SuiteNumberDuplicateGroupDto(
    string SuiteNumber,
    IReadOnlyList<SuiteNumberDuplicateMemberDto> Members);

public sealed record SuiteNumberDuplicateMemberDto(
    Guid UserId,
    string Email,
    string DisplayName,
    string DestinationCountry,
    string Status,
    DateTime? StartedAt,
    DateTime? ExpiresAt,
    bool IsCanonicalOwner);

internal sealed class ListSuiteNumberDuplicatesQueryHandler(
    ISuiteSubscriptionRepository subscriptions)
    : IQueryHandler<ListSuiteNumberDuplicatesQuery, IReadOnlyList<SuiteNumberDuplicateGroupDto>>
{
    public async Task<Result<IReadOnlyList<SuiteNumberDuplicateGroupDto>>> Handle(
        ListSuiteNumberDuplicatesQuery request,
        CancellationToken cancellationToken)
    {
        var groups = await subscriptions.ListSuiteNumberDuplicatesAsync(cancellationToken);

        var result = new List<SuiteNumberDuplicateGroupDto>(groups.Count);
        foreach (var group in groups)
        {
            // Repository already sorted members so [0] is the earliest sign-up
            // — that's the "canonical owner" the ops UI should keep.
            var dtoMembers = new List<SuiteNumberDuplicateMemberDto>(group.Members.Count);
            for (var i = 0; i < group.Members.Count; i++)
            {
                var m = group.Members[i];
                dtoMembers.Add(new SuiteNumberDuplicateMemberDto(
                    m.UserId.Value,
                    m.Email,
                    m.DisplayName,
                    m.DestinationCountry,
                    m.Status.ToString(),
                    m.StartedAt,
                    m.ExpiresAt,
                    IsCanonicalOwner: i == 0));
            }

            result.Add(new SuiteNumberDuplicateGroupDto(group.SuiteNumber, dtoMembers));
        }

        return Result<IReadOnlyList<SuiteNumberDuplicateGroupDto>>.Success((IReadOnlyList<SuiteNumberDuplicateGroupDto>)result);
    }
}
