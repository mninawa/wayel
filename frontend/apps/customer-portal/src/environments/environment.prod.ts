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
};
