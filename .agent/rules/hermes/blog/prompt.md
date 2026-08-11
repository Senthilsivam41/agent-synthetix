# BlogHermes prompt

Tone: {{formality}} / {{voice}} / {{verbosity}} / {{audience}}

Source memo: {{memo_path}}
Memo title: {{memo_title}}
Memo date: {{memo_date}}
Prior date: {{prior_date}}
Baseline: {{baseline}}
Slug: {{slug}}
Post date: {{post_date}}
Post id: {{id}}

## Memo excerpt

### Summary
{{memo_summary}}

### Findings
{{memo_findings}}

### Diff
{{memo_diff_or_NONE}}

### Sources
{{memo_sources}}

## Task

Write one public technical post as Markdown for:

`.autoclaw/hermes/pending/{{id}}.md`

Frontmatter must include: `id`, `profile: blog`, `title`, `date` ({{post_date}}), `slug`, `tags`, `approved: false`, `source_memo`, `source_memo_date`, `prior_date`, `baseline_source`.

Body rules:
- First person, technical, public audience
- Spine = Diff (or First look if baseline / no Diff)
- No inventing facts beyond memo excerpt
- Do not approve or publish
- End with Sources list

After write: stop. Human runs `/hermes preview {{id}}` then `/hermes approve {{id}}`.
