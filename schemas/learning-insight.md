# Learning insight contract

Version: `1.0`

Every `/learn` output is written to `.autoclaw/learnings/insight-<UTC>-<fingerprint-prefix>.md`. The filename and `content_fingerprint` make re-ingestion idempotent.

```yaml
---
schema_version: "1.0"
insight_id: learn-20260811T120000Z-a1b2c3d4
source: cursor
source_session_id: session-or-stable-source-id
source_path_hash: sha256-of-normalized-source-path
workspace: /absolute/workspace/path
observed_at: 2026-08-11T12:00:00Z
ingested_at: 2026-08-11T12:05:00Z
classification: unknown
classification_evidence:
  kind: none
  refs: []
confidence: inferred
content_fingerprint: sha256-of-normalized-insight-and-provenance
redactions: 0
---
```

## Required fields

- `schema_version`: exactly `"1.0"`.
- `insight_id`: stable identifier derived from ingestion time and fingerprint.
- `source`: one ID from `.agent/rules/intelligence/sources.yaml`.
- `source_session_id`: ID from the source, or a SHA-256-derived stable ID when the format has none.
- `source_path_hash`: hash only; never persist a third-party home-directory path in a learning artifact.
- `workspace`: repository root when verified, otherwise `null`.
- `classification`: `kept`, `discarded`, or `unknown`. The safe default is `classification: unknown`.
- `classification_evidence.kind`: `commit`, `working_tree`, `checkpoint`, `explicit_revert`, `manual`, or `none`.
- `classification_evidence.refs`: commit IDs, hashed paths, or source event IDs; never secret-bearing transcript text.
- `confidence`: `verified`, `inferred`, or `manual`.
- `content_fingerprint`: SHA-256 of normalized source, session ID, classification, and distilled learning.
- `redactions`: number of replacements made before persistence.

## Safety and idempotency

Redact credentials, authorization headers, private keys, cookies, tokens, email addresses, and obvious personal identifiers before generating the fingerprint or writing any artifact. Never copy raw tool output into the learning file. If the fingerprint already exists, update only the source watermark and report the item as deduplicated.

The per-source watermark lives at `.autoclaw/history/<source>.json` and contains the last accepted source modification time, stable session IDs, and fingerprints. Write it atomically only after all learning/KG outputs succeed.
