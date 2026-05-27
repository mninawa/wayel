export const environment = {
  production: true,
  useMock: false,
  useBffAuth: true,
  /** Set at deploy time (build-time replace or runtime config). */
  platformApiUrl: '',
  /**
   * SSO-only posture: hide the email/password form. Matches the API
   * which gates `/auth/login` behind `Auth:EnablePasswordSignIn=false`
   * in Production.
   */
  passwordSignInEnabled: false,
  /** Internal ops screens; gate with X-Wayel-Ops-Key. Disable in public cloud prod when not needed. */
  enableKycOpsReview: true,
  enableParcelReceive: true,
  /** Set at deploy time for pickup location Google Maps embeds. */
  googleMapsApiKey: 'AIzaSyCjkC0e4WQGbrefPDfkX0hoPfZR3DUAc4c',
};
