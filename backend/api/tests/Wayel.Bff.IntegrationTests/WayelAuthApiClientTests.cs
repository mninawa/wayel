using System.Net;
using FluentAssertions;
using Wayel.Bff.Shared.ApiClient;

namespace Wayel.Bff.IntegrationTests;

/// <summary>
/// Pure unit tests for <see cref="WayelAuthApiClient.GetMeAsync"/>. The
/// behaviour exercised here is the new "did the upstream say the session
/// is dead?" branch — i.e. <see cref="WayelMeResult.IsSessionRejected"/>
/// must light up for 401 / 403 / 404 and stay off for 5xx + network /
/// timeout failures so the BFF /me endpoint can sign out cookies for the
/// former and degrade gracefully for the latter.
/// </summary>
public sealed class WayelAuthApiClientTests
{
    private static WayelAuthApiClient ClientReturning(
        HttpStatusCode status,
        string? body = null) =>
        new(new HttpClient(new StubHandler(status, body))
        {
            BaseAddress = new Uri("http://upstream.test"),
        });

    [Fact]
    public async Task GetMeAsync_returns_dto_and_200_on_success()
    {
        var json = """
            {
              "userId": "00000000-0000-0000-0000-000000000001",
              "tenantId": null,
              "email": "e@e.test",
              "displayName": "Eve",
              "role": "Customer",
              "tenant": null
            }
            """;
        var sut = ClientReturning(HttpStatusCode.OK, json);

        var result = await sut.GetMeAsync("bearer-x", CancellationToken.None);

        result.StatusCode.Should().Be(200);
        result.IsSessionRejected.Should().BeFalse();
        result.Dto.Should().NotBeNull();
        result.Dto!.Email.Should().Be("e@e.test");
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, 401)]
    [InlineData(HttpStatusCode.Forbidden, 403)]
    [InlineData(HttpStatusCode.NotFound, 404)]
    public async Task GetMeAsync_flags_session_rejected_on_401_403_404(
        HttpStatusCode status,
        int expectedCode)
    {
        var sut = ClientReturning(status);

        var result = await sut.GetMeAsync("bearer-x", CancellationToken.None);

        result.StatusCode.Should().Be(expectedCode);
        result.IsSessionRejected.Should().BeTrue();
        result.Dto.Should().BeNull();
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError, 500)]
    [InlineData(HttpStatusCode.BadGateway, 502)]
    [InlineData(HttpStatusCode.ServiceUnavailable, 503)]
    public async Task GetMeAsync_does_not_flag_session_rejected_on_5xx(
        HttpStatusCode status,
        int expectedCode)
    {
        var sut = ClientReturning(status);

        var result = await sut.GetMeAsync("bearer-x", CancellationToken.None);

        result.StatusCode.Should().Be(expectedCode);
        result.IsSessionRejected.Should().BeFalse();
        result.Dto.Should().BeNull();
    }

    [Fact]
    public async Task GetMeAsync_returns_status_0_on_network_failure()
    {
        // Behaviour contract for the BFF: a transient network blip must
        // not flag the session as rejected. The client surfaces it as
        // StatusCode == 0 + Dto == null so the BFF degrades gracefully
        // (keeps the cookie, returns the cookie-identity slice).
        var http = new HttpClient(new ThrowingHandler())
        {
            BaseAddress = new Uri("http://upstream.test"),
        };
        var sut = new WayelAuthApiClient(http);

        var result = await sut.GetMeAsync("bearer-x", CancellationToken.None);

        result.StatusCode.Should().Be(0);
        result.IsSessionRejected.Should().BeFalse();
        result.Dto.Should().BeNull();
    }

    private sealed class StubHandler(HttpStatusCode status, string? body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(status);
            if (body is not null)
            {
                response.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
            }
            return Task.FromResult(response);
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            throw new HttpRequestException("simulated network failure");
    }
}
