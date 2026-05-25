using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Thin REST client for the MTN MoMo Collections product.
/// </summary>
internal sealed class MtnMomoCollectionsClient(
    IHttpClientFactory httpClientFactory,
    IOptions<MtnMomoOptions> options,
    MtnMomoTokenManager tokens)
{
    private const MtnMomoTokenManager.Product Product = MtnMomoTokenManager.Product.Collection;

    /// <summary>POST /collection/v1_0/requesttopay — push a payment prompt to the payer's handset.</summary>
    public async Task RequestToPayAsync(
        string referenceId,
        MomoRequestToPay body,
        CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var request = new HttpRequestMessage(HttpMethod.Post, "collection/v1_0/requesttopay"))
        {
            request.Headers.Add("X-Reference-Id", referenceId);
            request.Content = JsonContent.Create(body, options: MtnMomoJson.Options);

            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>GET /collection/v1_0/requesttopay/{referenceId} — poll status.</summary>
    public async Task<MomoTransactionStatus> GetRequestToPayStatusAsync(
        string referenceId,
        CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var response = await client.GetAsync(
            $"collection/v1_0/requesttopay/{Uri.EscapeDataString(referenceId)}",
            cancellationToken).ConfigureAwait(false))
        {
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
            return await response.Content.ReadFromJsonAsync<MomoTransactionStatus>(
                MtnMomoJson.Options,
                cancellationToken).ConfigureAwait(false)
                ?? new MomoTransactionStatus { Status = "PENDING" };
        }
    }

    /// <summary>GET /collection/v1_0/accountholder/MSISDN/{msisdn}/active — verify the wallet exists and is active.</summary>
    public async Task<bool> IsAccountHolderActiveAsync(string msisdn, CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        var normalised = MtnMomoHttpHelpers.NormaliseMsisdn(msisdn);
        using (client)
        using (var response = await client.GetAsync(
            $"collection/v1_0/accountholder/MSISDN/{Uri.EscapeDataString(normalised)}/active",
            cancellationToken).ConfigureAwait(false))
        {
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadFromJsonAsync<MomoAccountHolder>(
                MtnMomoJson.Options,
                cancellationToken).ConfigureAwait(false);
            return body?.Result ?? false;
        }
    }

    /// <summary>GET /collection/v1_0/account/balance — current merchant float.</summary>
    public async Task<MomoBalance> GetBalanceAsync(CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var response = await client.GetAsync("collection/v1_0/account/balance", cancellationToken).ConfigureAwait(false))
        {
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
            return await response.Content.ReadFromJsonAsync<MomoBalance>(
                MtnMomoJson.Options,
                cancellationToken).ConfigureAwait(false)
                ?? new MomoBalance();
        }
    }

    private async Task<(HttpClient Client, string Token)> CreateAuthedClientAsync(CancellationToken cancellationToken)
    {
        var token = await tokens.GetAccessTokenAsync(Product, cancellationToken).ConfigureAwait(false);
        var subKey = tokens.ResolveSubscriptionKey(Product);
        var client = MtnMomoHttpHelpers.BuildProductClient(
            httpClientFactory,
            options,
            nameof(MtnMomoCollectionsClient),
            subKey,
            token);
        return (client, token);
    }
}
