# Staging and production releases

Owner requested a separate hosted stage and E2E gate on 27 October 2026. Production must remain at its last approved release until the candidate passes the gate below.

| Environment | Site project | URL | Checkout |
| --- | --- | --- | --- |
| Production | appgprj_6adcea83a2e48191834b17064accdbaa | https://transport.firmsaarthi.com | tms-payments-release |
| Staging | appgprj_6ae065554e2c819195306c14a182519e | https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site | ../tms-stage |

Staging is owner-private at the Sites boundary, with separately provisioned DB and BUCKET. It has APP_ENV=staging and an obvious test-data banner. Production customer records, credentials, billing administrator pin and provider keys are not copied. Synthetic staging platform owner is separate from the real platform operator; only separately configured Test-mode payment/email services are used; live payment credentials are never copied from production. Browser visitors first use ChatGPT to enter the private Site, then the app's synthetic test account. Supported Sites service access may be fetched for HTTP/CI testing and held only in memory or a CI secret, never committed, printed or embedded in a URL.

## Required release sequence

1. Start a bounded candidate from the authoritative tms-payments-release source (or a separate checkout of the current production source), preserving larger unpublished tms-web work. Pass unit/API/component checks and TypeScript. Do not deploy production.
2. Run `node scripts/release-fingerprint.mjs --write`. This hashes application, database migrations, public assets, test/runner/configuration and dependency inputs, normalizing text line endings. Site identity, runtime secrets, documentation and ignored outputs are excluded; the generated fingerprint is excluded from its own input.
3. Copy the candidate source into the staging checkout while preserving its own .openai/hosting.json, Git remote, local runtime and test database. Never copy .env/.dev.vars, customer exports or persistent local storage. Verify both checkouts produce the same fingerprint. Never change staging's manifest to the production project ID.
4. Use the Sites workflow to build/save/deploy the private staging Site. Hosted migrations apply to staging only. Confirm /api/release reports staging and the candidate fingerprint using owner/service access. Record its exact saved version and successful deployment ID, including the runtime revision.
5. Run the hosted E2E matrix on desktop and phone: signup/30-day trial/plan; supplier profile/private rating/route search/reviewed assignment; status/manual provenance/private file upload with unchanged accounting; honest SIM provider gate; platform complimentary override and audited read-only support, including denied writes and tenant boundaries. Only synthetic fixtures are allowed. CUA runs and Playwright CI runs must be identified honestly; authored/listed tests are not executed tests.
6. Write actual evidence to ignored outputs/staging-validation.json: projectId, origin, environment=staging, fingerprint, versionId, deploymentId, completedAt, runner (cua or playwright), status and each device/scenario result. Required scenario keys are in scripts/check-release-gate.mjs. Evidence must contain no access tokens or passwords.
7. Immediately before production packaging, run `node scripts/check-release-gate.mjs`. Missing, failed, skipped, older-than-24-hour, wrong-environment or changed-source evidence blocks publication. Keep it as the first ordered command in the production Sites workflow. For the security47 candidate and subsequent releases, run node scripts/audit-security.mjs to obtain fresh matching-source dependency evidence and node scripts/check-security-gate.mjs as the next ordered production command before building. Both gates must pass; reviewed lower-severity tool findings remain open and expire after30days. Retest if application/test/build inputs change after the passing run. A private staging deployment is not a production release or a reason to add customer release notes.
8. Only after passing, build/package the matching production source with its original manifest and publish to the existing production Site. Preserve its public audience, domain and real DB/BUCKET. Record native version/deployment IDs and perform read-only production smoke checks. Never run mutation QA against production.

## Automated browser runner

playwright.staging.config.ts accepts only the exact staging origin from config/environments.json. tests/e2e/product.spec.ts also checks /api/release environment/fingerprint before hosted mutation tests. The local config still targets loopback. Hosted CI needs SITES_STAGING_ACCESS_TOKEN, E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD as secrets for the isolated synthetic platform operator. No CI secrets have been installed by committing this configuration. Until the hosted CI run is actually executed, report CUA browser checks separately and do not claim the authored Playwright suite passed.

No automatic production publishing is configured in GitHub. The existing recurring automation was updated in place to follow this mandatory staging-first process. The local gate checks release evidence; it does not revoke the Site owner's native deployment authority.


## Email-ownership candidate (unpublished)

For the complete email-ownership milestone, keep both existing gates unchanged and add node scripts/check-auth-release-gate.mjs before the build. The additional script imports the original hosted and dependency checks, then requires actual email-signup-and-recovery, legacy-google-account-claim and existing-signin-preserved scenarios on desktop and phone. Each needs its measured viewport and real hosted runner. Local unit data is not hosted acceptance. The legacy claim flow is not implemented yet; do not publish this candidate. Read EMAIL-OWNERSHIP-CHECKPOINT.md for the precise remaining work.
