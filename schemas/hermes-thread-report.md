# ThreadHermes and ReportHermes pending contracts

Version: `1.0`

Both profiles write only to `.autoclaw/hermes/pending/` with `approved: false`, then reuse `/hermes preview`, `/hermes approve`, and `/hermes publish`.

## Thread draft

```yaml
---
schema_version: "1.0"
id: 2026-08-11-thread-example-x
profile: thread
title: "Example thread"
date: 2026-08-11
slug: example-x
tags: [example]
platform: x
thread_style: numbered
max_chars: 280
source_refs: [path-or-stable-source-id]
approved: false
---
```

Required invariants:

- `platform`, `thread_style`, and `max_chars` exactly match the selected entry in `thread/platforms.yaml`.
- `source_refs` is non-empty.
- Numbered post text includes its `N/total` marker and remains within `max_chars` by Unicode grapheme count.
- `approved` is `false` at generation.

## Report draft

```yaml
---
schema_version: "1.0"
id: 2026-08-11-report-example-weekly
profile: report
title: "Example weekly report"
date: 2026-08-11
slug: example-weekly
tags: [report]
period: weekly
as_of: 2026-08-11
source_refs: [path-or-stable-source-id]
prior_report_id: null
baseline: true
diff_mode: none
approved: false
---
```

Required invariants:

- `period` is `weekly`, `monthly`, or `ad-hoc`.
- `source_refs` is non-empty and every reference was read successfully unless the body declares an explicit partial run.
- `diff_mode` is `none`, `semantic`, or `lexical`.
- `baseline: true` requires `prior_report_id: null` and `diff_mode: none`.
- A non-baseline report requires a prior approved/published report and `diff_mode` other than `none`.
- `approved` is `false` at generation.
