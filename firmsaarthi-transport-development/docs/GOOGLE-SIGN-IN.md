# Google sign-in activation

Continue with Google on either authentication screen creates a workspace for a new verified Google identity, restores an already linked profile, or automatically links an exact existing password-account email when Google is authoritative for that address (Gmail or a signed Google Workspace hosted-domain claim). Both Google and the unchanged original password then sign in to the same user and workspace. Role, plan, business records and financial history remain intact. External-email Google accounts without a hosted-domain claim still require one-time password-confirmed linking. This behavior is live in release 43.

## Release 43 ownership checks — 28 October 2026

Automatic linking uses verified Google token signature, issuer, audience, expiry, nonce and email-verification checks. A Gmail domain or signed hosted-domain claim establishes Google authority; email_verified alone on an externally hosted address does not. Existing subject bindings take priority and are never replaced by an email match. Conditional insertion and audit use the captured credential version and current membership; disabled, conflicting and concurrently changed accounts are rejected.

Official evidence: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token . Nine focused service/real-route tests cover original password retention, exact existing identity and roles, conflict/race/rollback, signed hosted-domain claims and callback behavior. Real hosted Google testing on desktop and phone restored the already approved synthetic identity; it is not a claim of a new hosted real-user password-account link.

## Configuration checkpoint — 27 October 2026

- Google Cloud project: arctic-keyword-512917-j0 (FirmSaarthi Sign In), under the approved signed-in arjit4temp@gmail.com account. Cloud/API terms and email-only testing were explicitly approved. No card, billing account or paid service was added. Developer contact is logistrace@gmail.com; Google currently offers the project account as the support email. Homepage is https://transport.firmsaarthi.com.
- Separate approved Web clients exist for production and staging, each restricted to its exact /api/auth/google/callback URL. Secrets are protected Sites runtime values, never source or browser bundles. Production runtime revision 13 is live on release 41 after the required hosted gate passed. Staging Google values use their own client. Original production administrator/provider values are preserved.
- A real hosted test exposed a Cloudflare incompatibility: fetch rejects redirect:error. The token request now uses redirect:manual and rejects all non-success responses, including redirects. Credentials therefore never follow an unexpected token redirect. Two regression tests cover a valid signed token exchange and a rejected redirect. The temporary staging diagnostic was removed from the final candidate.
- Main working checkout suite: 280 passed; TypeScript passes. Isolated release/staging suite: 145 passed, one production-import-fixture test intentionally skipped because real migration payloads must not be copied to staging. These are not a coverage percentage or a claim that the authored Playwright CI suite ran.
- Actual Google consent/signup created only Synthetic Google OAuth QA in private staging. Actual desktop and phone repeat login on final fingerprint 679680d79b3d1740ca1701d1fd9b98c7a06d3050d039070d198f7a90428e9778 restored that same account; one Google identity remains and other synthetic customer workspaces remain isolated. Cancellation was also observed. No production customer was linked or modified. Existing-account linking/password/email/subject/credential-change/data-retention checks are local tests, not a live customer-link claim.
- The final stable-source candidate is in ../tms-google-release and ../tms-stage, based on released version 40 plus this login fix, two tests and release-41 notes. It excludes unfinished stage-policy/event/file UI foundations in tms-web. Hosted final staging Site version 13: appgprj_6ae065554e2c819195306c14a182519e~appgver_213ca272535481918f2dcc01f4c36dd4, source 7e6bb5d300b0a9d75400da54564759074d4255915. Actual desktop/phone signup/plan, supplier/contact/rating/assignment/search, timeline/manual-file/accounting, SIM gate and support-denial scenarios passed. Production saved version: appgprj_6adcea83a2e48191834b17064accdbaa~appgver_e014d04ea9b48191936eae659a3df060; deployment appgdep_6ae0e88ce59081919e77bb13445282f5 succeeded at 2026-10-27T18:08:37.647993+00:00, source f578506c0c3aef90db2d9a2c1a9751f4d68c261f. Read-only production checks confirm the owned domain, production environment, same fingerprint and Google-enabled API/UI. No real account was linked or created during production smoke checks. The original synthetic staging operator pin was restored in runtime revision 5 (deployment appgdep_6ae0e773c32481918c3d0d3d8f745bc9). Follow-up reads deny temporary operator admin access, show no active support session, and retain Google availability and the same fingerprint. Full CUA matrix ran on runtime 4; no real access changed.
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

