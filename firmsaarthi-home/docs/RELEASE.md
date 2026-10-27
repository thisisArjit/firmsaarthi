# Initial homepage — 28 October 2026

User requested a sober, minimal public parent-brand homepage explaining FirmSaarthi, its direction and its current Transport/Logistics offering. The site has brand/vision/product sections, an explicitly illustrative connected workflow, four approved INR prices in compact Individual/Team sections, a 30-day trial statement and contact links. Six product calls to action lead directly to the existing Transport app. There are no signup forms, trackers or customer records on this site.

- Project: appgprj_6ae101135fa48191852c66391abf3738.
- Initial pushed source: 4e200d626ad5db3f73ca36a072021c1f6d34cbb1.
- Saved version 1: appgprj_6ae101135fa48191852c66391abf3738~appgver_0dca4189bd8481919073120c2ab17117.
- Successful initial owner-private deployment: appgdep_6ae101f01fc881919e99520fc118d5e8, runtime0, 2026-10-27T19:56:54.757913+00:00.
- Actual private hosted CUA validation: desktop1280 CSS px and phone390x844; product/pricing sections, correct four amounts/trial, anchor navigation, primary/Individual link handoff to actual Transport sign-in, no horizontal overflow. Local desktop composition was also visually checked at1440. HTML structure has one H1 and all local anchors resolve. No automated browser suite or Lighthouse score claimed. Evidence and asset hashes: ignored outputs/validation.json.
- Same saved version was made public only after private checks; access policy revision2. Generated hosting URL responds anonymously200 with the expected homepage.
- www custom-domain ID: appgdom_6ae1026d15dc8191a859419eb35693f6. Apex ID: appgdom_6ae10290274c81919351ca7e0d7f139a. DNS records saved through the existing signed-in GoDaddy account. Original www CNAME pointed to firmsaarthi.com; now custom-domains.chatgpt.site. Original apex Parked record replaced with162.159.143.30 and second A172.66.3.26 added. Added exact native-returned ownership/certificate TXT records for both names. Authoritative ns65 confirms target A records. Transport CNAME/ownership records, NS/SOA/DMARC and all existing mail/provider settings preserved. No purchases, paid add-ons or account grants.
- Certificate and custom routing activation was pending after DNS save; final status recorded below after verification. Do not describe a pending custom hostname as live solely because the generated URL works.

## Final activation

Both native custom domains report status=active, provider_status=active and ssl_status=active, with no last_error. The same privately validated saved version1 was explicitly republished publicly after DNS attachment: deployment appgdep_6ae103a6938481919bf9f6ddba35cf96 succeeded2026-10-27T20:04:06.463428+00:00, runtime0. No new content/source version was created for this routing step.

Both custom hostnames returned HTTPS200 and the expected exact homepage when resolved to the current published Cloudflare targets, with ordinary certificate/SNI validation enabled (curl --resolve; no insecure TLS flags). Authoritative DNS and public1.1.1.1 match the native required records. This laptop's system resolver still returned the previous GoDaddy parking addresses3.33.130.190/15.197.148.33 and therefore its ordinary browser showed a TLS name error; this is a known local stale-DNS limitation, not a successful custom-domain browser claim. A DNS-cache flush required elevation and was not performed; system/network/security settings were not changed. The generated public hosting URL remains available during DNS-cache expiry. Final browser screenshot of the same published page: outputs/firmsaarthi-home-live.png. Transport read-only /api/release remains200 with production fingerprint e6da79b910ae309b80c4d07c6a782bbd83d3432078a5b5820dd6669ccf105282.

Local preview process stopped. Domain credentials remained with signed-in provider sessions; no secrets written to this source. The homepage has no application state to migrate. Future edits should preserve the public audience, both hostnames and the separate Transport app.
