using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record ListPendingKycReviewsQuery : IQuery<IReadOnlyList<PendingKycReviewDto>>;

internal sealed class ListPendingKycReviewsQueryHandler(IUserRepository users, IClock clock)
    : IQueryHandler<ListPendingKycReviewsQuery, IReadOnlyList<PendingKycReviewDto>>
{
    public async Task<Result<IReadOnlyList<PendingKycReviewDto>>> Handle(
        ListPendingKycReviewsQuery request,
        CancellationToken cancellationToken)
    {
        var pending = await users.ListByKycStatusAsync(KycStatus.Pending, cancellationToken);
        var nowUtc = clock.UtcNow;
        var list = pending
            .Select(u => new PendingKycReviewDto(
                u.Id.Value,
                u.Email.Value,
                u.DisplayName,
                u.Phone ?? string.Empty,
                string.IsNullOrWhiteSpace(u.IdDocumentType) ? "NationalId" : u.IdDocumentType,
                u.IdNumber,
                u.KycStatus.ToString(),
                u.KycSubmittedAtUtc ?? u.CreatedOnUtc,
                KycRiskScore.For(u, nowUtc)))
            .ToList();
        return list;
    }
}
