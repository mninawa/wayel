namespace Wayel.Application.Abstractions.Security;

public interface IOpsCallerContext
{
    bool IsOps { get; }
    string Role { get; }
    string Actor { get; }
}
