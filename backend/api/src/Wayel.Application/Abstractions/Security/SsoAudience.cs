namespace Wayel.Application.Abstractions.Security;

public enum SsoAudience
{
    Unknown = 0,
    /// <summary>Legacy alias — maps to customer portal BFF.</summary>
    Client = 2,
    /// <summary>Customer portal BFF (WeYell).</summary>
    External = 3,
}
