# Deployment Guide — shipctl and the Release Train

All Meridian services deploy through `shipctl`, our internal wrapper around the Argo-based delivery platform. This guide covers the standard path from merged PR to production, plus canary analysis, rollbacks, and freeze windows.

## Environments

There are three long-lived environments:

- **dev** — auto-deploys every merge to `main` within ~5 minutes. No approval required. Data is synthetic and reset nightly at 02:00 UTC.
- **staging** — deploys on demand via `shipctl deploy staging`. Mirrors production topology at 25% scale. Shares no data with production.
- **production** — deploys only through the release train (below). Direct `shipctl deploy production` is blocked for everyone except incident commanders during a declared SEV1.

## The Release Train

Production releases leave twice a day, at 10:00 and 16:00 UTC, Monday through Thursday. There is no Friday release train. To board the train, your change must:

1. Be merged to `main` with a green CI run (unit, integration, and lint gates).
2. Have soaked in staging for at least 60 minutes with no new error-budget burn.
3. Carry a `release-note` label on the PR (the train bot refuses unlabeled changes).

The train bot posts the manifest to `#release-train` 30 minutes before departure. Any engineer can hold the train with `shipctl train hold --reason "<text>"`; holds expire after 2 hours unless renewed.

## Canary Analysis

Every production deploy starts as a canary at 5% of traffic for 20 minutes. The canary controller compares the canary cohort against baseline on four signals: error rate, p99 latency, CPU saturation, and a service-specific custom metric if one is registered in `canary.yaml`. A regression beyond 2 standard deviations on any signal triggers automatic abort and rollback — no human in the loop.

If the canary passes, traffic ramps 5% → 25% → 50% → 100%, with 10-minute bake time at each step. The full ramp takes roughly an hour.

## Rollbacks

To roll back, run:

```
shipctl rollback <service> --to <release-id>
```

Release IDs are listed by `shipctl releases <service> --limit 10`. Rollbacks bypass canary analysis and take effect in under 3 minutes. A rollback automatically pins the service, which blocks the next two release trains for that service until an engineer runs `shipctl unpin <service>` — this prevents the bad change from riding the next train by accident.

Database migrations are **not** rolled back automatically. If your change included a migration, follow the expand-contract pattern: rollbacks are only safe while the contract step has not run. The migration runbook in the engineering handbook covers this in detail.

## Freeze Windows

Deploy freezes are declared in `#release-train` and enforced by the train bot. Standing freezes:

- The last two business days of each fiscal quarter (billing close).
- November 24 through November 30 (peak traffic week).
- Any time a SEV1 or SEV2 incident is open for the service in question.

During a freeze, only changes labeled `freeze-exception` and approved by a director can deploy.

## Secrets and Configuration

Runtime configuration lives in Consul; secrets live in Vault under `secret/<service>/<env>`. Config changes deploy independently of code through `shipctl config push`, which validates against the service's config schema before applying. A config push that fails validation reports error code `config_schema_violation` and changes nothing.

Never bake secrets into images. CI scans every image layer with `trufflehog` and fails the build on a finding — the failure cannot be overridden, and the build log will show `secret_scan_failed`.
