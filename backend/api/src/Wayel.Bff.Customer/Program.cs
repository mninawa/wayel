using Wayel.Bff.Shared.Composition;
using Wayel.Bff.Shared.Configuration;
using Wayel.Bff.Shared.Health;
using Wayel.Bff.Shared.OpenApi;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, services, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Console());

    builder.Services.AddBff(builder.Configuration, builder.Environment);
    builder.Services.AddBffHealthChecks();
    builder.Services.AddBffOpenApi("Client");

    builder.Services.AddCors(options => options.AddDefaultPolicy(p =>
    {
        var spa = builder.Configuration[$"{BffOptions.SectionName}:SpaBaseUri"] ?? "http://localhost:4202";
        p.WithOrigins(spa.TrimEnd('/'))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    }));

    var app = builder.Build();

    app.UseSerilogRequestLogging();

    if (!app.Environment.IsDevelopment())
    {
        app.UseHsts();
    }

    app.UseCors();
    app.UseBff();

    app.MapBffHealthChecks();
    app.MapBffOpenApi("Client");

    await app.RunAsync();
}
catch (Exception ex) when (ex is not OperationCanceledException)
{
    Log.Fatal(ex, "Wayel.Bff.Customer terminated unexpectedly.");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

public partial class Program;
