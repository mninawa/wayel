namespace Wayel.Application.Features.OpsAuth;

public static class OpsEmailNormalizer
{
    public static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
