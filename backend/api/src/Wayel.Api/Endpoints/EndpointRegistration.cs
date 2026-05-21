namespace Wayel.Api.Endpoints;

public static class EndpointRegistration
{
    public static IServiceCollection AddEndpoints(this IServiceCollection services)
    {
        var groups = typeof(EndpointRegistration).Assembly
            .GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(IEndpointGroup).IsAssignableFrom(t));

        foreach (var t in groups)
        {
            services.AddSingleton(typeof(IEndpointGroup), t);
        }

        return services;
    }

    public static IEndpointRouteBuilder MapEndpoints(this WebApplication app)
    {
        var root = app.MapGroup("/api/v1");
        foreach (var group in app.Services.GetServices<IEndpointGroup>())
        {
            group.Map(root);
        }

        return app;
    }
}
