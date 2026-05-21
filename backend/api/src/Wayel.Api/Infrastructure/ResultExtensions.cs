using Wayel.Domain.Common;

namespace Wayel.Api.Infrastructure;

internal static class ResultExtensions
{
    public static IResult ToHttpResult(this Result result, IResult? successResult = null) =>
        result.IsSuccess
            ? successResult ?? Results.NoContent()
            : ToProblem(result.Error);

    public static IResult ToHttpResult<T>(this Result<T> result, Func<T, IResult>? onSuccess = null) =>
        result.IsSuccess
            ? onSuccess?.Invoke(result.Value) ?? Results.Ok(result.Value)
            : ToProblem(result.Error);

    private static IResult ToProblem(Error error)
    {
        var statusCode = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            ErrorType.Unexpected => StatusCodes.Status500InternalServerError,
            _ => StatusCodes.Status400BadRequest,
        };

        return Results.Problem(
            title: error.Code,
            detail: error.Message,
            statusCode: statusCode,
            type: $"https://wayel.dev/errors/{error.Code}");
    }
}
