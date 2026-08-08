# Hermes research contracts

Schemas for Phase 1 ResearchHermes runtime artifacts (authoritative docs; live data under gitignored `.autoclaw/hermes/`).

## sources.json

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["urls"],
  "properties": {
    "urls": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["first_seen_date", "last_cited_date", "topic_slugs"],
        "properties": {
          "first_seen_date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "last_cited_date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "topic_slugs": {
            "type": "array",
            "items": { "type": "string", "minLength": 1 }
          }
        }
      }
    }
  }
}
```

## Memo frontmatter

| Field | Type | Notes |
|---|---|---|
| `profile` | string | always `research` |
| `date` | date | memo day |
| `slug` | string | kebab topic id |
| `title` | string | human title |
| `baseline` | bool | true if no prior memo to diff |
| `diff_mode` | `semantic` \| `lexical` | lexical when embeddings unavailable |
| `prior_date` | date \| null | comparison day |
| `sources` | string[] | normalized URLs cited |

## Config defaults (`.autoclaw/hermes/config.yaml`)

```yaml
primary_platform: x
similarity_threshold: 0.85
bullet_similarity_threshold: 0.82
research:
  default_topics: []
```
