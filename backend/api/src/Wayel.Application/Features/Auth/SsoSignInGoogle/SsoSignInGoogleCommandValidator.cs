using FluentValidation;

namespace Wayel.Application.Features.Auth.SsoSignInGoogle;

internal sealed class SsoSignInGoogleCommandValidator : AbstractValidator<SsoSignInGoogleCommand>
{
    public SsoSignInGoogleCommandValidator()
    {
        RuleFor(x => x.IdToken)
            .NotEmpty()
            .WithMessage("Google id_token is required.")
            .MaximumLength(8192);

        RuleFor(x => x.Audience)
            .NotEqual(Wayel.Application.Abstractions.Security.SsoAudience.Unknown)
            .WithMessage("A known SSO audience (admin/client/external) is required.");
    }
}
