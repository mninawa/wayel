using System.Globalization;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.SuiteSubscriptions;
using Wayel.Domain.Common;
using Wayel.Domain.Payments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.PaymentMethods;

public sealed record CustomerSavedCardDto(
    Guid Id,
    string Provider,
    string CardType,
    string Last4,
    string ExpMonth,
    string ExpYear,
    string? Bank,
    string? Label,
    bool IsDefault,
    string DisplayName);

public sealed record InitiateAddPaymentMethodCommand(string CallbackUrl, string? Label)
    : ICommand<InitiateSuiteCheckoutResult>;

public sealed record CompleteAddPaymentMethodCommand(string Reference, string? Label)
    : ICommand<CustomerSavedCardDto>;

public sealed record ListPaymentMethodsQuery : IQuery<IReadOnlyList<CustomerSavedCardDto>>;

public sealed record SetDefaultPaymentMethodCommand(Guid CardId) : ICommand<CustomerSavedCardDto>;

public sealed record RemovePaymentMethodCommand(Guid CardId) : ICommand;

public sealed record UpdatePaymentMethodLabelCommand(Guid CardId, string? Label) : ICommand<CustomerSavedCardDto>;

internal static class PaymentMethodReferenceBuilder
{
    public static string Build() => $"WY-PMC-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
}

internal static class CustomerSavedCardMapper
{
    public static CustomerSavedCardDto ToDto(CustomerSavedCardRecord card) =>
        new(
            card.Id.Value,
            card.Provider,
            card.CardType,
            card.Last4,
            card.ExpMonth,
            card.ExpYear,
            card.Bank,
            card.Label,
            card.IsDefault,
            SavedCardDisplayName.For(card));
}

internal static class SavedCardDisplayName
{
    public static string For(CustomerSavedCardRecord card) => ForParts(card.Label, card.CardType, card.Last4);

    public static string ForDto(CustomerSavedCardDto card) => ForParts(card.Label, card.CardType, card.Last4);

    private static string ForParts(string? label, string cardType, string last4)
    {
        var brand = string.IsNullOrWhiteSpace(cardType)
            ? "Card"
            : char.ToUpper(cardType[0], CultureInfo.InvariantCulture) + cardType[1..].ToLowerInvariant();
        var masked = $"•••• {last4}";
        return string.IsNullOrWhiteSpace(label) ? $"{brand} {masked}" : $"{label.Trim()} · {brand} {masked}";
    }
}

internal sealed class InitiateAddPaymentMethodCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IPaymentGatewayResolver paymentGatewayResolver,
    IPaymentMethodAddIntentRepository intents,
    ICardVerificationBillingOptions billingOptions,
    IClock clock) : ICommandHandler<InitiateAddPaymentMethodCommand, InitiateSuiteCheckoutResult>
{
    public async Task<Result<InitiateSuiteCheckoutResult>> Handle(
        InitiateAddPaymentMethodCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var callbackUrl = (request.CallbackUrl ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(callbackUrl) || !Uri.TryCreate(callbackUrl, UriKind.Absolute, out _))
        {
            return Error.Validation("payment_method.invalid_callback", "A valid callback URL is required.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (!CustomerProfileRules.IsComplete(user))
        {
            return Error.Validation(
                "account.profile_incomplete",
                "Complete your profile before adding a payment method.");
        }

        IPaymentGateway gateway;
        try
        {
            gateway = paymentGatewayResolver.Resolve(PaymentProviders.Paystack);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.misconfigured", ex.Message);
        }

        if (!gateway.IsConfigured)
        {
            return Error.Validation(
                "payment_gateway.unavailable",
                "Card payments are not available right now. Please try again later.");
        }

        var amountMinor = billingOptions.VerifyChargeMinorUnits;
        var reference = PaymentMethodReferenceBuilder.Build();
        var label = string.IsNullOrWhiteSpace(request.Label) ? null : request.Label.Trim();

        PaymentInitializeResult init;
        try
        {
            init = await gateway.InitializeChargeAsync(
                new PaymentInitializeRequest(
                    user.Email.Value,
                    reference,
                    amountMinor,
                    callbackUrl,
                    new Dictionary<string, string>
                    {
                        ["user_id"] = user.Id.Value.ToString(),
                        ["payment_type"] = "add_payment_method",
                    }),
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.initialize_failed", ex.Message);
        }

        await intents.AddAsync(
            new PaymentMethodAddIntentRecord(
                init.Reference,
                user.Id,
                amountMinor,
                "Pending",
                label,
                clock.UtcNow,
                null),
            cancellationToken);

        return new InitiateSuiteCheckoutResult(
            init.Reference,
            init.AuthorizationUrl,
            init.AccessCode,
            amountMinor / 100m,
            PaymentProviders.Paystack,
            gateway.PublicKey);
    }
}

internal sealed class CompleteAddPaymentMethodCommandHandler(
    ICurrentUser current,
    IPaymentGatewayResolver paymentGatewayResolver,
    IPaymentMethodAddIntentRepository intents,
    ICustomerSavedCardRepository cards,
    ICardVerificationBillingOptions billingOptions,
    IClock clock) : ICommandHandler<CompleteAddPaymentMethodCommand, CustomerSavedCardDto>
{
    public async Task<Result<CustomerSavedCardDto>> Handle(
        CompleteAddPaymentMethodCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var reference = (request.Reference ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(reference))
        {
            return Error.Validation("payment_method.missing_reference", "Payment reference is required.");
        }

        var intent = await intents.GetByReferenceAsync(reference, cancellationToken);
        if (intent is null)
        {
            return Error.NotFound("payment_method.not_found", "Card verification session not found.");
        }

        if (intent.UserId != current.UserId)
        {
            return Error.Forbidden("payment_method.forbidden", "This verification belongs to another account.");
        }

        IPaymentGateway gateway;
        try
        {
            gateway = paymentGatewayResolver.Resolve(PaymentProviders.Paystack);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.misconfigured", ex.Message);
        }

        if (string.Equals(intent.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            var existingCards = await cards.ListActiveForUserAsync(intent.UserId, cancellationToken);
            if (existingCards.Count > 0)
            {
                return CustomerSavedCardMapper.ToDto(existingCards[0]);
            }
        }

        PaymentVerifyResult verified;
        try
        {
            verified = await gateway.VerifyChargeAsync(reference, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_method.verify_failed", ex.Message);
        }

        if (!string.Equals(verified.Status, "success", StringComparison.OrdinalIgnoreCase))
        {
            return Error.Validation(
                "payment_method.declined",
                "Card verification was not successful. Try again or use another card.");
        }

        if (verified.CardAuthorization is null)
        {
            return Error.Validation(
                "payment_method.no_authorization",
                "Paystack did not return a reusable card authorization. Try another card.");
        }

        var label = string.IsNullOrWhiteSpace(request.Label) ? intent.Label : request.Label.Trim();
        var saved = await SavedCardUpsert.TrySaveFromAuthorizationAsync(
            intent.UserId,
            verified.CardAuthorization,
            label,
            cards,
            cancellationToken);

        if (saved is null)
        {
            return Error.Validation("payment_method.save_failed", "Could not save this card.");
        }

        await intents.MarkCompletedAsync(reference, clock.UtcNow, cancellationToken);

        if (billingOptions.RefundVerifyCharge)
        {
            try
            {
                await gateway.RefundChargeAsync(reference, cancellationToken);
            }
            catch
            {
                // Card is saved; refund failure is non-fatal for the customer.
            }
        }

        return CustomerSavedCardMapper.ToDto(saved);
    }
}

internal sealed class ListPaymentMethodsQueryHandler(
    ICurrentUser current,
    ICustomerSavedCardRepository cards) : IQueryHandler<ListPaymentMethodsQuery, IReadOnlyList<CustomerSavedCardDto>>
{
    public async Task<Result<IReadOnlyList<CustomerSavedCardDto>>> Handle(
        ListPaymentMethodsQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var list = await cards.ListActiveForUserAsync(current.UserId.Value, cancellationToken);
        return list.Select(CustomerSavedCardMapper.ToDto).ToList();
    }
}

internal sealed class SetDefaultPaymentMethodCommandHandler(
    ICurrentUser current,
    ICustomerSavedCardRepository cards) : ICommandHandler<SetDefaultPaymentMethodCommand, CustomerSavedCardDto>
{
    public async Task<Result<CustomerSavedCardDto>> Handle(
        SetDefaultPaymentMethodCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var card = await cards.GetByIdAsync(new CustomerSavedCardId(request.CardId), cancellationToken);
        if (card is null || card.UserId != current.UserId || card.Status != "Active")
        {
            return Error.NotFound("payment_method.not_found", "Saved card not found.");
        }

        await cards.SetDefaultAsync(current.UserId.Value, card.Id, cancellationToken);
        var updated = await cards.GetByIdAsync(card.Id, cancellationToken);
        return updated is null
            ? Error.NotFound("payment_method.not_found", "Saved card not found.")
            : CustomerSavedCardMapper.ToDto(updated);
    }
}

internal sealed class RemovePaymentMethodCommandHandler(
    ICurrentUser current,
    ICustomerSavedCardRepository cards,
    IClock clock) : ICommandHandler<RemovePaymentMethodCommand>
{
    public async Task<Result> Handle(RemovePaymentMethodCommand request, CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var card = await cards.GetByIdAsync(new CustomerSavedCardId(request.CardId), cancellationToken);
        if (card is null || card.UserId != current.UserId || card.Status != "Active")
        {
            return Error.NotFound("payment_method.not_found", "Saved card not found.");
        }

        await cards.RevokeAsync(card.Id, clock.UtcNow, cancellationToken);

        if (card.IsDefault)
        {
            var remaining = await cards.ListActiveForUserAsync(current.UserId.Value, cancellationToken);
            if (remaining.Count > 0)
            {
                await cards.SetDefaultAsync(current.UserId.Value, remaining[0].Id, cancellationToken);
            }
        }

        return Result.Success();
    }
}

internal sealed class UpdatePaymentMethodLabelCommandHandler(
    ICurrentUser current,
    ICustomerSavedCardRepository cards) : ICommandHandler<UpdatePaymentMethodLabelCommand, CustomerSavedCardDto>
{
    public async Task<Result<CustomerSavedCardDto>> Handle(
        UpdatePaymentMethodLabelCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var card = await cards.GetByIdAsync(new CustomerSavedCardId(request.CardId), cancellationToken);
        if (card is null || card.UserId != current.UserId || card.Status != "Active")
        {
            return Error.NotFound("payment_method.not_found", "Saved card not found.");
        }

        var label = string.IsNullOrWhiteSpace(request.Label) ? null : request.Label.Trim();
        if (label is { Length: > 40 })
        {
            return Error.Validation("payment_method.label_too_long", "Label must be 40 characters or fewer.");
        }

        await cards.UpdateLabelAsync(card.Id, label, cancellationToken);
        var updated = await cards.GetByIdAsync(card.Id, cancellationToken);
        return updated is null
            ? Error.NotFound("payment_method.not_found", "Saved card not found.")
            : CustomerSavedCardMapper.ToDto(updated);
    }
}
