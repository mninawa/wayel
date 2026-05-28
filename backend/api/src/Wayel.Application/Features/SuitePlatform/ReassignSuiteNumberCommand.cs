using MediatR;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Ops command: release the suite number currently bound to <paramref name="UserId"/>
/// back to the pool and claim a fresh one. Used by the duplicate-reconciliation
/// workflow — never called by normal customer flows.
/// </summary>
public sealed record ReassignSuiteNumberCommand(Guid UserId) : ICommand<ReassignSuiteNumberResult>;

public sealed record ReassignSuiteNumberResult(
    Guid UserId,
    string PreviousSuiteNumber,
    string NewSuiteNumber);

internal sealed class ReassignSuiteNumberCommandHandler(IMediator mediator)
    : ICommandHandler<ReassignSuiteNumberCommand, ReassignSuiteNumberResult>
{
    public async Task<Result<ReassignSuiteNumberResult>> Handle(
        ReassignSuiteNumberCommand request,
        CancellationToken cancellationToken)
    {
        var updated = await mediator.Send(
            new UpdateCustomerSuiteNumberCommand(request.UserId, NewSuiteNumber: null, RegenerateFromPool: true),
            cancellationToken);

        if (updated.IsFailure)
        {
            return updated.Error;
        }

        var value = updated.Value;
        return new ReassignSuiteNumberResult(value.UserId, value.PreviousSuiteNumber, value.NewSuiteNumber);
    }
}
