namespace Wayel.Api.Infrastructure;

/// <summary>
/// Canonical action strings emitted to the audit log. Kept as a single
/// constants file so queries downstream (incident response, compliance
/// dashboards) can pivot on a stable vocabulary.
/// </summary>
internal static class AuditActions
{
    public const string AuthLogin = "auth.login";

    public const string AuthRegister = "auth.register";

    public const string AuthSsoGoogle = "auth.sso.google";

    public const string AuthRefresh = "auth.refresh";

    public const string AuthLogout = "auth.logout";

    public const string InvitationIssued = "invitation.issued";

    public const string InvitationResent = "invitation.resent";

    public const string InvitationRevoked = "invitation.revoked";

    public const string InvitationAccepted = "invitation.accepted";

    public const string TenantCreated = "tenant.created";

    public const string TenantRenamed = "tenant.renamed";

    public const string TenantSuspended = "tenant.suspended";

    public const string TenantActivated = "tenant.activated";

    public const string TenantArchived = "tenant.archived";

    /// <summary>
    /// Hard-delete cascade — the tenant row plus every row whose
    /// existence is meaningful only because the tenant existed has
    /// been permanently removed. Distinct from
    /// <see cref="TenantArchived"/> (soft-delete status flip) because
    /// it is irreversible and the metadata payload carries the
    /// per-collection deletion counts so post-mortem questions can
    /// be answered from the audit log alone.
    /// </summary>
    public const string TenantPurged = "tenant.purged";

    public const string TenantProfileUpdated = "tenant.profile_updated";

    public const string TenantRecordUpdated = "tenant.record_updated";

    public const string TenantAdminUpdated = "tenant.admin_updated";

    public const string TenantBrandingUpdated = "tenant.branding_updated";

    public const string TenantSettingsUpdated = "tenant.settings_updated";

    public const string OutboxRequeue = "outbox.requeue";

    public const string StaffRoleChanged = "staff.role_changed";

    public const string StaffInvited = "staff.invited";

    public const string StaffSuspended = "staff.suspended";

    public const string StaffReactivated = "staff.reactivated";

    /// <summary>
    /// Terminal soft-delete of a staff member's tenure at a tenant.
    /// Distinct from <see cref="StaffSuspended"/> (reversible pause) —
    /// archive is the "their tenure has ended" lifecycle endpoint.
    /// </summary>
    public const string StaffArchived = "staff.archived";

    public const string StaffProfileUpdated = "staff.profile_updated";

    public const string ProgramCreated = "program.created";

    public const string ProgramUpdated = "program.updated";

    public const string ProgramArchived = "program.archived";

    public const string ProgramStaffAssigned = "program.staff_assigned";

    public const string ProgramFeeUpserted = "program.fee_upserted";

    public const string ProgramFeeRemoved = "program.fee_removed";

    public const string ParentRegistered = "parent.registered";

    public const string ParentProfileUpdated = "parent.profile_updated";

    public const string ParentChildAdded = "parent.child_added";

    public const string ParentChildUpdated = "parent.child_updated";

    public const string ParentChildRemoved = "parent.child_removed";

    public const string MilestoneRecorded = "milestone.recorded";

    public const string MilestoneUpdated = "milestone.updated";

    public const string MilestoneRemoved = "milestone.removed";

    public const string ChildRegistered = "child.registered";

    public const string ChildMembershipChanged = "child.membership_changed";

    public const string ChildRemoved = "child.removed";

    public const string SubscriptionRequestSubmitted = "subscription_request.submitted";

    public const string SubscriptionRequestApproved = "subscription_request.approved";

    public const string SubscriptionRequestRejected = "subscription_request.rejected";

    public const string DailyReportCreated = "daily_report.created";

    public const string DailyReportUpdated = "daily_report.updated";

    public const string DailyReportPublished = "daily_report.published";

    public const string DailyReportRemoved = "daily_report.removed";

    public const string MemoryAdded = "memory.added";

    public const string MemoryRemoved = "memory.removed";

    public const string SubscriptionArchived = "subscription.archived";

    public const string SubscriptionPeriodEnded = "subscription_period.ended";

    public const string SubscriptionPeriodRenewed = "subscription_period.renewed";

    public const string SubscriptionPeriodCancelScheduled = "subscription_period.cancel_scheduled";

    public const string ParentLifetimeExported = "parent.lifetime_exported";

    public const string PartnershipInvited = "partnership.invited";

