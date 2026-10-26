# Google sign-in activation

The app supports email/password registration independently of Google. Each registration creates an isolated business workspace. Existing accounts and their roles are unchanged.

Google sign-in and sign-up remain hidden until all three production runtime values below are configured. Never add the client secret to source control, browser code, a URL, or a chat message.

## Google Cloud setup

1. Open https://console.cloud.google.com/auth/overview and create or select a project owned by the business.
2. Configure Google Auth Platform branding and an External audience. Use Logistrace as the application name and a monitored support email. Supply any homepage/privacy/domain-verification information Google requests; do not claim ownership of the parent `chatgpt.site` domain.
3. Create an OAuth client of type **Web application**.
4. Set this exact authorized redirect URI:

   `https://logistrace.arjit-tiwari-ece14.chatgpt.site/api/auth/google/callback`

5. In Testing mode, add the Google accounts that will test login. Move to production and complete any Google-required verification before wider release. If Google cannot approve the hosted subdomain, use an owned domain and update the redirect URI and runtime configuration together.
6. Configure Sites production runtime values (not `.openai/hosting.json`):

   | Key | Value | Secret |
   | --- | --- | --- |
   | `GOOGLE_CLIENT_ID` | Web client ID from Google | No |
   | `GOOGLE_CLIENT_SECRET` | Client secret from Google | Yes |
   | `GOOGLE_REDIRECT_URI` | Exact URI above | No |

7. Redeploy the saved Site version to apply the new runtime revision. Verify real Google sign-in, sign-up, cancellation and account linking using designated test accounts before general release. Mocked token tests do not verify Google Cloud configuration.

Only `openid email` is requested. No Drive, Sheets, Gmail or offline/refresh-token access is requested. Google tokens are not retained. Identity is verified with Google's public signing keys, issuer, audience, expiration and nonce, then linked using Google's stable subject identifier. The authorization-code flow uses PKCE and a single-use, browser-bound, ten-minute state record.

## Existing users

Sign in using the existing password. Open Team / My account → Sign-in methods, confirm the current password and select Link Google account. Select the Google account with the same verified email. Existing records and permissions are retained. An email match alone never merges accounts. Changed access, disabled accounts and removed memberships remain enforced.

## Password registration limitations

Password signup does not claim to verify email ownership and does not grant access to invitations or other workspaces. Team members should use accounts created by their workspace owner rather than register a separate business. Transactional email verification and self-service password-reset emails are not configured. The original owner's platform recovery route does not recover every newly registered business owner. New business owners should retain their password securely and link Google once available. A transactional email provider is a separate prerequisite for verified-email/password-reset workflows.
