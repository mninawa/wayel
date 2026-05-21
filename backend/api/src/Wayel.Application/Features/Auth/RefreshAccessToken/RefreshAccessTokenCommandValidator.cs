using FluentValidation;

namespace Wayel.Application.Features.Auth.RefreshAccessToken;

internal sealed class RefreshAccessTokenCommandValidator : AbstractValidator<RefreshAccessTokenCommand>
{
    public RefreshAccessTokenCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty()
            .WithMessage("Refresh token is required.")
            .MaximumLength(512);
    }
}
