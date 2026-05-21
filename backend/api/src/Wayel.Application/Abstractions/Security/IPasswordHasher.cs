namespace Wayel.Application.Abstractions.Security;

/// <summary>
/// Abstraction over the password hashing algorithm. Concrete implementation lives in Infrastructure.
/// </summary>
public interface IPasswordHasher
{
    string Hash(string plaintext);

    bool Verify(string plaintext, string hash);
}
