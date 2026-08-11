> ReportHermes — evidence-backed executive change reports. Trigger on "/hermes report", "ReportHermes".

# ReportHermes

## Command

`/hermes report <source> [<source> ...] [--period weekly|monthly|ad-hoc] [--title "..."] [--as-of YYYY-MM-DD]`

Sources may be workspace Markdown/JSON/YAML, `research:<YYYY-MM-DD>/<slug>`, or `status:<path>`. Resolve every source and record its stable reference. Reject missing or malformed inputs; do not generate a partial report unless `--allow-partial` is explicit, in which case list every omitted source in the draft.

Read [`tone.yaml`](./tone.yaml) and [`prompt.md`](./prompt.md). Default period is `weekly` and `as_of` is the current workspace-local date.

## Baseline selection

Find the **last approved report** before `as_of`, newest first:

1. `.autoclaw/hermes/approved/*.md` with `profile: report` and `approved: true`.
2. `site/_posts/*.md` with `categories` containing `report`.

Never baseline against `pending/`. If no approved/published report exists, set `baseline: true`, `prior_report_id: null`, and `diff_mode: none`; do not emit `[REMOVED]` on a baseline run.

## Semantic change analysis

1. Normalize evidence into atomic bullets while preserving metric units, dates, owners, and source references.
2. Match the current bullet to the prior report by stable metric/decision key first.
3. For unmatched bullets, use the configured embedding provider and `report_similarity_threshold` (default `0.84`). Record `diff_mode: semantic`.
4. If embeddings are unavailable, use normalized token/Jaccard comparison at the same threshold and record `diff_mode: lexical`.
5. Label changes:
   - `[NEW]`: current evidence has no prior match.
   - `[CHANGED]`: matched subject with a materially changed value, state, owner, date, or conclusion.
   - `[REMOVED]`: a prior bullet has no current evidence; phrase as “not present in current evidence,” not as proof the underlying fact ceased to exist.
6. Unchanged facts may support the summary but do not need a change label.

Never invent metrics, trends, owners, deadlines, causes, or confidence. If evidence is missing, write `Not evidenced` and cite the missing source category.

## Required report structure

1. Executive summary — at most five bullets.
2. Outcomes and verified progress.
3. Changes since prior report (`[NEW]`/`[CHANGED]`/`[REMOVED]`).
4. Risks and findings, with severity and evidence.
5. Metrics table with value, prior value, direction, and source; omit unsupported values.
6. Decisions required.
7. Next actions with owner only when evidenced.
8. Evidence appendix listing source references and diff mode.

## Output

Write `.autoclaw/hermes/pending/<YYYY-MM-DD>-report-<slug>.md` using the [ReportHermes contract](../../../../schemas/hermes-thread-report.md):

```yaml
---
schema_version: "1.0"
id: 2026-08-11-report-agent-control-plane-weekly
profile: report
title: "Agent control plane weekly report"
date: 2026-08-11
slug: agent-control-plane-weekly
tags: [report, agents]
period: weekly
as_of: 2026-08-11
source_refs: [memory/STATUS.md]
prior_report_id: null
baseline: true
diff_mode: none
approved: false
---
```

Do not approve, publish, or write to `site/`. Confirm the output path, source count, prior report ID/baseline, diff mode, and counts by change label.

## Idempotency

Fingerprint normalized source hashes, `as_of`, period, and prior report ID. An identical target is unchanged. A differing existing target requires `--replace`.
