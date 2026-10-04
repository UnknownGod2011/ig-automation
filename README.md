# Reel Reposter

A private single-user utility. Paste a public Instagram Reel (or single video `/p/` link), click **POST REEL**, and publish it with the fixed caption `FOLLOW FOR MORE!`.

## Hosting

Current private deployment: https://reel-reposter-nubloom.nubloomtech.chatgpt.site, owned by the user's Nubloom account. The tracked hosting manifests identify this deployment and its video transport. The earlier unpublished Sites in the other account are not used.

The interface and all publishing endpoints run on an owner-private ChatGPT Site. Sites D1 stores small job records and Sites R2 holds temporary MP4 transport objects. An additional Sites Worker in `transport/` serves only unguessable temporary video URLs to Meta. It exposes no interface or administration. This relay is required because owner-private Sites require authentication on every route and Meta's URL downloader cannot send the Sites service header. The relay forwards only a narrowly validated video path to the fixed private Site origin, using its server-side Sites service credential. No Instagram credentials are shared with the relay.

The production source is maintained in this Git repository and mirrored to the Sites-managed source repositories using the official Sites workflow. `.openai/hosting.json` contains only Site identity and logical storage bindings.

## Correctness

- Strict HTTPS Instagram domain/path validation and Instagram CDN allowlisting, including every redirect. No login, account cookies, or private content bypass.
- The maintained Cobalt API adapter is available for a separately authorized/self-hosted instance. The default downloader uses logged-out public metadata extraction based on yt-dlp, with an embed fallback. It rejects carousels rather than choosing a different clip.
- The video streams from Instagram into R2; no video passes through the browser, Git, or D1.
- Graph API **v26.0**, Instagram Login on `graph.instagram.com`: create `REELS` container, poll once per minute, publish only at `FINISHED`, then save the returned valid media ID before deleting R2 bytes.
- A unique shortcode record merges double-clicks and repeated URLs. D1 leases serialize transitions. An irreversible publish claim is persisted **before** `media_publish`. No ambiguous publish response is ever automatically retransmitted. A missing media ID is shown as uncertain even if the container reports publication; the utility deliberately refuses to risk a duplicate.
- Retry is offered only for failures before any container or publication exists. Reopening the page resumes its saved job; browser storage contains only the request ID and input URL, not publication authority.
- Success requires a returned Instagram media ID. Cleanup is immediate; if deletion fails, the saved media ID is preserved and cleanup is retried without publishing again.
- Cleanup checks container state before deleting abandoned media. It never deletes media while Meta reports `IN_PROGRESS`. Old unsubmitted objects expire after six hours; terminal containers are safe to clean. The Sites maintenance schedule calls the private maintenance endpoint and renews the token. Objects are not archived.
- Official long-lived token exchange and refresh are server-only. Token state is encrypted using AES-GCM under the runtime app secret; raw tokens are never returned to the browser or stored in job records.
- The supplied AI test shortcode uses Meta's `is_ai_generated=true` disclosure; this does not generate or modify content and leaves the fixed caption unchanged.

## Runtime settings

Open **ChatGPT Sites → Reel Reposter → More actions → Settings → environment variables/secrets**. The four `INSTAGRAM_*` variables listed in `.env.example` are secrets. `SITE_ORIGIN` and `TRANSPORT_ORIGIN` are the verified Site origins. Optional `COBALT_API_URL` points to an authorized instance; `COBALT_API_KEY` must be a secret. `LIVE_TEST_AI_SHORTCODE` identifies only the user-authorized AI sample.

For the transport Site, set `PRIVATE_SITE_ORIGIN` and secret `SITE_BYPASS_TOKEN`. These are server-only. Never embed them in source or URLs. If the private Site's service credential is rotated, update the relay's secret and redeploy its saved version.

Local credentials belong in ignored `.env.local`. The existing user's `ig-secrets.txt` is ignored. `.env.example` contains blank values only.

## Development and verification

Node 22+, `npm ci`, `npm run db:generate` for schema changes, then `npm run build` and `npm test`. The runtime test exercises the built Worker. Build output is a Cloudflare-compatible ESM Worker with a default `fetch` export. Drizzle migrations are schema-only and versioned; do not modify migrations already deployed.

The automated suite uses an actual local D1 database and R2 object store through Miniflare, with mocked Meta responses. It cannot create a real Instagram post. Live verification is separate and requires explicit authorization for its exact Reel URL.

### Current primary sources consulted

- [Sites documentation](https://learn.chatgpt.com/docs/sites)
- [Meta content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Meta supported versions](https://developers.facebook.com/docs/graph-api/changelog/versions)
- [Instagram Login token lifecycle](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Meta resumable uploads](https://developers.facebook.com/documentation/instagram-platform/content-publishing/resumable-uploads) — currently limited to Facebook Login for Business, so not used for this Instagram Login app.
- [Cobalt API](https://github.com/imputnet/cobalt/blob/main/docs/api.md) — hosted instances require the instance owner's permission; no protected public instance is used.
- [yt-dlp Instagram extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/instagram.py)
- [Suggested downloader investigated](https://github.com/Okramjimmy/Instagram-reels-downloader) — its hardcoded web request tokens were unsuitable; no account cookies or login automation were adopted.
