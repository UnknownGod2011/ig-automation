# Sites unattended maintenance

This routine is required for temporary-media cleanup when the passcode-protected Site is closed and for long-lived token renewal. No Reel is newly submitted by maintenance.

1. Read this Site's `project_id` from `.openai/hosting.json`, then call native Sites `get_site` for that exact project in its owning workspace.
2. Verify the Site remains active and owned by the user. It is public with application passcode protection. Use only its returned production URL and `siwc_bypass_bearer_token`. Do not create or rotate the service token merely to check access.
3. Make one `POST /api/maintenance` request to that production URL with `Content-Type: application/json`, an empty JSON body, and `X-Reposter-Maintenance: <returned service token>`. Sites consumes its own service header, so the application needs this separate header. Keep the token in execution memory only; never put it in command arguments, tracked files, logs, or messages. An access error names the required header for older scheduled tasks. `MAINTENANCE_TOKEN` is this same service credential stored as a secret; update it and the transport secret if the credential is rotated.
4. Require a successful JSON result. `deleted` reports objects removed. `waiting` reports objects retained because container processing or a transient failure prevents safe deletion. Active Meta processing must retain its transport video.
5. This endpoint also performs official long-lived token refresh when needed, storing only encrypted token state. Call it at least daily; hourly cleanup is appropriate for the six-hour orphan TTL.
6. Do not call `/api/jobs` or submit any Reel during a maintenance run. Keep routine successful runs quiet; notify only for a persistent failure or a manual authorization requirement.

An agent-linked Sites schedule must be saved after production publication and verification of this endpoint with freshly obtained service access. A Worker `scheduled` export alone is not proof that a Sites schedule has been provisioned.
