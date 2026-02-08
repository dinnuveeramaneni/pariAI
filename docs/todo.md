# TODO / Follow-up Issues

1. Add true undo/redo history for workspace actions (buttons are currently stubbed).
2. Add optimistic concurrency control for project saves (ETag/version precondition).
3. Persist panel/visualization edits to normalized `Panel`/`Visualization` tables in addition to versioned project JSON snapshots.
4. Add invitation email delivery (token is currently returned in API response for MVP testing).
5. Add key rotation UI flow with grace window and dual-key validity period.
6. Add dedicated audit log UI page with filter/search controls.
7. Harden Playwright suite with deterministic DB fixture reset between runs.
8. Replace in-memory rate limiter with Redis-backed distributed limiter.
