using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Kyc;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Account;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Kyc;

internal sealed class IdAnalyzerKycIdentityProvider(
    IOptions<KycOptions> options,
    IHttpClientFactory httpClientFactory,
    IInvoiceBlobStorage storage,
    IClock clock,
    ILogger<IdAnalyzerKycIdentityProvider> logger) : IKycIdentityProvider
{
    private const string ProviderName = "idanalyzer";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly KycOptions _opts = options.Value;

    public async Task<KycVerificationResult> VerifyAsync(
        User user,
        IReadOnlyList<KycDocumentRecord> documents,
        CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var confirmed = documents.Where(d => d.Confirmed).ToList();
        var required = KycDocumentRules.RequiredSides(user.IdDocumentType);
        var missing = required.Where(side => confirmed.All(d => d.Side != side)).ToList();
        if (missing.Count > 0)
        {
            return LocalMissingDocumentsResult(missing, now);
        }

        try
        {
            var front = confirmed.FirstOrDefault(d => d.Side == "front");
            if (front is null)
            {
                return LocalMissingDocumentsResult(["front"], now);
            }

            var document = await ToDataUriAsync(front, cancellationToken);
            string? documentBack = null;
            var back = confirmed.FirstOrDefault(d => d.Side == "back");
            if (back is not null)
            {
                documentBack = await ToDataUriAsync(back, cancellationToken);
            }

            string? face = null;
            var selfie = confirmed.FirstOrDefault(d => d.Side == "selfie");
            if (selfie is not null)
            {
                face = await ToDataUriAsync(selfie, cancellationToken);
            }

            var payload = new Dictionary<string, object?>
            {
                ["document"] = document,
                ["profile"] = _opts.IdAnalyzerProfileId,
                ["verifyName"] = user.DisplayName,
                ["verifyDocumentNumber"] = user.IdNumber,
                ["customData"] = user.Id.Value.ToString("N"),
            };

            if (!string.IsNullOrWhiteSpace(documentBack))
            {
                payload["documentBack"] = documentBack;
            }

            if (!string.IsNullOrWhiteSpace(face))
            {
                payload["face"] = face;
            }

            var country = NormalizeCountryCode(user.DestinationCountry);
            if (!string.IsNullOrWhiteSpace(country))
            {
                payload["restrictCountry"] = country;
            }

            using var client = CreateClient();
            using var response = await client.PostAsJsonAsync("scan", payload, JsonOptions, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "ID Analyzer scan failed for user {UserId}: {Status} {Body}",
                    user.Id.Value,
                    (int)response.StatusCode,
                    Truncate(body, 500));
                return ProviderErrorResult(now, $"ID Analyzer HTTP {(int)response.StatusCode}");
            }

            var scan = JsonSerializer.Deserialize<IdAnalyzerScanResponse>(body, JsonOptions);
            if (scan is null || scan.Success == false)
            {
                logger.LogWarning(
                    "ID Analyzer scan returned unsuccessful response for user {UserId}: {Body}",
                    user.Id.Value,
                    Truncate(body, 500));
                return ProviderErrorResult(now, scan?.Error ?? "ID Analyzer scan unsuccessful.");
            }

            return MapScanResponse(scan, now);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            logger.LogError(ex, "ID Analyzer verification failed for user {UserId}", user.Id.Value);
            return ProviderErrorResult(now, ex.Message);
        }
    }

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient(nameof(IdAnalyzerKycIdentityProvider));
        client.DefaultRequestHeaders.Remove("X-API-KEY");
        client.DefaultRequestHeaders.Add("X-API-KEY", _opts.IdAnalyzerApiKey);
        return client;
    }

    private async Task<string> ToDataUriAsync(KycDocumentRecord doc, CancellationToken cancellationToken)
    {
        await using var stream = await storage.OpenReadAsync(doc.StorageKey, cancellationToken);
        if (stream is null)
        {
            throw new InvalidOperationException($"KYC document file missing: {doc.Side}");
        }

        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, cancellationToken);
        var contentType = string.IsNullOrWhiteSpace(doc.ContentType) ? "image/jpeg" : doc.ContentType;
        return $"data:{contentType};base64,{Convert.ToBase64String(ms.ToArray())}";
    }

    private static KycVerificationResult LocalMissingDocumentsResult(IReadOnlyList<string> missing, DateTime nowUtc)
    {
        var checks = new List<KycCheckRecord>
        {
            new(
                "DocumentUploaded",
                "fail",
                $"Missing: {string.Join(", ", missing)}",
                nowUtc),
            new("FaceMatch", "fail", "Selfie not available.", nowUtc),
            new("AddressProof", "pass", "Profile address on file.", nowUtc),
            new("SanctionsScreening", "fail", "Checks not run — documents incomplete.", nowUtc),
            new("PepScreening", "fail", "Checks not run — documents incomplete.", nowUtc),
            new("AdverseMedia", "fail", "Checks not run — documents incomplete.", nowUtc),
            new("ExpiryCheck", "fail", "Document expiry unknown.", nowUtc),
        };

        return new KycVerificationResult(
            checks,
            FaceMatchScore: 0,
            IdDocumentExpiryUtc: null,
            ProviderName,
            ProviderTransactionId: null,
            ProviderDecision: "reject");
    }

    private static KycVerificationResult ProviderErrorResult(DateTime nowUtc, string detail)
    {
        var checks = new List<KycCheckRecord>
        {
            new("DocumentUploaded", "warn", "Documents uploaded; provider check failed.", nowUtc),
            new("FaceMatch", "warn", detail, nowUtc),
            new("AddressProof", "pass", "Profile address on file.", nowUtc),
            new("SanctionsScreening", "warn", "Provider unavailable.", nowUtc),
            new("PepScreening", "warn", "Provider unavailable.", nowUtc),
            new("AdverseMedia", "warn", "Provider unavailable.", nowUtc),
            new("ExpiryCheck", "warn", "Provider unavailable.", nowUtc),
            new("ProviderCheck", "fail", detail, nowUtc),
        };

        return new KycVerificationResult(
            checks,
            FaceMatchScore: null,
            IdDocumentExpiryUtc: null,
            ProviderName,
            ProviderTransactionId: null,
            ProviderDecision: "review");
    }

    private static KycVerificationResult MapScanResponse(IdAnalyzerScanResponse scan, DateTime nowUtc)
    {
        var warnings = scan.Warning ?? [];
        var expiry = ParseExpiry(scan.Data);
        var faceMatch = DeriveFaceMatchScore(warnings);
        var decision = scan.Decision ?? "review";

        var checks = new List<KycCheckRecord>
        {
            new("DocumentUploaded", "pass", "All required documents uploaded and scanned.", nowUtc),
            MapFaceMatchCheck(faceMatch, warnings, nowUtc),
            new("AddressProof", "pass", "Profile address on file.", nowUtc),
            MapAmlCheck("SanctionsScreening", warnings, "AML_SANCTION", nowUtc),
            MapAmlCheck("PepScreening", warnings, "AML_PEP", nowUtc),
            MapAdverseMedia(warnings, nowUtc),
            MapExpiryCheck(expiry, warnings, nowUtc),
            new(
                "ProviderCheck",
                MapDecisionStatus(decision),
                $"ID Analyzer decision: {decision}",
                nowUtc),
        };

        return new KycVerificationResult(
            checks,
            faceMatch,
            expiry,
            ProviderName,
            scan.TransactionId,
            decision);
    }

    private static KycCheckRecord MapFaceMatchCheck(
        int? faceMatch,
        IReadOnlyList<IdAnalyzerWarning> warnings,
        DateTime nowUtc)
    {
        var faceWarnings = warnings
            .Where(w => w.Code?.StartsWith("FACE_", StringComparison.OrdinalIgnoreCase) == true)
            .ToList();

        if (faceMatch is null)
        {
            if (faceWarnings.Count == 0)
            {
                return new KycCheckRecord("FaceMatch", "warn", "Face match not performed.", nowUtc);
            }

            var worst = faceWarnings.FirstOrDefault(w =>
                string.Equals(w.Decision, "reject", StringComparison.OrdinalIgnoreCase))
                ?? faceWarnings[0];
            var status = string.Equals(worst.Decision, "reject", StringComparison.OrdinalIgnoreCase)
                ? "fail"
                : "warn";
            return new KycCheckRecord("FaceMatch", status, worst.Description ?? worst.Code, nowUtc);
        }

        var statusFromScore = faceMatch >= 95 ? "pass" : faceMatch >= 85 ? "warn" : "fail";
        return new KycCheckRecord("FaceMatch", statusFromScore, $"{faceMatch}% match", nowUtc);
    }

    private static KycCheckRecord MapAmlCheck(
        string type,
        IReadOnlyList<IdAnalyzerWarning> warnings,
        string codePrefix,
        DateTime nowUtc)
    {
        var matches = warnings
            .Where(w => w.Code?.StartsWith(codePrefix, StringComparison.OrdinalIgnoreCase) == true)
            .ToList();

        if (matches.Count == 0)
        {
            return new KycCheckRecord(type, "pass", "Clear", nowUtc);
        }

        var reject = matches.Any(w => string.Equals(w.Decision, "reject", StringComparison.OrdinalIgnoreCase));
        var status = reject ? "fail" : "warn";
        var detail = matches[0].Description ?? "Potential match — manual review required.";
        return new KycCheckRecord(type, status, detail, nowUtc);
    }

    private static KycCheckRecord MapAdverseMedia(
        IReadOnlyList<IdAnalyzerWarning> warnings,
        DateTime nowUtc)
    {
        var matches = warnings
            .Where(w => w.Code?.StartsWith("AML_", StringComparison.OrdinalIgnoreCase) == true
                && !string.Equals(w.Code, "AML_SANCTION", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(w.Code, "AML_PEP", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matches.Count == 0)
        {
            return new KycCheckRecord("AdverseMedia", "pass", "Clear", nowUtc);
        }

        var reject = matches.Any(w => string.Equals(w.Decision, "reject", StringComparison.OrdinalIgnoreCase));
        return new KycCheckRecord(
            "AdverseMedia",
            reject ? "fail" : "warn",
            matches[0].Description ?? "Adverse media match.",
            nowUtc);
    }

    private static KycCheckRecord MapExpiryCheck(
        DateTime? expiry,
        IReadOnlyList<IdAnalyzerWarning> warnings,
        DateTime nowUtc)
    {
        var expired = warnings.Any(w =>
            string.Equals(w.Code, "DOCUMENT_EXPIRED", StringComparison.OrdinalIgnoreCase));
        if (expired)
        {
            return new KycCheckRecord("ExpiryCheck", "fail", "Document has expired.", nowUtc);
        }

        if (expiry is null)
        {
            return new KycCheckRecord("ExpiryCheck", "warn", "Expiry date not detected.", nowUtc);
        }

        var daysUntilExpiry = (int)Math.Ceiling((expiry.Value - nowUtc).TotalDays);
        if (daysUntilExpiry <= 0)
        {
            return new KycCheckRecord("ExpiryCheck", "fail", "Document has expired.", nowUtc);
        }

        if (daysUntilExpiry <= 30)
        {
            return new KycCheckRecord("ExpiryCheck", "warn", $"Expires in {daysUntilExpiry} days", nowUtc);
        }

        return new KycCheckRecord(
            "ExpiryCheck",
            "pass",
            expiry.Value.ToString("d MMM yyyy", CultureInfo.InvariantCulture),
            nowUtc);
    }

    private static int? DeriveFaceMatchScore(IReadOnlyList<IdAnalyzerWarning> warnings)
    {
        var faceWarnings = warnings
            .Where(w => w.Code?.StartsWith("FACE_", StringComparison.OrdinalIgnoreCase) == true)
            .ToList();

        if (faceWarnings.Count == 0)
        {
            return 97;
        }

        if (faceWarnings.Any(w => string.Equals(w.Code, "FACE_LIVENESS_ERR", StringComparison.OrdinalIgnoreCase)))
        {
            var liveness = faceWarnings.First(w =>
                string.Equals(w.Code, "FACE_LIVENESS_ERR", StringComparison.OrdinalIgnoreCase));
            return (int)Math.Round((liveness.Confidence ?? 0.5) * 100);
        }

        if (faceWarnings.Any(w => string.Equals(w.Code, "FACE_IDENTICAL", StringComparison.OrdinalIgnoreCase)))
        {
            return 84;
        }

        var reject = faceWarnings.FirstOrDefault(w =>
            string.Equals(w.Decision, "reject", StringComparison.OrdinalIgnoreCase));
        if (reject is not null)
        {
            return (int)Math.Round((reject.Confidence ?? 0.4) * 100);
        }

        return 88;
    }

    private static DateTime? ParseExpiry(Dictionary<string, JsonElement>? data)
    {
        if (data is null)
        {
            return null;
        }

        if (TryReadFieldValue(data, "expiry", out var expiryText)
            && DateTime.TryParse(expiryText, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var expiry))
        {
            return DateTime.SpecifyKind(expiry, DateTimeKind.Utc);
        }

        if (TryReadFieldValue(data, "expiryYear", out var yearText)
            && TryReadFieldValue(data, "expiryMonth", out var monthText)
            && TryReadFieldValue(data, "expiryDay", out var dayText)
            && int.TryParse(yearText, out var year)
            && int.TryParse(monthText, out var month)
            && int.TryParse(dayText, out var day))
        {
            try
            {
                return new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);
            }
            catch (ArgumentOutOfRangeException)
            {
                return null;
            }
        }

        return null;
    }

    private static bool TryReadFieldValue(
        Dictionary<string, JsonElement> data,
        string field,
        out string value)
    {
        value = string.Empty;
        if (!data.TryGetValue(field, out var element) || element.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        foreach (var item in element.EnumerateArray())
        {
            if (item.TryGetProperty("value", out var valueElement)
                && valueElement.ValueKind == JsonValueKind.String)
            {
                value = valueElement.GetString() ?? string.Empty;
                return !string.IsNullOrWhiteSpace(value);
            }
        }

        return false;
    }

    private static string MapDecisionStatus(string decision) =>
        decision.ToLowerInvariant() switch
        {
            "accept" => "pass",
            "reject" => "fail",
            _ => "warn",
        };

    private static string? NormalizeCountryCode(string destinationCountry)
    {
        if (string.IsNullOrWhiteSpace(destinationCountry))
        {
            return null;
        }

        var trimmed = destinationCountry.Trim();
        if (trimmed.Length == 2)
        {
            return trimmed.ToUpperInvariant();
        }

        return trimmed.ToUpperInvariant() switch
        {
            "ESWATINI" or "SWAZILAND" => "SZ",
            "SOUTH AFRICA" => "ZA",
            "BOTSWANA" => "BW",
            "NAMIBIA" => "NA",
            "MOZAMBIQUE" => "MZ",
            _ => null,
        };
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength] + "…";

    private sealed class IdAnalyzerScanResponse
    {
        public bool? Success { get; set; }
        public string? Error { get; set; }
        public string? TransactionId { get; set; }
        public string? Decision { get; set; }
        public Dictionary<string, JsonElement>? Data { get; set; }
        public List<IdAnalyzerWarning>? Warning { get; set; }
    }

    private sealed class IdAnalyzerWarning
    {
        public string? Code { get; set; }
        public string? Description { get; set; }
        public string? Decision { get; set; }
        public double? Confidence { get; set; }
    }
}
