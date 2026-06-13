# Data Retention & Deletion Policy

This policy defines how long Meridian retains each class of data and how deletion requests are handled. It is binding for all production systems. The policy owner is the Data Protection Officer (dpo@meridian.dev); exceptions require their written approval.

## Retention Schedule

| Data class | Retention period | Storage system | Notes |
|------------|------------------|----------------|-------|
| Application logs | 90 days | Loki | Includes structured request logs with `trace_id` |
| Audit logs | 7 years | Immutable S3 bucket | Auth events, admin actions, key usage; legal requirement |
| Product analytics events | 13 months | ClickHouse | Pseudonymized after 90 days |
| Database backups | 35 days | Encrypted S3, cross-region | Point-in-time recovery window is 7 days |
| Customer file uploads | Life of account + 30 days | Object storage | Deleted 30 days after account closure |
| Support ticket transcripts | 3 years | Zendesk | |
| CI build artifacts | 30 days | Artifactory | Release-tagged artifacts kept 18 months |
| Incident channel history | Indefinite | Slack export to S3 | Feeds postmortem reviews |

Where two retention rules could apply to the same record, the shorter period wins unless the longer one is a legal requirement.

## Personal Data and GDPR/CCPA Deletion

Verified deletion requests (GDPR Art. 17 / CCPA) must be completed within **30 calendar days** of verification. The deletion pipeline is orchestrated by the `erasure-runner` service, which fans the request out to every system of record and collects cryptographic proof of deletion from each.

Two classes of data are exempt from erasure and are instead pseudonymized:

1. Audit logs (legal retention obligation — the 7-year rule above).
2. Financial transaction records required for tax compliance (retained 7 years).

Backups are not rewritten on deletion. Instead, deleted records carry a tombstone, and the restore procedure replays tombstones after any restore — meaning a restore can never resurrect erased personal data. Because backups expire after 35 days, erased data ages out of backup media entirely within that window.

## Data Classification

All data is classified at one of four levels, tagged at the schema level in the data catalog:

- **L0 Public** — published docs, marketing content
- **L1 Internal** — most operational data, internal docs
- **L2 Confidential** — customer content, support transcripts
- **L3 Restricted** — credentials, payment data, personal data under privacy law

L3 data may not leave production systems: no copies to laptops, no exports to spreadsheets, no use in staging or dev environments. Synthetic data generators exist for every L3 schema; use them. CI blocks any fixture file that matches L3 detection patterns with error code `l3_fixture_violation`.

## Anonymization Standards

Pseudonymization replaces direct identifiers with rotating tokens keyed per quarter; re-identification keys are held by the data platform team and require dual control to access. Aggregates published outside the company must satisfy k-anonymity with k ≥ 20.

## Enforcement and Audits

Retention rules are enforced by TTL policies in each storage system, reconciled nightly by the `retention-auditor` job, which files a P2 ticket for any drift. The DPO runs a full retention audit twice a year; findings are tracked like SEV2 postmortem action items, with owners and due dates.
