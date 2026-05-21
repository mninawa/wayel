using FluentValidation;
using MediatR;
using Wayel.Domain.Common;

namespace Wayel.Application.Behaviors;

/// <summary>
/// Runs every registered FluentValidation validator for the incoming request.
/// On failure, short-circuits the pipeline by returning a validation <see cref="Result"/>
/// (or throwing a <see cref="ValidationException"/> if the response type doesn't carry one).
/// </summary>
public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!validators.Any())
        {
            return await next();
        }

        var context = new ValidationContext<TRequest>(request);
        var failures = (await Task.WhenAll(validators.Select(v => v.ValidateAsync(context, cancellationToken))))
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count == 0)
        {
            return await next();
        }

        var aggregated = string.Join("; ", failures.Select(f => $"{f.PropertyName}: {f.ErrorMessage}"));
        var error = Error.Validation("validation.failed", aggregated);

        if (typeof(TResponse) == typeof(Result))
        {
            return (TResponse)(object)Result.Failure(error);
        }

        if (typeof(TResponse).IsGenericType &&
            typeof(TResponse).GetGenericTypeDefinition() == typeof(Result<>))
        {
            var valueType = typeof(TResponse).GetGenericArguments()[0];
            var failure = typeof(Result)
                .GetMethod(nameof(Result.Failure), 1, [typeof(Error)])!
                .MakeGenericMethod(valueType)
                .Invoke(null, [error]);
            return (TResponse)failure!;
        }

        // Non-Result response: surface as a validation exception so the API translates it to ProblemDetails.
        throw new ValidationException(failures);
    }
}
