# SAT/ACT Content Blueprint (Derived from `resources/satact-grammar-sections.md`)

This blueprint translates the research memo into production content targets for card generation and QA.

## 1) Core Tested Competency Families

Use these as the canonical skill families for content planning:

- Sentence boundaries and clause connection logic
- Punctuation hierarchy (comma, semicolon, colon, dash, apostrophe)
- Essential vs nonessential elements
- Agreement and consistency (subject-verb, pronoun, tense)
- Modifier placement
- Parallel structure
- Concision and economy
- Diction and idioms
- Transitions and rhetorical logic
- Rhetorical synthesis / organization decisions

## 2) Unit-to-Skill Mapping

This mapping should drive `unit` and `subtopic` values in cards.

### Unit 1: Sentence Boundaries
- Fragment identification/correction
- Run-ons and fused sentences
- Comma splices
- Valid clause joining (period, semicolon, comma+FANBOYS, subordination)
- Subordinator logic (`because`, `although`, `since`, `while`)

### Unit 2: Punctuation Hierarchy
- Restrictive vs nonrestrictive punctuation
- Appositives and name/title punctuation
- Comma roles (lists, clause joining)
- Semicolon usage (clause join, complex list separator)
- Colon usage (complete clause before colon)
- Dash pairing/consistency
- Apostrophe possession/contraction distinctions

### Unit 3: Agreement & Consistency
- Subject-verb agreement with distractors
- Collective nouns and indefinite pronouns
- Pronoun-antecedent number/clarity
- Pronoun case and reference clarity
- Verb tense consistency
- Past perfect sequencing

### Unit 4: Modifiers
- Dangling modifiers
- Misplaced modifiers
- Introductory phrase attachment checks

### Unit 5: Parallelism
- List/form parallelism
- Correlative conjunction structure
- Comparison symmetry

### Unit 6: Transitions & Rhetoric
- Transition logic families (addition, contrast, causation, example)
- Rhetorical synthesis goal matching
- ACT-style organization/unity choices

### Unit 7: Concision / Economy
- Redundancy elimination
- Wordiness reduction without meaning loss
- Shortest-correct-option discipline

### Unit 8: Diction & Idioms
- Idiomatic preposition pairs
- Commonly confused word pairs
- Register/tone appropriateness

## 3) Card-Type Coverage Targets

Apply across each unit:

- `revision`: 50%
- `error_id`: 30%
- `best_choice`: 20%

Difficulty distribution target:

- Easy (`1`): 40%
- Medium (`2`): 40%
- Hard (`3`): 20%

## 4) SAT/ACT Coverage Tagging

For each card, set explicit exam targeting:

- `SAT` only if skill is primarily Digital SAT-specific framing (for example rhetorical synthesis bullets).
- `ACT` only if skill is primarily passage organization/local editing framing.
- `SAT` + `ACT` for shared grammar competencies.

## 5) QA Gates Before Import

In addition to baseline card QA:

- Every unit must contain all planned subtopics listed above.
- No subtopic should be represented by fewer than 8 cards in the seed set.
- At least 70% of cards should be dual-target (`SAT` + `ACT`) unless intentionally exam-specific.
- High-severity QA issues must be zero before import.

