# Meridian Platform API — Authentication & Rate Limits

This document covers authentication for the Meridian Platform public API (api.meridian.dev). It applies to all v2 endpoints. Legacy v1 endpoints were decommissioned on 2025-03-31 and return `410 Gone`.

## API Key Authentication

Server-to-server integrations authenticate with an API key passed in the `X-Meridian-Key` request header. Keys are issued per project from the developer console under **Settings → API Keys**. Each project may hold at most 10 active keys.

```
curl https://api.meridian.dev/v2/workspaces \
  -H "X-Meridian-Key: mk_live_4f8a2c91"
```

Key prefixes encode the environment: `mk_live_` keys hit production data, `mk_test_` keys are sandboxed and never touch billable resources. A request authenticated with a `mk_test_` key against a production-only endpoint returns `403` with error code `env_mismatch`.

### Key rotation

Keys must be rotated every 90 days. Rotation is zero-downtime: calling `meridian keys rotate <key-id>` from the CLI creates a successor key and places the old key in a 72-hour grace period during which both keys validate. After the grace period the old key returns `401` with error code `key_expired`. The `rotate_key()` helper in the official SDKs wraps this flow and updates the local credential cache automatically.

Compromised keys should be revoked immediately with `meridian keys revoke <key-id> --now`, which skips the grace period.

## OAuth 2.0 for User-Facing Apps

Applications acting on behalf of end users must use the OAuth 2.0 authorization-code flow with PKCE. The token endpoint is `https://auth.meridian.dev/oauth/token`. Access tokens are JWTs valid for 60 minutes; refresh tokens are valid for 30 days and are single-use — each refresh issues a new refresh token (rotation detection revokes the whole grant if a refresh token is replayed).

Scopes are colon-delimited and hierarchical. The most commonly used scopes:

- `workspace:read` — list and read workspaces and their members
- `workspace:write` — create or modify workspaces
- `pipeline:execute` — trigger pipeline runs
- `admin:billing` — read invoices and update payment methods (requires org-owner approval)

Requesting `admin:billing` triggers a manual review step; expect up to 2 business days before the scope is granted.

## Rate Limits

Rate limits are enforced per key, per minute, using a sliding window:

| Plan | Requests/min | Burst |
|------|--------------|-------|
| Free | 60 | 90 |
| Team | 600 | 900 |
| Enterprise | 1200 | 1800 |

When a limit is exceeded the API returns `429 Too Many Requests` with a `Retry-After` header indicating the number of seconds to wait. Every response includes `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers so clients can throttle proactively. The official SDKs implement exponential backoff with full jitter by default; if you write a custom client, you must honor `Retry-After` — repeated violations trip an abuse circuit breaker that suspends the key for 15 minutes.

Webhook deliveries from Meridian to your endpoints are not rate limited, but your endpoint must respond within 10 seconds or the delivery is retried up to 5 times with exponential backoff.

## IP Allowlisting

Enterprise projects can restrict API key usage to an IP allowlist (CIDR notation, up to 50 entries). Requests from outside the allowlist return `403` with error code `ip_not_allowed`. Allowlist changes propagate within 60 seconds. We recommend combining allowlisting with key rotation rather than treating it as a substitute.

## Common Errors

| Status | Code | Meaning |
|--------|------|---------|
| 401 | `key_expired` | Key past rotation grace period |
| 401 | `key_revoked` | Key explicitly revoked |
| 403 | `env_mismatch` | Test key used against production endpoint |
| 403 | `ip_not_allowed` | Caller IP outside the allowlist |
| 429 | `rate_limited` | Sliding-window limit exceeded |

Authentication failures are logged to the project audit log and retained per the data retention policy.
