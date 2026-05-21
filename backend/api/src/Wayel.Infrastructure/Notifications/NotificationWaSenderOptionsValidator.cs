using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Fail-fast options validator for <see cref="NotificationWaSenderOptions"/>.
/// Only enforced when <see cref="NotificationWaSenderOptions.Enabled"/>
/// is true, so dev environments with WhatsApp turned off don't have to
/// hold a stub API key.
/// </summary>
internal sealed class NotificationWaSenderOptionsValidator : IValidateOptions<NotificationWaSenderOptions>
{
    public ValidateOptionsResult Validate(string? name, NotificationWaSenderOptions options)
    {
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            errors.Add($"{NotificationWaSenderOptions.SectionName}:ApiKey is required when Enabled is true.");
        }

        if (string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            errors.Add($"{NotificationWaSenderOptions.SectionName}:BaseUrl is required when Enabled is true.");
        }
        else if (!Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out _))
        {
            errors.Add($"{NotificationWaSenderOptions.SectionName}:BaseUrl must be an absolute URI.");
        }

        return errors.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(errors);
    }
}
