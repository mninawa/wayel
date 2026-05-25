using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;

namespace Wayel.Application.Features.SuitePlans;

/// <summary>
/// Admin-only listing that includes archived plans. Used by the ops dashboard
/// "Suite Plans" management page; the customer-facing catalogue uses
/// <see cref="ListSuitePlansQuery"/> which filters to active plans only.
/// </summary>
public sealed record ListAllSuitePlansQuery : IQuery<IReadOnlyList<SuitePlanAdminDto>>;

internal sealed class ListAllSuitePlansQueryHandler(ISuitePlanRepository plans)
    : IQueryHandler<ListAllSuitePlansQuery, IReadOnlyList<SuitePlanAdminDto>>
{
    public async Task<Result<IReadOnlyList<SuitePlanAdminDto>>> Handle(
        ListAllSuitePlansQuery request,
        CancellationToken cancellationToken)
    {
        var items = await plans.ListAllAsync(cancellationToken);
        return items
            .OrderBy(p => p.DurationMonths)
            .ThenBy(p => p.PriceZar)
            .Select(SuitePlanAdminDto.FromDomain)
            .ToList();
    }
}

public sealed record CreateSuitePlanCommand(
    string Name,
    int DurationMonths,
    decimal PriceZar,
    bool IsRecommended) : ICommand<SuitePlanAdminDto>;

internal sealed class CreateSuitePlanCommandHandler(ISuitePlanRepository plans)
    : ICommandHandler<CreateSuitePlanCommand, SuitePlanAdminDto>
{
    public async Task<Result<SuitePlanAdminDto>> Handle(
        CreateSuitePlanCommand request,
        CancellationToken cancellationToken)
    {
        var validation = ValidateInput(request.Name, request.DurationMonths, request.PriceZar);
        if (validation is not null) return validation;

        var plan = SuitePlan.Create(request.Name, request.DurationMonths, request.PriceZar, request.IsRecommended);
        await plans.AddAsync(plan, cancellationToken);
        return SuitePlanAdminDto.FromDomain(plan);
    }

    internal static Error? ValidateInput(string name, int durationMonths, decimal priceZar)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Error.Validation("plan.name_required", "Plan name is required.");
        }

        if (durationMonths < 1 || durationMonths > 36)
        {
            return Error.Validation("plan.duration_invalid", "Duration must be between 1 and 36 months.");
        }

        if (priceZar < 0)
        {
            return Error.Validation("plan.price_negative", "Price cannot be negative.");
        }

        return null;
    }
}

public sealed record UpdateSuitePlanCommand(
    Guid PlanId,
    string Name,
    int DurationMonths,
    decimal PriceZar,
    bool IsRecommended) : ICommand<SuitePlanAdminDto>;

internal sealed class UpdateSuitePlanCommandHandler(ISuitePlanRepository plans)
    : ICommandHandler<UpdateSuitePlanCommand, SuitePlanAdminDto>
{
    public async Task<Result<SuitePlanAdminDto>> Handle(
        UpdateSuitePlanCommand request,
        CancellationToken cancellationToken)
    {
        var validation = CreateSuitePlanCommandHandler.ValidateInput(
            request.Name,
            request.DurationMonths,
            request.PriceZar);
        if (validation is not null) return validation;

        var plan = await plans.GetByIdAsync(new SuitePlanId(request.PlanId), cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("plan.not_found", "Plan not found.");
        }

        plan.Update(request.Name, request.DurationMonths, request.PriceZar, request.IsRecommended);
        await plans.UpdateAsync(plan, cancellationToken);
        return SuitePlanAdminDto.FromDomain(plan);
    }
}

public sealed record SetSuitePlanActiveCommand(Guid PlanId, bool IsActive) : ICommand<SuitePlanAdminDto>;

internal sealed class SetSuitePlanActiveCommandHandler(ISuitePlanRepository plans)
    : ICommandHandler<SetSuitePlanActiveCommand, SuitePlanAdminDto>
{
    public async Task<Result<SuitePlanAdminDto>> Handle(
        SetSuitePlanActiveCommand request,
        CancellationToken cancellationToken)
    {
        var plan = await plans.GetByIdAsync(new SuitePlanId(request.PlanId), cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("plan.not_found", "Plan not found.");
        }

        if (request.IsActive) plan.Activate();
        else plan.Deactivate();
        await plans.UpdateAsync(plan, cancellationToken);
        return SuitePlanAdminDto.FromDomain(plan);
    }
}

/// <summary>
/// Admin DTO with <c>IsActive</c> exposed; customer-facing
/// <see cref="SuitePlanDto"/> omits it since the catalogue is filtered to active.
/// </summary>
public sealed record SuitePlanAdminDto(
    Guid Id,
    string Name,
    int DurationMonths,
    decimal PriceZar,
    bool IsRecommended,
    bool IsActive)
{
    public static SuitePlanAdminDto FromDomain(SuitePlan plan) =>
        new(plan.Id.Value, plan.Name, plan.DurationMonths, plan.PriceZar, plan.IsRecommended, plan.IsActive);
}
