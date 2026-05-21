using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.Serializers;
using Wayel.Domain.Addresses;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Sessions;
using Wayel.Domain.Shipments;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo;

public static class MongoSerializationRegistry
{
    private static readonly object Gate = new();
    private static bool _initialised;

    public static void Initialise()
    {
        lock (Gate)
        {
            if (_initialised)
            {
                return;
            }

            var pack = new ConventionPack
            {
                new EnumRepresentationConvention(BsonType.String),
                new IgnoreExtraElementsConvention(true),
                new CamelCaseElementNameConvention(),
            };
            ConventionRegistry.Register("Wayel.Defaults", pack, _ => true);

            BsonSerializer.TryRegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));

            RegisterId<UserId>(g => new UserId(g));
            RegisterId<ExternalIdentityId>(g => new ExternalIdentityId(g));
            RegisterId<RefreshTokenId>(g => new RefreshTokenId(g));
            RegisterId<SuitePlanId>(g => new SuitePlanId(g));
            RegisterId<SuiteSubscriptionId>(g => new SuiteSubscriptionId(g));
            RegisterId<CustomerAddressId>(g => new CustomerAddressId(g));
            RegisterId<ParcelId>(g => new ParcelId(g));
            RegisterId<ShipmentId>(g => new ShipmentId(g));
            RegisterId<QuoteId>(g => new QuoteId(g));

            _initialised = true;
        }
    }

    private static void RegisterId<TId>(Func<Guid, TId> factory)
        where TId : struct, IStronglyTypedId =>
        BsonSerializer.TryRegisterSerializer(new StronglyTypedIdSerializer<TId>(factory));

    private sealed class StronglyTypedIdSerializer<TId>(Func<Guid, TId> factory) : SerializerBase<TId>
        where TId : struct, IStronglyTypedId
    {
        public override TId Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
        {
            var bsonType = context.Reader.GetCurrentBsonType();
            return bsonType switch
            {
                BsonType.String when Guid.TryParse(context.Reader.ReadString(), out var g) => factory(g),
                BsonType.Binary when context.Reader.ReadBinaryData().Bytes.Length == 16 => factory(new Guid(context.Reader.ReadBinaryData().Bytes)),
                _ => throw new FormatException($"Cannot deserialize {typeof(TId).Name} from BSON type {bsonType}."),
            };
        }

        public override void Serialize(BsonSerializationContext context, BsonSerializationArgs args, TId value) =>
            context.Writer.WriteString(value.Value.ToString("D"));
    }
}
