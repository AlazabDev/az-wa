# Targeted Security Fixes

- [x] Protect selected message, worker, media, and staff operations with trusted internal credentials or scoped user permissions.
- [x] Validate selected webhook signatures and outbound destinations; remove selected personal-data logs and sanitize contact search.
- [x] Add regression checks, run relevant tests and build checks, then update only the requested security findings.

# Runtime Recovery

- [x] Redirect missing Supabase sessions to sign-in while preserving retry behavior for service failures.
- [x] Recheck protected routing on sign-in, sign-out, and user updates; preserve sessions when post-login verification is temporarily unavailable.
- [x] Verify the unauthenticated route flow and run the relevant checks.