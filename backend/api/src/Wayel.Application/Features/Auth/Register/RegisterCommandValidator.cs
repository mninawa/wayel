using FluentValidation;

namespace Wayel.Application.Features.Auth.Register;

internal sealed class RegisterCommandValidator : AbstractValidator<RegisterCommand>
{
    public RegisterCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254);

        // Match the password policy used by login + the existing parent
        // mock so a password accepted at sign-up is also accepted at sign-in.
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(256);

        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .MaximumLength(120);

        RuleFor(x => x.Phone)
            .MaximumLength(40)
            .When(x => !string.IsNullOrWhiteSpace(x.Phone));

        // Only `parent` is honoured today; we still accept the field so the
        // Phase0 contract stays stable. Staff onboarding goes through
        // /staff-invitations/accept where a tenant admin issued the invite.
        RuleFor(x => x.Role)
            .NotEmpty()
            .Must(r => string.Equals(r, "parent", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Self-service registration only supports the 'parent' role. Staff accounts are created from an institution invite.");
    }
}
