# Controlled local video publishing

`scripts/publish-local-batch.mjs` publishes 1–20 unique videos in an explicitly prepared, ignored JSON selection. The default selection is `artifacts/sh10comps-publish-plan.json`; another plan can be passed as the first argument. Each plan directory has its own publication ledger and `youtube-top10` temporary media directory. It is not a scheduler and does not automatically publish the rest of a channel.

The helper reads the existing ignored credential file without printing credentials. It serves only selected MP4 files from a loopback server through the installed Cloudflare Quick Tunnel. Media URLs use random paths; all other routes return 404. HTTPS verification stays enabled. Newly allocated tunnel names are checked through Cloudflare DNS to avoid Windows negative DNS caching.

Meta receives `REELS`, the per-video caption, and the temporary video URL. The helper waits for `FINISHED`, records a write-ahead publication claim, calls `media_publish` once, immediately saves the returned media ID, deletes the local temporary MP4, and checks the returned Reel type and exact caption. Published files are inaccessible through the transport even before deletion completes. The tunnel stops after the batch.

An ignored atomic ledger and exclusive process lock prevent repeat publication when the command is rerun. An interrupted publication without a valid saved media ID is never automatically resent. Recovery verifies existing saved media IDs and completes local cleanup without reposting. An interrupted active container retains its identifier; check its status instead of creating a replacement.

Run only after permission and explicit publication authorization for the selected content. Automated tests mock publishing and never invoke this command against Instagram. Quick Tunnels are temporary test transport, not permanent hosting. Video/audio are not altered to disguise duplicate content.
