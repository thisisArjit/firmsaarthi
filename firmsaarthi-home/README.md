# FirmSaarthi homepage

The public parent-brand site is a separate static Sites project: `appgprj_6ae101135fa48191852c66391abf3738`.

- Primary hostname: https://www.firmsaarthi.com/
- Also connected: https://firmsaarthi.com/
- Generated hosting URL: https://firmsaarthi.arjit-tiwari-ece14.chatgpt.site/
- Existing product: https://transport.firmsaarthi.com/

Source assets are in `dist/`. Preview with `python -m http.server 8126 --bind 127.0.0.1 --directory dist`. No package installation, application database, account system or paid hosting add-on is needed for this page. It uses the existing FirmSaarthi mark, with public Google Fonts and local system fallbacks.

Keep this project independent of the transport application's source, databases, buckets, OAuth configuration and deployment gate. Inspect `docs/DESIGN.md` for content boundaries and `docs/RELEASE.md` for actual verification and deployment state. Never promote future business tools or unconnected tracking providers as available features.

Publish changes through the Sites source workflow. Validate the exact static source privately on desktop and phone before exposing a new version. The initial version was hosted privately for these checks, then made public unchanged. DNS validation and certificate provisioning are independent of source publication.
