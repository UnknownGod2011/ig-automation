# Production verification

Verified on 2026-10-04 using the single Reel explicitly supplied and authorized by the user.

- Private Site: https://reel-reposter-nubloom.nubloomtech.chatgpt.site
- Owner: the user's Nubloom account. Anonymous access returned HTTP 401 and did not expose the app.
- Source Reel: https://www.instagram.com/p/Db8yWXrswOT/
- Durable job: b7d57a78-5791-4081-922b-87ad4a435c8f
- Actual published Instagram media ID: 18103130813005333
- Published Reel: https://www.instagram.com/reel/DeEipgDCh9t/
- Meta readback: media_type VIDEO, media_product_type REELS, caption exactly `FOLLOW FOR MORE!`.
- Production downloaded the original MP4, stored it in Sites R2, and Meta fetched the temporary URL successfully (HTTP 206).
- Publication completed through the normal app processing and durable publish claim. The browser showed `Published ✓`.
- Cleanup finished with no pending cleanup. The storage inspection reported no temporary video; the former public transport URL returned HTTP 404.
- Safe retry and a second request ID with a query-string variant both returned the original published job and the same media ID. No second publication was sent.
- All 26 automated tests passed; Meta is mocked in tests. GitHub CI passed for implementation commit 972933c.
- Production page contains no credential values. Final error-log queries returned no events for either Worker.
- An enabled hourly Sites maintenance schedule was saved: Automation_d222b36ca6388191817c7d8e9357b9ce. Its maintenance endpoint returned HTTP 200 with no abandoned objects. Scheduling is provisioned; a future scheduled run has not yet occurred.

Saved production app version: appgprj_6ac237d234ac81919a412caac00d12f9~appgver_0cd88cb360b48191bc7b72188e99b86d.
App deployment: appgdep_6ac239cfba84819190c79f889713156b (succeeded).
Transport deployment: appgdep_6ac2387e723c81919cdf28d07b6e0cf3 (succeeded).

Only temporary transport media is stored. No downloaded Reel was added to this repository or retained after successful publication. Secrets and temporary URL credentials are intentionally absent from this evidence.

## Shared five-Reel queue verification - 2026-10-05

The same Site is now public with server-side shared-passcode sessions. No ChatGPT sign-in is needed. Anonymous posting endpoints return 401; passcode unlock and Instagram connection return 200. Five input boxes, sequential publication, optional per-Reel captions and automatic download backoff are deployed. Keep the page open; reopening resumes its saved queue. This does not claim unattended processing after the browser closes.

All three subsequently supplied tracking links passed the REAL hosted pipeline, one at a time:

| Source shortcode | Durable job | Instagram media ID | Published Reel |
| --- | --- | --- | --- |
| DdbhenUOE59 | 59ecd0bc-7b72-4885-b6aa-a6c4c26b32e9 | 18110193260040734 | https://www.instagram.com/reel/DeFanNfkkK2/ |
| Das-y5rpgd1 | b6d83a97-120f-45b6-8c37-70c6ca5804f6 | 17930454465166325 | https://www.instagram.com/reel/DeFa6sxDiwD/ |
| Dd_hGHkurNr | 1150e6e9-e490-40e2-b675-7eb1d6dbcd66 | 18138920896621909 | https://www.instagram.com/reel/DeFbGH-Dq3Z/ |

For each, Meta readback confirmed VIDEO + REELS and caption exactly `FOLLOW FOR MORE!`. Each job returned published with cleanupPending=false; all three storage inspections returned temporaryVideoExists=false. Different request IDs and plural/query-string variants, plus retry requests, returned the same existing media IDs without a new post. The browser displayed All Reels published. The second Reel recovered automatically after temporary metadata failures.

The live test also exposed and fixed a stale cleanup flag after failed downloads: cleanup with no object now clears the flag, and safe retries clean/reset state before downloading again. Regression coverage prevents maintenance from deleting a freshly retried video. Download retry counts and backoff timestamps are durable; only pre-container metadata downloads retry automatically, never ambiguous media_publish requests. Public embed metadata is attempted before extra page/API calls to reduce upstream request load. Persistent unavailable/private media is still rejected after bounded retries; this is not a guarantee that Instagram permits every public download.

All 36 automated tests passed with mocked Meta. Focused queue/backoff tests passed again after clearing recovered warnings. Production maintenance authorization returned 200. The final production error-log query returned zero events.

Saved final Site version: appgprj_6ac237d234ac81919a412caac00d12f9~appgver_4c3d7537d0c08191988bb885d2644b5b.
Deployment: appgdep_6ac2ae1d188081918e01e7902ac9bfc7 (succeeded).
Sites source commit: 1963f8037a6c78e136f54bc7b710d0f6986c3c9e.
Screenshot: ignored artifacts/three-reels-published.png. No Reel media is stored in Git.
