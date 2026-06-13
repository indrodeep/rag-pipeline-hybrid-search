# Engineering Onboarding Guide

Welcome to Meridian. This guide covers your first four weeks. Your onboarding buddy — assigned before your start date and listed in your welcome email — is your first stop for anything unclear.

## Before Day One

IT ships your laptop to arrive at least 2 business days before your start date. The laptop arrives pre-enrolled in device management; do not wipe or re-image it. If it hasn't arrived 2 days out, email it-help@meridian.dev with your offer letter attached.

## Week 1 — Access and Environment

Your manager files the access bundle request before you start, but verify on day one that you have:

- **Okta** — single sign-on for everything. All access requests flow through the Okta access catalog; there is no other approved path. Requests above "standard engineer" level need manager approval and take up to 1 business day.
- **GitHub** (org: meridian-systems) via Okta SSO. Your first PR is usually a `docs/team/` page about yourself — it exercises the full PR → review → merge path with zero production risk.
- **PagerDuty** — you'll be added as an observer to your team's rotation in week 1, but you will not take primary on-call before week 8.
- **Vault and Consul** read access for your team's namespaces.

Run the workstation bootstrap with:

```
curl -fsSL https://get.meridian.dev/bootstrap | bash
```

The bootstrap installs the toolchain (`shipctl`, `meridian` CLI, language runtimes pinned by `asdf`) and configures VPN profiles. It is idempotent — re-run it whenever something feels broken before filing a ticket.

## Week 2 — First Real Change

Pick a starter ticket labeled `good-first-issue` from your team's board. The goal is to ship a small production change end to end in week 2: branch, PR, review, merge, watch it ride the release train, verify it on the dashboard. Your buddy pairs with you on the first deploy.

Read the engineering handbook before your first review — reviewers will assume you know the conventional comment prefixes and the 24-hour review SLA.

## Weeks 3-4 — Depth

- Shadow one full on-call shift with your team's primary (you observe pages, you don't act on them).
- Complete the security training in Workday; it is due within 30 days of your start date and access to production namespaces is automatically revoked if it's overdue.
- Do the incident response tabletop exercise with your cohort — scheduled monthly, your manager books you in.
- Present a 15-minute "what I learned breaking things" at your team's retro at the end of week 4. Informal, no slides required.

## The Buddy System

Buddies are volunteers from a different team than yours — by design, so you build a cross-team network from day one. Buddy duties: a 30-minute sync twice a week for the first month, first review on your starter PR, and being the person you ask the questions you think are too small for your manager. There are no too-small questions.

## Useful Defaults

- Meetings are documented or they didn't happen; notes go in the team's Notion space.
- Slack response expectation is same business day, not minutes. Block focus time aggressively.
- Demos beat decks. The fortnightly all-hands demo slot is open sign-up; shipping something in your first month and demoing it is the strongest possible start.

If anything in this guide is wrong or out of date, your final onboarding task is a PR to fix it.
