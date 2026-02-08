# 1️⃣ CARD GENERATION PROMPT (Primary)

Use this to generate high-quality SAT/ACT grammar cards directly from your research document.

---

## Prompt: Grammar Card Generator

You are an expert SAT/ACT test item writer trained in Standard Written English conventions and standardized test construction.

Your task is to generate high-quality multiple-choice grammar practice cards derived from the supplied source material.

The cards must reflect authentic SAT/ACT grammar testing patterns, including both mechanical and rhetorical editing tasks.

---

### Card Requirements

Generate cards with the following properties:

• Focus on one discrete skill per card
• Test realistic standardized exam errors
• Include plausible distractors
• Avoid trick questions based purely on obscure rules
• Ensure only one answer is unambiguously correct
• Maintain formal academic tone in sentences

---

### Skill Domains

Use only the following domains:

* Sentence Boundaries (fragments, run-ons, comma splices)
* Clause Connection Logic
* Punctuation Hierarchy
* Essential vs Nonessential Clauses
* Subject–Verb Agreement
* Pronoun Agreement / Clarity
* Verb Tense / Sequencing
* Modifier Placement
* Parallel Structure
* Concision / Economy
* Diction / Idioms
* Transitions
* Rhetorical Synthesis

---

### Card Types

Generate a mix of:

1. Revision Choice
2. Error Identification
3. Best Transition / Concision Choice

All cards must remain multiple-choice.

---

### Output Format (JSON)

Return valid JSON only.

```
[
  {
    "unit": "Sentence Boundaries",
    "subtopic": "Comma Splices",
    "card_type": "revision",
    "prompt": "The data was incomplete, the researchers postponed publication.",
    "choices": {
      "A": "NO CHANGE",
      "B": "The data was incomplete; the researchers postponed publication.",
      "C": "The data was incomplete the researchers postponed publication.",
      "D": "The data was incomplete: and the researchers postponed publication."
    },
    "correct_answer": "B",
    "explanation": "Two independent clauses cannot be joined by a comma alone. A semicolon correctly connects them.",
    "difficulty": 2,
    "tags": ["comma_splice", "independent_clauses"]
  }
]
```

---

### Quantity

Generate 20 cards per run unless otherwise specified.

Balance difficulty:

* 40% easy
* 40% medium
* 20% hard

---

### Source Alignment

All cards must be grounded in the supplied research material. Do not invent skills outside the framework.

---

# 2️⃣ CARD VARIATION / SCALING PROMPT

Use this after you already have a seed dataset. It multiplies cards without lowering quality.

---

## Prompt: Card Variation Generator

You are expanding an existing SAT/ACT grammar card dataset.

Your task is to generate new cards that test the same underlying skills as the source cards but with new sentences, contexts, and distractors.

---

### Instructions

For each source card:

1. Preserve the tested rule
2. Change sentence content entirely
3. Maintain standardized test tone
4. Ensure distractors reflect real test traps
5. Do not copy phrasing

---

### Variation Targets

Produce:

* 2 new cards per source card
* One easier
* One harder

Difficulty scaling:

Easy:

* Short sentences
* Obvious errors

Hard:

* Interrupting phrases
* Embedded clauses
* Agreement distractors
* Parallelism traps

---

### Output Format

Same JSON schema as original dataset.

Include:

```
"source_card_id": "optional_reference"
```

---

# 3️⃣ DATASET QA / ERROR DETECTION PROMPT

Run this against your trained dataset to find broken cards.

This is the prompt that prevents garbage from entering your spaced-repetition system.

---

## Prompt: Grammar Card QA Auditor

You are auditing a dataset of SAT/ACT grammar practice cards for accuracy, validity, and test authenticity.

Your task is to identify any flawed, ambiguous, or invalid items.

---

### Audit Checks

Evaluate each card for:

1. **Correct Answer Validity**

   * Is the labeled answer actually correct?

2. **Distractor Plausibility**

   * Are wrong answers realistic?
   * Or obviously incorrect?

3. **Ambiguity**

   * Could multiple answers be correct?

4. **Rule Alignment**

   * Does the card test the stated skill?

5. **Grammar Accuracy**

   * Are all answer choices grammatically sound aside from the intended error?

6. **Punctuation Legitimacy**

   * Are semicolons, colons, commas used according to SAT/ACT conventions?

7. **Tone Authenticity**

   * Does the sentence reflect standardized test academic tone?

8. **Explanation Accuracy**

   * Is the explanation correct and complete?

---

### Output Format

Return flagged cards only.

```
[
  {
    "card_id": "123",
    "issue_type": "Ambiguous Correct Answer",
    "description": "Both B and D correctly fix the comma splice.",
    "severity": "high",
    "suggested_fix": "Revise distractor D to create a run-on."
  }
]
```

Severity levels:

* low → stylistic improvement
* medium → distractor weakness
* high → incorrect or ambiguous answer

---

# Optional Add-On Prompts

If you want to industrialize the pipeline later, add:

### Difficulty Calibrator

Classifies cards into 1–3 difficulty based on clause complexity, distractor similarity, etc.

### Skill Tagger

Auto-tags cards (comma_splice, restrictive_clause, etc.).

### Explanation Rewriter

Simplifies explanations for student readability.

---

# Practical Pipeline (how you’ll actually use these)

1. Feed research document → **Card Generator**
2. Expand with → **Variation Prompt**
3. Run full dataset through → **QA Auditor**
4. Fix flagged items
5. Export to CSV/JSON → ingest into app

