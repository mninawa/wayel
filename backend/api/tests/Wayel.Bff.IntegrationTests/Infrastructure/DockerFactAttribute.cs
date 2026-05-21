using System.Diagnostics;

namespace Wayel.Bff.IntegrationTests.Infrastructure;

/// <summary>
/// xUnit Fact that auto-skips if Docker isn't reachable. Mirrors the attribute
/// in <c>Wayel.Api.IntegrationTests</c> — duplicated here so the BFF test
/// project doesn't need to project-reference the API test project (which
/// would re-import <c>Wayel.Api</c> without the extern alias and reintroduce
/// the <c>Program</c> ambiguity these tests carefully avoid).
/// </summary>
public sealed class DockerFactAttribute : FactAttribute
{
    private static readonly Lazy<bool> DockerAvailable = new(IsDockerAvailable);

    public DockerFactAttribute()
    {
        if (!DockerAvailable.Value)
        {
            Skip = "Docker is not available on this host.";
        }
    }

    private static bool IsDockerAvailable()
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo("docker", "info")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            });
            if (p is null)
            {
                return false;
            }

            p.WaitForExit(2000);
            return p.HasExited && p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
