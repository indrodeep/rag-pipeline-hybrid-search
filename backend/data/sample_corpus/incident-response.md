# Incident Response Runbook

This runbook defines how Meridian classifies, manages, and learns from production incidents. It applies to every engineer on the on-call rotation.

## Severity Levels

| Severity | Definition | Examples | Response |
|----------|------------|----------|----------|
| SEV1 | Customer-facing outage or data loss in progress | API error rate > 25%, auth completely down, data corruption | Page immediately, incident commander required, exec notification within 30 minutes |
| SEV2 | Major degradation, workaround may exist | p99 latency 5x baseline, one region down, webhooks delayed > 1 hour | Page immediately, incident commander required |
| SEV3 | Minor degradation, limited blast radius | Single non-critical endpoint failing, elevated retries | Ticket + Slack, handle during business hours |
| SEV4 | Cosmetic or internal-only | Dashboard glitch, flaky internal tool | Backlog ticket |

When in doubt between two severities, pick the higher one. Severity can be downgraded later; an under-called incident cannot retroactively page the people it needed.

## Roles

Every SEV1 and SEV2 has exactly one **incident commander (IC)**. The IC does not debug — they coordinate, make the calls, and keep the timeline. The first responder becomes IC by default until they explicitly hand off in the incident channel with "IC handoff to @name, acknowledged."

The IC may designate a **comms lead** to own status-page updates. For SEV1s, the status page must be updated within 15 minutes of declaration and at least every 30 minutes thereafter.

## Declaring an Incident

Declare with the Slack command `/incident declare` — it creates the incident channel (`#inc-YYYYMMDD-<slug>`), pages the on-call via PagerDuty, and starts the timeline bot. Do not hand-build incident channels; the tooling depends on the naming convention.

On-call engineers must acknowledge a page within 5 minutes. An unacknowledged page escalates to the secondary on-call, then to the engineering manager after a further 5 minutes.

## During the Incident

- All decisions go in the incident channel, not DMs. The timeline bot only captures the channel.
- If the suspected cause is a recent deploy, roll back first and investigate second. The deployment guide documents `shipctl rollback`; ICs are authorized to deploy directly to production during a declared SEV1.
- Mitigation beats diagnosis. Restoring service is the priority; root cause comes later.
- If customer data may have been exposed, page the security on-call immediately — this is mandatory and not an IC judgment call.

## Resolution and Postmortems

An incident is resolved when the customer-facing impact has ended, not when the root cause is fixed. Mark resolution with `/incident resolve`.

Every SEV1 and SEV2 requires a written postmortem published within **5 business days** of resolution. Postmortems are blameless: they name systems and processes, never individuals. The template lives at `docs/postmortems/TEMPLATE.md` and requires:

- A timeline from first signal to resolution
- Customer impact quantified (requests failed, customers affected, duration)
- Root cause analysis using the "five whys" method
- Action items, each with an owner and a due date

Action items from SEV1 postmortems are tracked weekly in the engineering leads sync until closed. A SEV1 action item open longer than 30 days escalates to the VP of Engineering.

## On-Call Expectations

Rotations are weekly, Tuesday to Tuesday, with a primary and a secondary. You must be reachable within 5 minutes and have a laptop with VPN access. On-call engineers get a 20% reduction in sprint commitment for their on-call week and a comp day after any week with overnight pages on two or more nights.
