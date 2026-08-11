---
schema_version: "1.0"
id: 2026-08-11-report-control-plane-baseline
profile: report
title: "Control-plane baseline report"
date: 2026-08-11
slug: control-plane-baseline
tags: [report, agents]
period: weekly
as_of: 2026-08-11
source_refs: [example:status]
prior_report_id: null
baseline: true
diff_mode: none
approved: false
---

## Executive summary

- [NEW] A versioned local control-plane contract is evidenced by the example source.

## Outcomes and verified progress

- Contract fixture created for ReportHermes validation.

## Changes since prior report

- Baseline run; no prior approved report was available.

## Risks and findings

- Production behavior: Not evidenced.

## Metrics

| Metric | Value | Prior | Direction | Source |
|---|---:|---:|---|---|
| Contract fixtures | 1 | Not evidenced | Baseline | `example:status` |

## Decisions required

- None evidenced.

## Next actions

- Validate the fixture against the committed contract.

## Evidence appendix

- `example:status`
- Diff mode: `none`