    public const string PartnershipAccepted = "partnership.accepted";

    public const string PartnershipDeclined = "partnership.declined";

    public const string PartnershipPaused = "partnership.paused";

    public const string PartnershipResumed = "partnership.resumed";

    public const string PartnershipRemoved = "partnership.removed";

    public const string PartnershipUpdated = "partnership.updated";

    public const string MediaUploadTicketIssued = "media.upload_ticket_issued";

    public const string MediaUploaded = "media.uploaded";

    public const string MediaAssetRegistered = "media.asset_registered";

    public const string MediaAssetDeleted = "media.asset_deleted";

    public const string ChildDocumentUploaded = "child_document.uploaded";

    public const string ChildDocumentDeleted = "child_document.deleted";

    public const string InstitutionDocumentUploadTicketIssued = "institution_document.upload_ticket_issued";

    public const string InstitutionDocumentUploaded = "institution_document.uploaded";

    public const string InstitutionDocumentReplaced = "institution_document.replaced";

    public const string InstitutionDocumentVerified = "institution_document.verified";

    public const string InstitutionDocumentDeleted = "institution_document.deleted";

    public const string CoParentInvitationIssued = "co_parent_invitation.issued";

    public const string CoParentInvitationResent = "co_parent_invitation.resent";

    public const string CoParentInvitationRevoked = "co_parent_invitation.revoked";

    public const string CoParentInvitationAccepted = "co_parent_invitation.accepted";

    public const string CoParentMemberRemoved = "co_parent.member_removed";

    public const string PaymentMethodAddInitiated = "payment_method.add_initiated";

    public const string PaymentMethodAddConfirmed = "payment_method.add_confirmed";

    public const string PaymentMethodSetDefault = "payment_method.set_default";

    public const string PaymentMethodRevoked = "payment_method.revoked";

    public const string BillingWebhookReceived = "billing.webhook_received";

    public const string BillingWebhookRejected = "billing.webhook_rejected";

    /// <summary>Renewal-ticker successfully charged a parent's saved
    /// card for the next subscription term. Tied to a SubscriptionPeriodId.</summary>
    public const string SubscriptionRenewalCharged = "subscription.renewal_charged";

    /// <summary>Renewal-ticker tried to charge but the gateway
    /// returned a typed failure (declined, expired, etc.). The period
    /// stays in its current window with FailedRenewalCount bumped.</summary>
    public const string SubscriptionRenewalChargeFailed = "subscription.renewal_charge_failed";

    /// <summary>Renewal-ticker had nothing to charge (no default card,
    /// or the default was expired and got marked as such). Same effect
    /// as a hard charge failure: FailedRenewalCount bumped, no roll.</summary>
    public const string SubscriptionRenewalNoCard = "subscription.renewal_no_card";

    /// <summary>Renewal-ticker skipped because the institution has no
    /// active payout account configured. Distinct from
    /// <see cref="SubscriptionRenewalNoCard"/>: the parent's card is
    /// fine, but Paystack would reject the split with no subaccount.</summary>
    public const string SubscriptionRenewalNoPayoutAccount = "subscription.renewal_no_payout_account";

    /// <summary>Institution staff successfully configured (or rotated)
    /// their bank-account-on-Paystack. The metadata records the new
    /// subaccount code + masked last4, never the full number.</summary>
    public const string TenantPayoutAccountConfigured = "tenant.payout_account_configured";

    /// <summary>Institution staff deactivated their payout account.
    /// Renewals stop until they re-configure or reactivate.</summary>
    public const string TenantPayoutAccountDeactivated = "tenant.payout_account_deactivated";

    /// <summary>
    /// Institution staff set / cleared the annual subscription open-
    /// close envelope on TenantSettings.SubscriptionWindow. The
    /// metadata captures the new month/day pairs (or nulls when
    /// reset to platform default) so the audit log shows the exact
    /// shift — useful when a parent reports "subscriptions were
    /// open yesterday and now they're not".
    /// </summary>
    public const string TenantSubscriptionWindowChanged = "tenant.subscription_window_changed";

    /// <summary>
    /// Institution staff (or a SuperAdmin) replaced the institution's
    /// required-documents list. Metadata captures the new code-count
    /// and a comma-joined preview of the codes so the audit log
    /// shows what the parent vault gate is now checking.
    /// </summary>
    public const string TenantRequiredDocumentsChanged = "tenant.required_documents_changed";
}
