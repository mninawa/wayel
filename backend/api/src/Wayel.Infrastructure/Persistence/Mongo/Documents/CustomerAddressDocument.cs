using Wayel.Domain.Addresses;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class CustomerAddressDocument
{
    public CustomerAddressId Id { get; set; }
    public UserId UserId { get; set; }
    public string Type { get; set; } = "";
    public string Line1 { get; set; } = "";
    public string? Line2 { get; set; }
    public string City { get; set; } = "";
    public string Province { get; set; } = "";
    public string Country { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public bool IsSuiteAddress { get; set; }
    public string SuiteNumber { get; set; } = "";
    public string Label { get; set; } = "";
    public string RecipientName { get; set; } = "";
    public string? Phone { get; set; }
    public bool IsDefault { get; set; }

    public static CustomerAddressDocument From(CustomerAddress a) => new()
    {
        Id = a.Id,
        UserId = a.UserId,
        Type = a.Type,
        Line1 = a.Line1,
        Line2 = a.Line2,
        City = a.City,
        Province = a.Province,
        Country = a.Country,
        PostalCode = a.PostalCode,
        IsSuiteAddress = a.IsSuiteAddress,
        SuiteNumber = a.SuiteNumber,
        Label = a.Label,
        RecipientName = a.RecipientName,
        Phone = a.Phone,
        IsDefault = a.IsDefault,
    };

    public CustomerAddress ToDomain() =>
        CustomerAddress.Rehydrate(
            Id,
            UserId,
            Type,
            Line1,
            Line2,
            City,
            Province,
            Country,
            PostalCode,
            IsSuiteAddress,
            SuiteNumber,
            Label,
            RecipientName,
            Phone,
            IsDefault);
}
