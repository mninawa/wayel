using Wayel.Domain.Common;

namespace Wayel.Domain.ParcelInvoices;

public readonly record struct ParcelInvoiceId(Guid Value) : IStronglyTypedId
{
    public static ParcelInvoiceId New() => new(StronglyTypedId.NewId());
}
