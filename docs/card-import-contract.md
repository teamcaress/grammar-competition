# Card Import Contract (MVP)

This is the canonical import contract for grammar cards.

## Canonical Format

- Preferred ingest format: JSON array of card objects.
- JSON schema source: `content/schemas/grammar-card.schema.json`.
- CSV is supported only as a transport format and must map to the same normalized fields before import.

## Required Fields

- `unit`: string
- `subtopic`: string
- `card_type`: one of `revision`, `error_id`, `best_choice`
- `prompt`: string
- `choices`: object with keys `A`, `B`, `C`, `D` (all non-empty strings)
- `correct_answer`: one of `A`, `B`, `C`, `D`
- `explanation`: string
- `difficulty`: integer in `[1, 2, 3]`
- `tags`: array of non-empty strings

## Optional Fields

- `source_card_id`: string (used for variation lineage)
- `exam_targets`: array containing one or both of `SAT`, `ACT`
- `source_section`: string reference to section header from research notes
- `skill_code`: normalized internal code (example: `boundary_comma_splice`)

## CSV Mapping

CSV columns must map into normalized JSON:

- `unit` -> `unit`
- `subtopic` -> `subtopic`
- `card_type` -> `card_type`
- `prompt` -> `prompt`
- `choice_a` -> `choices.A`
- `choice_b` -> `choices.B`
- `choice_c` -> `choices.C`
- `choice_d` -> `choices.D`
- `correct` -> `correct_answer`
- `explanation` -> `explanation`
- `difficulty` -> `difficulty`
- `tags` -> `tags` (pipe-delimited, example: `comma_splice|independent_clause`)
- `source_card_id` -> `source_card_id` (optional)
- `exam_targets` -> `exam_targets` (pipe-delimited: `SAT|ACT`)
- `source_section` -> `source_section` (optional)
- `skill_code` -> `skill_code` (optional)

## Validation Rules

- Exactly one correct answer key.
- `correct_answer` must reference an existing choice.
- Choice texts must be distinct after trimming.
- `difficulty` uses 1 (easy), 2 (medium), 3 (hard).
- `tags` must contain at least one tag.
- If present, `exam_targets` must be a non-empty subset of `SAT`, `ACT`.
- If present, `skill_code` should be snake_case.

## CLI Validation

Run:

```bash
npm run validate:cards -- datasets/cards.sample.json
```

The validator fails with line-item errors and non-zero exit code when invalid data is present.
