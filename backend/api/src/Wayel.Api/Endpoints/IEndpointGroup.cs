namespace Wayel.Api.Endpoints;

/// <summary>
/// A self-contained group of endpoints. Discovered via assembly scanning at startup
/// and mapped under the API root group, so adding a feature is just adding a new file.
/// </summary>
public interface IEndpointGroup
{
    void Map(IEndpointRouteBuilder routes);
}
