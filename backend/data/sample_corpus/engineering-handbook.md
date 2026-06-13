# Engineering Handbook — How We Build

This handbook captures the engineering practices every Meridian engineer is expected to follow. It is descriptive of how we actually work; if reality and the handbook diverge, fix one of them.

## Source Control and Branching

We practice trunk-based development. There is one long-lived branch, `main`, and it must always be releasable. Feature branches live at most 3 days before merging; anything larger gets decomposed behind a feature flag. Flags are managed in LaunchDarkly and must carry an expiry date — the flag janitor bot opens a cleanup PR when a flag is 30 days past expiry.

Commits to `main` happen only through pull requests. Force-pushes to `main` are blocked at the platform level, no exceptions.

## Code Review

Every PR needs exactly one approving review from a code owner of the touched paths. Review SLAs:

- First response within **24 hours** (business days). If you can't review in time, say so and suggest someone else.
- PRs under 200 changed lines get same-day response in practice; keep PRs small.

Reviewers approve when the change is a net improvement, not when it is perfect. Blocking comments must be actionable; style nits that a formatter could catch belong in the formatter config, not the review. We use conventional comments prefixes: `blocking:`, `suggestion:`, `nit:`, `question:`.

Self-merge after approval is the author's responsibility — reviewers approve, authors merge. A PR with unresolved `blocking:` comments cannot merge; the merge queue enforces this.

## Testing

CI runs three gates on every PR: unit tests, integration tests, and lint. The coverage gate fails any PR that drops a package below **80% line coverage**. New packages start at the gate; legacy packages below the bar are listed in `coverage-debt.yaml` with a ratchet that only moves up.

Integration tests run against ephemeral environments provisioned per-PR by the CI system; they are torn down automatically after 4 hours. Flaky tests are quarantined by the flake bot after 3 inconsistent runs in 7 days, and a quarantined test that stays quarantined for 14 days is deleted along with a ticket to its owning team.

## Database Migrations

All schema changes follow the expand-contract pattern:

1. **Expand**: add the new column/table/index. Deploy. Old code ignores it.
2. **Migrate**: dual-write or backfill. Verify parity with the `migration-diff` tool.
3. **Contract**: remove the old path. Deploy. This step is the point of no return for rollbacks.

The contract step requires a `migration-review` label and sign-off from the data platform team. Backfills touching more than 10 million rows must run through the batch runner with a rate limit, never as a raw `UPDATE`.

## Observability

Every service exposes the standard golden-signal dashboard (traffic, errors, latency, saturation) generated from `service.yaml`. Custom metrics use the `meridian_` prefix in Prometheus. Alerts page only on symptoms customers can feel; cause-based alerts go to Slack, not PagerDuty. Every alert must link to a runbook — the alert linter blocks alerts without a `runbook_url` annotation.

Structured logs are JSON, one event per line, with `trace_id` propagated from the edge. Log levels: `ERROR` means a human should look, `WARN` means degraded but self-healing, `INFO` is the audit trail. `DEBUG` is never enabled in production for more than 4 hours, enforced by a TTL.

## Dependencies and Security

Third-party dependencies are pulled only from the internal Artifactory mirror; direct registry access is blocked from CI. Renovate opens upgrade PRs weekly. A dependency with a critical CVE triggers an automated PR with a 48-hour merge SLA — after 48 hours the security team is authorized to merge it on the owning team's behalf.

Production access goes through `meridian-sso` with hardware-key MFA. Break-glass access requires a declared incident and is audited; sessions are recorded and expire after 4 hours.