## Requested OAuth operational ownership transfer — 28 October 2026

User requested Google sign-in management under firmsaarthi@gmail.com only. Existing Cloud project arctic-keyword-512917-j0 (FirmSaarthi Sign In) currently lists arjit4temp@gmail.com as Owner. Prepared IAM Grant access form with firmsaarthi@gmail.com and Owner role; NOT saved. Action-time security confirmation requested before grant/invitation, new account acceptance, OAuth support/developer contact update and removal of old owner only after verified new ownership. Browser tab22 retained for handoff; review screenshot outputs/google-ownership-transfer-review.png. Reuse existing project and both OAuth clients/redirects; no client/secret rotation, account mapping changes, billing or application deployment required solely for ownership. Do not restrict customer Google sign-in to the operational email. Preserve pending OTP staging work and original production release43 until its own release gate passes.

## Ownership invitation submitted — 28 October 2026

User explicitly approved ownership transfer, recipient acceptance, contact updates and removing arjit4temp@gmail.com only after verified new ownership. Submitted IAM Owner grant to firmsaarthi@gmail.com in existing arctic-keyword-512917-j0 project. Google confirmed Policy updated; recipient row shows Owner with Warning; tooltip confirms Invitation sent. Pending acceptance. Old owner remains Owner. No OAuth client/secret/callback, customer account or billing change.

Switched via Google's observed account selector to the authenticated firmsaarthi@gmail.com session (authuser2). Google presents Welcome Firm Saarthi, India, and a first-use Cloud Terms/applicable service/API agreement. Separate action-time legal confirmation requested; NOT accepted yet. Cannot accept ownership or remove old owner until this completes. New recipient tab25 is at terms, original project tab24 retained. Screenshot outputs/firmsaarthi-google-cloud-terms.png. Continue after explicit terms approval; don't ask for the already-approved ownership transfer again. If another actual legal agreement/CAPTCHA requires confirmation, explain that specific new action. No card, billing activation or paid services authorized.

## Google operational ownership transfer completed — 28 October 2026

User approved the ownership transfer and separately accepted Google Cloud's first-use terms for firmsaarthi@gmail.com. Accepted the Google invitation in that authenticated account. IAM initially required propagation; verified the project dashboard and both existing Web OAuth clients under Account: Firm Saarthi (firmsaarthi@gmail.com) before removing old ownership.

Completed: firmsaarthi@gmail.com is the sole listed project Owner of arctic-keyword-512917-j0 (FirmSaarthi Sign In). Removed arjit4temp@gmail.com from this project's IAM only after recipient access was verified; Google confirmed Removed arjit4temp@gmail.com and the IAM list contains only Firm Saarthi as Owner. Saved and reopened Google Auth Platform Branding: User support email and Developer contact information both firmsaarthi@gmail.com. Project, both OAuth clients, client secrets, authorized callbacks/domains, identity/email scopes and customer identity mappings retained. No new OAuth client or secret rotation, application deployment, card, free-credit trial activation or billing account.

Existing client IDs retained: production226113265852-neeh06vfg93frp1dr0h5cf971cm6e7po.apps.googleusercontent.com and staging226113265852-vk7n9ddguh4o3o79ijg8340ulk2tfpa4.apps.googleusercontent.com. No protected client secrets were revealed or copied. Google consent publishing status remains Testing; no new branding-verification claim.

Read-only custom-domain smoke after removal: /api/auth googleEnabled=true; /api/release environment=production and unchanged release43 fingerprint e6da79b910ae309b80c4d07c6a782bbd83d3432078a5b5820dd6669ccf105282. This checks configuration/availability, not a new full provider sign-in test. Screenshots: outputs/google-owner-firmsaarthi-complete.png and outputs/google-firmsaarthi-contacts-complete.png. New-owner console retained; temporary old-owner console closed. Sites/GitHub ownership and app platform-admin pin were not transferred. Earlier pending-transfer notes above are historical and now resolved.
