/**
 * Karma/unit-test environment — no support-channel fallbacks so specs
 * control API vs disabled UI explicitly.
 */
export const environment = {
  production: false,
  useMock: false,
  useBffAuth: false,
  platformApiUrl: '',
  passwordSignInEnabled: true,
  enableKycOpsReview: true,
  enableParcelReceive: true,
  googleMapsApiKey: '',
  googleAnalyticsEnabled: false,
  googleAnalyticsMeasurementId: '',
  supportWhatsAppLink: '',
  supportWhatsAppLabel: '',
  supportWhatsAppE164: '',
  supportEmail: '',
};
