import fs from "node:fs";
import path from "node:path";

const CARD_TYPES = new Set(["revision", "error_id", "best_choice"]);
const ANSWERS = new Set(["A", "B", "C", "D"]);
const EXAM_TARGETS = new Set(["SAT", "ACT"]);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCard(card, index) {
  const errors = [];
  const prefix = `card[${index}]`;

  const required = [
    "unit",
    "subtopic",
    "card_type",
    "prompt",
    "choices",
    "correct_answer",
    "explanation",
    "difficulty",
    "tags"
  ];

  for (const key of required) {
    if (!(key in card)) {
      errors.push(`${prefix}: missing required field "${key}"`);
    }
  }

  if (!isNonEmptyString(card.unit)) errors.push(`${prefix}.unit must be a non-empty string`);
  if (!isNonEmptyString(card.subtopic)) errors.push(`${prefix}.subtopic must be a non-empty string`);
  if (!isNonEmptyString(card.prompt)) errors.push(`${prefix}.prompt must be a non-empty string`);
  if (!isNonEmptyString(card.explanation)) {
    errors.push(`${prefix}.explanation must be a non-empty string`);
  }

  if (!CARD_TYPES.has(card.card_type)) {
    errors.push(`${prefix}.card_type must be one of: revision, error_id, best_choice`);
  }

  if (!ANSWERS.has(card.correct_answer)) {
    errors.push(`${prefix}.correct_answer must be one of: A, B, C, D`);
  }

  if (!Number.isInteger(card.difficulty) || card.difficulty < 1 || card.difficulty > 3) {
    errors.push(`${prefix}.difficulty must be an integer between 1 and 3`);
  }

  if (!Array.isArray(card.tags) || card.tags.length === 0) {
    errors.push(`${prefix}.tags must be a non-empty array`);
  } else {
    card.tags.forEach((tag, tagIndex) => {
      if (!isNonEmptyString(tag)) {
        errors.push(`${prefix}.tags[${tagIndex}] must be a non-empty string`);
      }
    });
  }

  if (typeof card.choices !== "object" || card.choices === null || Array.isArray(card.choices)) {
    errors.push(`${prefix}.choices must be an object with A/B/C/D keys`);
  } else {
    const keys = ["A", "B", "C", "D"];
    for (const key of keys) {
      if (!isNonEmptyString(card.choices[key])) {
        errors.push(`${prefix}.choices.${key} must be a non-empty string`);
      }
    }

    const normalized = keys.map((key) =>
      typeof card.choices[key] === "string" ? card.choices[key].trim() : ""
    );
    const uniqueChoiceCount = new Set(normalized).size;
    if (normalized.includes("")) {
      // already reported by specific choice errors
    } else if (uniqueChoiceCount !== normalized.length) {
      errors.push(`${prefix}.choices must contain four distinct option texts`);
    }
  }

  if (isNonEmptyString(card.correct_answer) && card.choices && !card.choices[card.correct_answer]) {
    errors.push(`${prefix}.correct_answer does not reference an existing choice`);
  }

  if ("source_card_id" in card && !isNonEmptyString(card.source_card_id)) {
    errors.push(`${prefix}.source_card_id must be a non-empty string when present`);
  }

  if ("source_section" in card && !isNonEmptyString(card.source_section)) {
    errors.push(`${prefix}.source_section must be a non-empty string when present`);
  }

  if ("skill_code" in card) {
    if (!isNonEmptyString(card.skill_code)) {
      errors.push(`${prefix}.skill_code must be a non-empty string when present`);
    } else if (!/^[a-z0-9_]+$/.test(card.skill_code)) {
      errors.push(`${prefix}.skill_code must use snake_case`);
    }
  }

  if ("exam_targets" in card) {
    if (!Array.isArray(card.exam_targets) || card.exam_targets.length === 0) {
      errors.push(`${prefix}.exam_targets must be a non-empty array when present`);
    } else {
      const uniqueTargets = new Set(card.exam_targets);
      if (uniqueTargets.size !== card.exam_targets.length) {
        errors.push(`${prefix}.exam_targets cannot contain duplicate values`);
      }
      card.exam_targets.forEach((target, targetIndex) => {
        if (typeof target !== "string" || !EXAM_TARGETS.has(target)) {
          errors.push(`${prefix}.exam_targets[${targetIndex}] must be SAT or ACT`);
        }
      });
    }
  }

  const allowedFields = new Set([
    "unit",
    "subtopic",
    "card_type",
    "prompt",
    "choices",
    "correct_answer",
    "explanation",
    "difficulty",
    "tags",
    "source_card_id",
    "exam_targets",
    "source_section",
    "skill_code"
  ]);

  for (const key of Object.keys(card)) {
    if (!allowedFields.has(key)) {
      errors.push(`${prefix}: unexpected field "${key}"`);
    }
  }

  return errors;
}

function main() {
  const inputPath = process.argv[2] ?? "datasets/cards.sample.json";
  const absolutePath = path.resolve(inputPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  let payload;
  try {
    payload = readJson(absolutePath);
  } catch (error) {
    console.error(`Could not parse JSON from ${absolutePath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!Array.isArray(payload)) {
    console.error("Top-level payload must be a JSON array of cards.");
    process.exit(1);
  }

  const allErrors = [];
  payload.forEach((card, index) => {
    if (typeof card !== "object" || card === null || Array.isArray(card)) {
      allErrors.push(`card[${index}] must be an object`);
      return;
    }
    allErrors.push(...validateCard(card, index));
  });

  if (allErrors.length > 0) {
    console.error(`Validation failed: ${allErrors.length} error(s) found.`);
    for (const error of allErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validation passed: ${payload.length} card(s) in ${absolutePath}`);
}

main();
