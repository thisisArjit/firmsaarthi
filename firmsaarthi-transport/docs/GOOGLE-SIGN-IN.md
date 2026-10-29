# Google sign-in activation

Continue with Google on either sign-in or Create account registers a new verified Google user in a separate workspace, or signs in an already linked user. A blank business name starts as My business and can be updated in the profile. Email/password fields are not required for Google continuation. Existing password accounts must first sign in and link Google from My account; matching email alone does not grant access. This behavior is live in release 42.

## Configuration checkpoint — 27 October 2026

- Google Cloud project: arctic-keyword-512917-j0 (FirmSaarthi Sign In), under the approved signed-in arjit4temp@gmail.com account. Cloud/API terms and email-only testing were explicitly approved. No card, billing account or paid service was added. Developer contact is logistrace@gmail.com; Google currently offers the project account as the support email. Homepage is https://transport.firmsaarthi.com.
- Separate approved Web clients exist for production and staging, each restricted to its exact /api/auth/google/callback URL. Secrets are protected Sites runtime values, never source or browser bundles. Production runtime revision 13 is prepared; production deployment remains gated until hosted checks finish. Staging Google values use their own client. Original production administrator/provider values are preserved.
- A real hosted test exposed a Cloudflare incompatibility: fetch rejects redirect:error. The token request now uses redirect:manual and rejects all non-success responses, including redirects. Credentials therefore never follow an unexpected token redirect. Two regression tests cover a valid signed token exchange and a rejected redirect. The temporary staging diagnostic was removed from the final candidate.
- Main working checkout suite: 280 passed; TypeScript passes. Isolated release/staging suite: 145 passed, one production-import-fixture test intentionally skipped because real migration payloads must not be copied to staging. These are not a coverage percentage or a claim that the authored Playwright CI suite ran.
- Actual Google consent/signup created only Synthetic Google OAuth QA in private staging. Actual desktop and phone repeat login on final fingerprint 679680d79b3d1740ca1701d1fd9b98c7a06d3050d039070d198f7a90428e9778 restored that same account; one Google identity remains and other synthetic customer workspaces remain isolated. Cancellation was also observed. No production customer was linked or modified. Existing-account linking/password/email/subject/credential-change/data-retention checks are local tests, not a live customer-link claim.
- The final stable-source candidate is in ../tms-google-release and ../tms-stage, based on released version 40 plus this login fix, two tests and release-41 notes. It excludes unfinished stage-policy/event/file UI foundations in tms-web. Hosted final staging Site version 13: appgprj_6ae065554e2c819195306c14a182519e~appgver_213ca272535481918f2dcc01f4c36dd4, source 7e6bb5d300b0a9d75400da54564759074d4255915. Actual desktop/phone signup/plan, supplier/contact/rating/assignment/search, timeline/manual-file/accounting, SIM gate and support-denial scenarios passed. The original synthetic staging operator pin was restored in runtime revision 5 (deployment appgdep_6ae0e773c32481918c3d0d3d8f745bc9). Follow-up reads deny temporary operator admin access, show no active support session, and retain Google availability and the same fingerprint. Full CUA matrix ran on runtime 4; no real access changed.
- Google Cloud remains in Testing. Basic identity/email scopes have an official exception to Testing allowlist/expiry restrictions: https://support.google.com/cloud/answer/15549945?hl=en . The consent screen may show the domain until branding verification. Branded publication still needs genuine public policy pages and any Google-requested domain/brand verification; no policy URLs or verification claims were fabricated.

## Google Cloud setup

1. Open https://console.cloud.google.com/auth/overview and create or select a project owned by the business.
2. Configure Google Auth Platform branding and an External audience. Use FirmSaarthi Transport as the application name and a monitored support email. Supply any homepage/privacy/domain-verification information Google requests; do not claim ownership of the parent `chatgpt.site` domain.
3. Create an OAuth client of type **Web application**.
4. Set this exact authorized redirect URI:

   `https://transport.firmsaarthi.com/api/auth/google/callback`

5. Review the current Google audience rules. This app requests only openid/email, which qualifies for the documented basic-identity exception to Testing user restrictions. For verified branded consent, provide genuine homepage/policy pages and complete any Google-required verification. Use the owned production domain and keep redirect URI and runtime configuration aligned.
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
