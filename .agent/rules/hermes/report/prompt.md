# ReportHermes prompt

Period: {{period}}
As of: {{as_of}}
Prior approved report: {{prior_report_path_or_none}}
Diff mode: {{diff_mode}}
Tone: {{formality}} / {{voice}} / {{verbosity}} / {{audience}}
Sources: {{source_refs}}

Produce an evidence-backed executive report. Separate verified outcomes, pending work, metrics, risks, decisions, and next actions. Label only supported changes as `[NEW]`, `[CHANGED]`, or `[REMOVED]`; “removed” means absent from current evidence. Use `Not evidenced` rather than estimating. Return approval-gated Markdown only.
