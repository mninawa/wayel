using Wayel.Application.Abstractions.Kyc;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record CreateKycDocumentUploadTicketCommand(
    string Side,
    string FileName,
    string ContentType,
    long SizeBytes) : ICommand<KycDocumentUploadTicketDto>;

internal sealed class CreateKycDocumentUploadTicketCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IInvoiceBlobStorage storage,
    IKycDocumentUploadSessionStore sessions,
    IClock clock) : ICommandHandler<CreateKycDocumentUploadTicketCommand, KycDocumentUploadTicketDto>
{
    public async Task<Result<KycDocumentUploadTicketDto>> Handle(
        CreateKycDocumentUploadTicketCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (user.KycStatus is KycStatus.Verified)
        {
            return Error.Validation("kyc.already_verified", "Your identity is already verified.");
        }

        if (user.KycStatus is KycStatus.Pending)
        {
            return Error.Validation("kyc.pending", "Your submission is under review. You cannot upload new documents yet.");
        }

        if (!CustomerProfileRules.IsComplete(user))
        {
            return Error.Validation("kyc.profile_incomplete", "Complete your profile before uploading KYC documents.");
        }

        string side;
        try
        {
            side = KycDocumentRules.NormalizeSide(request.Side);
        }
        catch (InvalidOperationException)
        {
            return Error.Validation("kyc.side", "Document side must be front, back, or selfie.");
        }

        var required = KycDocumentRules.RequiredSides(user.IdDocumentType);
        if (!required.Contains(side))
        {
            return Error.Validation("kyc.side_not_required", $"Side '{side}' is not required for {user.IdDocumentType}.");
        }

        if (request.SizeBytes <= 0 || request.SizeBytes > KycDocumentRules.MaxBytes)
        {
            return Error.Validation("kyc.file_size", "Document must be under 12 MB.");
        }

        var contentType = KycDocumentRules.NormalizeContentType(request.ContentType, request.FileName);
        if (!KycDocumentRules.IsAllowedContentType(contentType))
        {
            return Error.Validation("kyc.file_type", "Document must be JPEG, PNG, WebP, or HEIC.");
        }

        var documentId = Guid.NewGuid();
        var storageKey = KycDocumentRules.BuildStorageKey(user.Id.Value, documentId, side, request.FileName);
        var ticket = await storage.CreateUploadTicketAsync(
            storageKey,
            contentType,
            request.SizeBytes,
            KycDocumentRules.UploadTicketTtl,
            cancellationToken);

        sessions.Save(new KycDocumentUploadSession(
            documentId,
            user.Id.Value,
            side,
            request.FileName,
            contentType,
            request.SizeBytes,
            storageKey,
            ticket.ExpiresAtUtc,
            BytesReceived: false));

        var existing = await submissions.GetForUserAsync(user.Id, cancellationToken);
        var now = clock.UtcNow;
        var documents = existing?.Documents.ToList() ?? [];
        documents.RemoveAll(d => d.Side == side && !d.Confirmed);
        documents.Add(new KycDocumentRecord(
            documentId,
            side,
            request.FileName,
            contentType,
            storageKey,
            request.SizeBytes,
            now,
            Confirmed: false));

        await submissions.UpsertAsync(
            new KycSubmissionRecord(
                existing?.Id ?? Guid.NewGuid(),
                user.Id.Value,
                user.KycStatus.ToString(),
                existing?.SubmittedAtUtc,
                existing?.ReviewedAtUtc,
                existing?.ReviewedBy,
                existing?.RejectionReason,
                existing?.ReviewerNotes,
                existing?.IdDocumentExpiryUtc,
                existing?.FaceMatchScore,
                documents,
                existing?.Checks ?? []),
            cancellationToken);

        return new KycDocumentUploadTicketDto(
            documentId,
            side,
            ticket.UploadUrl,
            ticket.RequiredHeaders,
            ticket.ExpiresAtUtc);
    }
}

public sealed record UploadKycDocumentBytesCommand(Guid DocumentId, Stream FileContent) : ICommand<bool>;

