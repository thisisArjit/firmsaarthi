# FirmSaarthi transport domain

Owner purchased firmsaarthi.com at GoDaddy and authorized connecting transport.firmsaarthi.com on 27 October 2026. The registrar supplies DNS; the existing Sites app, SQL database and object storage remain on their original project. No registrar website-builder/hosting purchase is needed.

- Project: appgprj_6adcea83a2e48191834b17064accdbaa; public audience preserved.
- Existing published app: https://logistrace.arjit-tiwari-ece14.chatgpt.site (version 36).
- Requested hostname: https://transport.firmsaarthi.com.
- Native custom domain ID: appgdom_6ae057bbca388191ab4b190b276df444.
- Native CNAME target: custom-domains.chatgpt.site.

Added only these new GoDaddy DNS records through the owner's signed-in UI; existing apex/www/nameserver/mail-related records were preserved:

| Type | Relative name | Value |
| --- | --- | --- |
| CNAME | transport | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.transport | openai-site-verification=pedSQfl0bnQ1lQJ2ZRwEYQN3mvNK4hnvaqSC5UVI4gw |
| TXT | _cf-custom-hostname.transport | 223d5eba-1819-4f0c-a7dd-44487c4c1720 |

These TXT values are public DNS verification records, not application credentials. GoDaddy confirms saved records; displayed TTL is one hour. Public resolver 1.1.1.1 confirms CNAME and both TXT records. Native refresh at 2026-10-27T07:55:28.547061Z reports domain active / provider active / SSL active with no last_error. An earlier null validation-record entry supplied no actionable DNS change; no value was invented. Reuse this domain ID for any future status refresh, rather than creating another mapping. The certificate-validation TXT remains in DNS although the final native response lists only Sites ownership TXT.

Verified after activation without any Sites bypass: HTTPS sign-in page 200; public plan endpoint 200; anonymous /api/tms and /api/workspace each 401/no-store; cross-origin /api/auth POST 403. CUA browser opens the normal sign-in page at the requested hostname with no console errors; screenshot outputs/firmsaarthi-live-domain.png. Existing browser sessions are hostname-specific; users sign in again on the new address. Google OAuth remains gated until its configuration is supplied and approved origins/redirects are updated. This domain change does not implement public customer pages or rename application content (the interface still says Logistrace).

This was a hosting-only activation of saved version 36, source e4bdb76c9c26d7b7f8565465c4e48b8c8f45e018. Native latest-version listing retains saved version appgprj_6adcea83a2e48191834b17064accdbaa~appgver_3ca8247f640c81919cf42daa39665da4 and deployment appgdep_6adf9b7eed1081918dff37d35ce295e2. Custom-domain refresh passed through active_redeploying before active; it did not return a distinct deployment ID. No new product version or source publication is claimed.

The existing heartbeat build-logistrace-end-to-end was updated to every 15 minutes, retaining its original implementation and safety scope. This is a work/check cadence, not a guarantee of a release every interval. Publish only validated increments to this same project; verify the custom hostname remains attached. No duplicate automation was created.
