using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Thin REST client for the MTN MoMo Disbursements product. Used for refunds and agent payouts.
/// </summary>
internal sealed class MtnMomoDisbursementsClient(
    IHttpClientFactory httpClientFactory,
    IOptions<MtnMomoOptions> options,
    MtnMomoTokenManager tokens)
{
    private const MtnMomoTokenManager.Product Product = MtnMomoTokenManager.Product.Disbursement;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(tokens.ResolveSubscriptionKey(Product));

    /// <summary>POST /disbursement/v1_0/transfer — push funds to a payee MSISDN.</summary>
    public async Task TransferAsync(
        string referenceId,
        MomoTransfer body,
        CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var request = new HttpRequestMessage(HttpMethod.Post, "disbursement/v1_0/transfer"))
        {
            request.Headers.Add("X-Reference-Id", referenceId);
            request.Content = JsonContent.Create(body, options: MtnMomoJson.Options);

            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>GET /disbursement/v1_0/transfer/{referenceId} — poll status.</summary>
    public async Task<MomoTransactionStatus> GetTransferStatusAsync(
        string referenceId,
        CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var response = await client.GetAsync(
            $"disbursement/v1_0/transfer/{Uri.EscapeDataString(referenceId)}",
            cancellationToken).ConfigureAwait(false))
        {
            await MtnMomoHttpHelpers.EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
            return await response.Content.ReadFromJsonAsync<MomoTransactionStatus>(
                MtnMomoJson.Options,
                cancellationToken).ConfigureAwait(false)
                ?? new MomoTransactionStatus { Status = "PENDING" };
        }
    }

    /// <summary>GET /disbursement/v1_0/account/balance — disbursement float.</summary>
    public async Task<MomoBalance> GetBalanceAsync(CancellationToken cancellationToken = default)
    {
        var (client, _) = await CreateAuthedClientAsync(cancellationToken).ConfigureAwait(false);
        using (client)
        using (var response = await client.GetAsync("disbursement/v1_0/account/balance", cancellationToken).ConfigureAwait(false))
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
            nameof(MtnMomoDisbursementsClient),
            subKey,
            token);
        return (client, token);
    }
}
