namespace Wayel.Application.Configuration;

/// <summary>Background promotion of ops-ready parcels to customer quote queue.</summary>
public sealed class QuoteQueueAutoProcessorOptions
{
    public const string SectionName = "BorderBox:QuoteQueueAutoProcessor";

    public bool Enabled { get; init; } = true;

    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMinutes(1);

    public int MaxParcelsPerRun { get; init; } = 50;
}
