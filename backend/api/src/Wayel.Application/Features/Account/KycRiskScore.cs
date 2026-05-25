using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

/// <summary>
/// Server-side KYC risk score that the ops dashboard surfaces alongside
/// each applicant. The exact policy is intentionally simple and
/// deterministic so it can be reproduced from a user row alone — the
/// dashboard then renders a Low/Medium/High pill from the string.
/// </summary>
internal static class KycRiskScore
{
    public static string For(User user, DateTime nowUtc)
    {
        if (user.KycStatus == KycStatus.Rejected)
        {
            return "High";
        }

        if (user.KycStatus == KycStatus.Verified)
        {
            return "Low";
        }

        var indicators = 0;

        if (string.IsNullOrWhiteSpace(user.Phone))
        {
            indicators++;
        }

        if (string.IsNullOrWhiteSpace(user.IdNumber))
        {
            indicators++;
        }

        if (user.KycSubmittedAtUtc is { } submitted)
        {
            var ageDays = (nowUtc - submitted).TotalDays;
            if (ageDays >= 7) indicators++;
            if (ageDays >= 14) indicators++;
        }

        return indicators switch
        {
            >= 3 => "High",
            >= 1 => "Medium",
            _ => "Low",
        };
    }
}
