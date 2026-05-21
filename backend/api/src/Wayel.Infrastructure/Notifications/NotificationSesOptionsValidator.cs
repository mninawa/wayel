using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Notifications;

internal sealed class NotificationSesOptionsValidator : IValidateOptions<NotificationSesOptions>
{
    public ValidateOptionsResult Validate(string? name, NotificationSesOptions options)
    {
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        if (string.IsNullOrWhiteSpace(options.FromAddress))
        {
            return ValidateOptionsResult.Fail(
                $"{NotificationSesOptions.SectionName}:FromAddress is required when Enabled is true.");
        }

        if (string.IsNullOrWhiteSpace(options.Region))
        {
            return ValidateOptionsResult.Fail(
                $"{NotificationSesOptions.SectionName}:Region is required when Enabled is true.");
        }

        return ValidateOptionsResult.Success;
    }
}
