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
