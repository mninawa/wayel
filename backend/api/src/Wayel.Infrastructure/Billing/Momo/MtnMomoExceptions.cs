namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>Base for all MTN MoMo client failures. Categorised by HTTP / business meaning.</summary>
public abstract class MtnMomoException(string message, Exception? inner = null) : Exception(message, inner)
{
}

public sealed class MtnMomoNetworkException(string message, Exception? inner = null)
    : MtnMomoException(message, inner);

public sealed class MtnMomoAuthException(string message, string? details = null)
    : MtnMomoException(message)
{
    public string? Details { get; } = details;
}

public sealed class MtnMomoForbiddenException(string message)
    : MtnMomoException(message);

public sealed class MtnMomoNotFoundException(string message)
    : MtnMomoException(message);

public sealed class MtnMomoConflictException(string message)
    : MtnMomoException(message);

public sealed class MtnMomoServerException(string message)
    : MtnMomoException(message);

/// <summary>Business-logic failure surfaced through MTN's standard error envelope.</summary>
public sealed class MtnMomoTransactionException(
    MtnMomoErrorCode errorCode,
    string message,
    string? rawCode = null)
    : MtnMomoException(message)
{
    public MtnMomoErrorCode ErrorCode { get; } = errorCode;
    public string? RawCode { get; } = rawCode;
}