internal sealed class UploadKycDocumentBytesCommandHandler(
    IInvoiceBlobStorage storage,
    IKycDocumentUploadSessionStore sessions,
    ICurrentUser current) : ICommandHandler<UploadKycDocumentBytesCommand, bool>
{
    public async Task<Result<bool>> Handle(
        UploadKycDocumentBytesCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var session = sessions.Get(request.DocumentId);
        if (session is null || session.UserId != current.UserId.Value.Value)
        {
            return Error.NotFound("kyc.upload_session", "Upload session not found or expired.");
        }

        if (DateTime.UtcNow > session.ExpiresAtUtc)
        {
            sessions.Remove(request.DocumentId);
            return Error.Validation("kyc.upload_expired", "Upload ticket expired. Request a new upload ticket.");
        }

        await using var buffer = new MemoryStream();
        await request.FileContent.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length != session.SizeBytes)
        {
            return Error.Validation("kyc.upload_size", "Uploaded file size does not match the issued ticket.");
        }

        buffer.Position = 0;
        await storage.PutAsync(session.StorageKey, buffer, session.ContentType, cancellationToken);
        sessions.MarkBytesReceived(request.DocumentId);
        return true;
    }
}

public sealed record ConfirmKycDocumentUploadCommand(
    Guid DocumentId,
    string FileName,
    string ContentType,
    long SizeBytes) : ICommand<KycDocumentDto>;

internal sealed class ConfirmKycDocumentUploadCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IInvoiceBlobStorage storage,
    IKycDocumentUploadSessionStore sessions,
    IClock clock) : ICommandHandler<ConfirmKycDocumentUploadCommand, KycDocumentDto>
{
    public async Task<Result<KycDocumentDto>> Handle(
        ConfirmKycDocumentUploadCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var session = sessions.Get(request.DocumentId);
        if (session is null || session.UserId != current.UserId.Value.Value)
        {
            return Error.NotFound("kyc.upload_session", "Upload session not found or expired.");
        }

        if (DateTime.UtcNow > session.ExpiresAtUtc)
        {
            sessions.Remove(request.DocumentId);
            return Error.Validation("kyc.upload_expired", "Upload ticket expired. Request a new upload ticket.");
        }

        var exists = await storage.ExistsAsync(session.StorageKey, request.SizeBytes, cancellationToken);
        if (!exists)
        {
            return Error.Validation("kyc.upload_missing", "Uploaded file was not found. Upload the file before confirming.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var submission = await submissions.GetForUserAsync(user.Id, cancellationToken);
        if (submission is null)
        {
            return Error.NotFound("kyc.submission", "KYC submission not found.");
        }

        var doc = submission.Documents.FirstOrDefault(d => d.DocumentId == request.DocumentId);
        if (doc is null)
        {
            return Error.NotFound("kyc.document", "Document not found.");
        }

        var now = clock.UtcNow;
        var updatedDocs = submission.Documents
            .Select(d => d.DocumentId == request.DocumentId
                ? d with
                {
                    FileName = request.FileName,
                    ContentType = KycDocumentRules.NormalizeContentType(request.ContentType, request.FileName),
                    SizeBytes = request.SizeBytes,
                    UploadedAtUtc = now,
                    Confirmed = true,
                }
                : d)
            .ToList();

        await submissions.UpsertAsync(
            submission with { Documents = updatedDocs },
            cancellationToken);

        sessions.MarkBytesReceived(request.DocumentId);
        sessions.Remove(request.DocumentId);

        var confirmed = updatedDocs.First(d => d.DocumentId == request.DocumentId);
        var downloadUrl = await storage.GetDownloadUriAsync(confirmed.StorageKey, cancellationToken);

        return new KycDocumentDto(
            confirmed.DocumentId,
            confirmed.Side,
            confirmed.FileName,
            confirmed.ContentType,
            confirmed.SizeBytes,
            confirmed.UploadedAtUtc,
            confirmed.Confirmed,
            downloadUrl?.ToString());
    }
}

public sealed record GetCustomerKycStatusQuery : IQuery<CustomerKycStatusDto>;

internal sealed class GetCustomerKycStatusQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IInvoiceBlobStorage storage) : IQueryHandler<GetCustomerKycStatusQuery, CustomerKycStatusDto>
{
    public async Task<Result<CustomerKycStatusDto>> Handle(
        GetCustomerKycStatusQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var submission = await submissions.GetForUserAsync(user.Id, cancellationToken);
        var required = CustomerProfileRules.IsComplete(user)
            ? KycDocumentRules.RequiredSides(user.IdDocumentType)
            : Array.Empty<string>();

        var documents = submission is null
            ? Array.Empty<KycDocumentDto>()
            : await MapDocumentsAsync(submission.Documents, storage, cancellationToken);

        var checks = submission?.Checks.Select(c => new KycVerificationCheckDto(
            c.Type,
            c.Status,
            c.Detail,
            c.CompletedAtUtc)).ToList() ?? [];

        return new CustomerKycStatusDto(
            user.KycStatus.ToString(),
            user.KycRejectionReason,
            CanSubmit: user.KycStatus is KycStatus.NotStarted or KycStatus.Rejected
                && CustomerProfileRules.IsComplete(user)
                && HasRequiredDocuments(user.IdDocumentType, submission?.Documents ?? []),
            CanUploadDocuments: user.KycStatus is KycStatus.NotStarted or KycStatus.Rejected
                && CustomerProfileRules.IsComplete(user),
            RequiredSides: required,
            Documents: documents,
            Checks: checks,
            submission?.SubmittedAtUtc,
            submission?.FaceMatchScore,
            submission?.IdDocumentExpiryUtc);
    }

    private static bool HasRequiredDocuments(string idDocumentType, IReadOnlyList<KycDocumentRecord> documents)
    {
        var required = KycDocumentRules.RequiredSides(idDocumentType);
        var confirmed = documents.Where(d => d.Confirmed).Select(d => d.Side).ToHashSet(StringComparer.Ordinal);
        return required.All(confirmed.Contains);
    }

    private static async Task<IReadOnlyList<KycDocumentDto>> MapDocumentsAsync(
        IReadOnlyList<KycDocumentRecord> documents,
        IInvoiceBlobStorage storage,
        CancellationToken cancellationToken)
    {
        var mapped = new List<KycDocumentDto>();
        foreach (var doc in documents)
        {
            // Documents purged after verification have no storage key — hide them
            // from the customer-facing status response.
            if (string.IsNullOrWhiteSpace(doc.StorageKey))
            {
                continue;
            }

            var url = doc.Confirmed
                ? (await storage.GetDownloadUriAsync(doc.StorageKey, cancellationToken))?.ToString()
                : null;
            mapped.Add(new KycDocumentDto(
                doc.DocumentId,
                doc.Side,
                doc.FileName,
                doc.ContentType,
                doc.SizeBytes,
                doc.UploadedAtUtc,
                doc.Confirmed,
                url));
        }

        return mapped;
    }
}

public sealed record GetOpsKycSubmissionDetailQuery(Guid UserId) : IQuery<OpsKycSubmissionDetailDto>;

internal sealed class GetOpsKycSubmissionDetailQueryHandler(
    IUserRepository users,
    IKycSubmissionRepository submissions,
    ISuiteSubscriptionRepository subscriptions) : IQueryHandler<GetOpsKycSubmissionDetailQuery, OpsKycSubmissionDetailDto>
{
    public async Task<Result<OpsKycSubmissionDetailDto>> Handle(
        GetOpsKycSubmissionDetailQuery request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "Customer not found.");
        }

        var submission = await submissions.GetForUserAsync(userId, cancellationToken);
        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);

        var documents = submission is null
            ? Array.Empty<KycDocumentDto>()
            : KycOpsDocumentUrls.MapDocumentDtos(request.UserId, submission.Documents);

        var checks = submission?.Checks.Select(c => new KycVerificationCheckDto(
            c.Type,
            c.Status,
            c.Detail,
            c.CompletedAtUtc)).ToList() ?? [];

        return new OpsKycSubmissionDetailDto(
            user.Id.Value,
            user.Email.Value,
            user.DisplayName,
            user.Phone ?? string.Empty,
            user.DestinationCountry,
            CustomerAccountMapper.DestinationCountryLabel(user.DestinationCountry),
            user.IdDocumentType,
            user.IdNumber,
            user.KycStatus.ToString(),
            submission?.SubmittedAtUtc ?? user.KycSubmittedAtUtc,
            user.CreatedOnUtc,
            subscription?.SuiteNumber,
            submission?.RejectionReason ?? user.KycRejectionReason,
            submission?.ReviewerNotes,
            submission?.FaceMatchScore,
            submission?.IdDocumentExpiryUtc,
            documents,
            checks);
    }
}

