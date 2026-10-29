# Staging and production releases

Owner requested a separate hosted stage and E2E gate on 27 October 2026. Production must remain at its last approved release until the candidate passes the gate below.

| Environment | Site project | URL | Checkout |
| --- | --- | --- | --- |
| Production | appgprj_6adcea83a2e48191834b17064accdbaa | https://transport.firmsaarthi.com | tms-web |
| Staging | appgprj_6ae065554e2c819195306c14a182519e | https://firmsaarthi-transport-staging.arjit-tiwari-ece14.chatgpt.site | ../tms-stage |

Staging is owner-private at the Sites boundary, with separately provisioned DB and BUCKET. It has APP_ENV=staging and an obvious test-data banner. Production customer records, credentials, billing administrator pin and provider keys are not copied. Synthetic staging platform owner is separate from the real platform operator; no provider connection or payment gateway is configured. Browser visitors first use ChatGPT to enter the private Site, then the app's synthetic test account. Supported Sites service access may be fetched for HTTP/CI testing and held only in memory or a CI secret, never committed, printed or embedded in a URL.

## Required release sequence

1. Make the candidate in tms-web and pass unit/API/component checks and TypeScript. Do not deploy production.
2. Run `node scripts/release-fingerprint.mjs --write`. This hashes application, database migrations, public assets, test/runner/configuration and dependency inputs, normalizing text line endings. Site identity, runtime secrets, documentation and ignored outputs are excluded; the generated fingerprint is excluded from its own input.
3. Copy the candidate source into the staging checkout while preserving its own .openai/hosting.json, Git remote, local runtime and test database. Never copy .env/.dev.vars, customer exports or persistent local storage. Verify both checkouts produce the same fingerprint. Never change staging's manifest to the production project ID.
4. Use the Sites workflow to build/save/deploy the private staging Site. Hosted migrations apply to staging only. Confirm /api/release reports staging and the candidate fingerprint using owner/service access. Record its exact saved version and successful deployment ID, including the runtime revision.
5. Run the hosted E2E matrix on desktop and phone: signup/30-day trial/plan; supplier profile/private rating/route search/reviewed assignment; status/manual provenance/private file upload with unchanged accounting; honest SIM provider gate; platform complimentary override and audited read-only support, including denied writes and tenant boundaries. Only synthetic fixtures are allowed. CUA runs and Playwright CI runs must be identified honestly; authored/listed tests are not executed tests.
6. Write actual evidence to ignored outputs/staging-validation.json: projectId, origin, environment=staging, fingerprint, versionId, deploymentId, completedAt, runner (cua or playwright), status and each device/scenario result. Required scenario keys are in scripts/check-release-gate.mjs. Evidence must contain no access tokens or passwords.
7. Immediately before production packaging, run `node scripts/check-release-gate.mjs`. Missing, failed, skipped, older-than-24-hour, wrong-environment or changed-source evidence blocks publication. Keep it as the first ordered command in the production Sites workflow. Retest if application/test/build inputs change after the passing run. A private staging deployment is not a production release or a reason to add customer release notes.
8. Only after passing, build/package the matching production source with its original manifest and publish to the existing production Site. Preserve its public audience, domain and real DB/BUCKET. Record native version/deployment IDs and perform read-only production smoke checks. Never run mutation QA against production.

## Automated browser runner

playwright.staging.config.ts accepts only the exact staging origin from config/environments.json. tests/e2e/product.spec.ts also checks /api/release environment/fingerprint before hosted mutation tests. The local config still targets loopback. Hosted CI needs SITES_STAGING_ACCESS_TOKEN, E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD as secrets for the isolated synthetic platform operator. No CI secrets have been installed by committing this configuration. Until the hosted CI run is actually executed, report CUA browser checks separately and do not claim the authored Playwright suite passed.

No automatic production publishing is configured in GitHub. The existing recurring automation was updated in place to follow this mandatory staging-first process. The local gate checks release evidence; it does not revoke the Site owner's native deployment authority.
