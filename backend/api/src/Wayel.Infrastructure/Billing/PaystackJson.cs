using System.Text.Json;

namespace Wayel.Infrastructure.Billing;

internal static class PaystackJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}