public sealed record DownloadOpsKycDocumentQuery(Guid UserId, Guid DocumentId) : IQuery<KycDocumentFileDto>;

internal sealed class DownloadOpsKycDocumentQueryHandler(
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IInvoiceBlobStorage storage) : IQueryHandler<DownloadOpsKycDocumentQuery, KycDocumentFileDto>
{
    public async Task<Result<KycDocumentFileDto>> Handle(
        DownloadOpsKycDocumentQuery request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "Customer not found.");
        }

        var submission = await submissions.GetForUserAsync(userId, cancellationToken);
        var doc = submission?.Documents.FirstOrDefault(d => d.DocumentId == request.DocumentId && d.Confirmed);
        if (doc is null)
        {
            return Error.NotFound("kyc.document", "Document not found.");
        }

        var stream = await storage.OpenReadAsync(doc.StorageKey, cancellationToken);
        if (stream is null)
        {
            return Error.NotFound("kyc.file_missing", "Document file is not available.");
        }

        return new KycDocumentFileDto(doc.FileName, doc.ContentType, stream);
    }
}

public sealed record RunOpsKycVerificationChecksCommand(Guid UserId) : ICommand<OpsKycSubmissionDetailDto>;

internal sealed class RunOpsKycVerificationChecksCommandHandler(
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IKycIdentityProvider kycProvider,
    ISuiteSubscriptionRepository subscriptions,
    IClock clock) : ICommandHandler<RunOpsKycVerificationChecksCommand, OpsKycSubmissionDetailDto>
{
    public async Task<Result<OpsKycSubmissionDetailDto>> Handle(
        RunOpsKycVerificationChecksCommand request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "Customer not found.");
        }

        var submission = await submissions.GetForUserAsync(userId, cancellationToken);
        if (submission is null)
        {
            return Error.NotFound("kyc.submission", "No KYC submission found for this customer.");
        }

        var now = clock.UtcNow;
        var verification = await kycProvider.VerifyAsync(
            user,
            submission.Documents,
            cancellationToken);

        var updated = submission with
        {
            Checks = verification.Checks,
            FaceMatchScore = verification.FaceMatchScore,
            IdDocumentExpiryUtc = verification.IdDocumentExpiryUtc,
            ProviderName = verification.ProviderName,
            ProviderTransactionId = verification.ProviderTransactionId,
        };
        await submissions.UpsertAsync(updated, cancellationToken);

        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
        var documents = KycOpsDocumentUrls.MapDocumentDtos(request.UserId, updated.Documents);
        var checkDtos = updated.Checks.Select(c => new KycVerificationCheckDto(
            c.Type,
            c.Status,
            c.Detail,
            c.CompletedAtUtc)).ToList();

        return new OpsKycSubmissionDetailDto(
            user.Id.Value,
            user.Email.Value,
            user.DisplayName,
            user.Phone ?? string.Empty,
            user.DestinationCountry,
            CustomerAccountMapper.DestinationCountryLabel(user.DestinationCountry),
            user.IdDocumentType,
            user.IdNumber,
            user.KycStatus.ToString(),
            updated.SubmittedAtUtc ?? user.KycSubmittedAtUtc,
            user.CreatedOnUtc,
            subscription?.SuiteNumber,
            updated.RejectionReason ?? user.KycRejectionReason,
            updated.ReviewerNotes,
            updated.FaceMatchScore,
            updated.IdDocumentExpiryUtc,
            documents,
            checkDtos);
    }
}
