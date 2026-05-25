using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Payments;

public sealed record ListPaymentProvidersQuery(string? PayerMsisdn = null)
    : IQuery<IReadOnlyList<PaymentProviderOption>>;

internal sealed class ListPaymentProvidersQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IPaymentGatewayResolver resolver)
    : IQueryHandler<ListPaymentProvidersQuery, IReadOnlyList<PaymentProviderOption>>
{
    public async Task<Result<IReadOnlyList<PaymentProviderOption>>> Handle(
        ListPaymentProvidersQuery request,
        CancellationToken cancellationToken)
    {
        var msisdn = request.PayerMsisdn;
        if (string.IsNullOrWhiteSpace(msisdn) && current.UserId is not null)
        {
            var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
            msisdn = user?.Phone;
        }

        return Result.Success(resolver.ListAvailableForCustomer(msisdn));
    }
}
