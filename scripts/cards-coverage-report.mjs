import fs from "node:fs";
import path from "node:path";

function countBy(cards, keyFn) {
  const counts = new Map();
  for (const card of cards) {
    const key = keyFn(card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function printMap(title, map) {
  console.log(`\n${title}`);
  for (const [key, value] of [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    console.log(`- ${key}: ${value}`);
  }
}

function main() {
  const inputPath = process.argv[2] ?? "datasets/cards.seed.v1.json";
  const absolutePath = path.resolve(inputPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const cards = JSON.parse(raw);

  if (!Array.isArray(cards)) {
    console.error("Input file must be a JSON array.");
    process.exit(1);
  }

  console.log(`Dataset: ${absolutePath}`);
  console.log(`Total cards: ${cards.length}`);

  const byUnit = countBy(cards, (card) => card.unit ?? "(missing unit)");
  const byCardType = countBy(cards, (card) => card.card_type ?? "(missing card_type)");
  const byDifficulty = countBy(cards, (card) => String(card.difficulty ?? "(missing difficulty)"));
  const byExamTargets = countBy(cards, (card) =>
    Array.isArray(card.exam_targets) ? card.exam_targets.join("+") : "(missing exam_targets)"
  );
  const byUnitSubtopic = countBy(cards, (card) => `${card.unit ?? "?"} :: ${card.subtopic ?? "?"}`);

  printMap("Counts by Unit", byUnit);
  printMap("Counts by Card Type", byCardType);
  printMap("Counts by Difficulty", byDifficulty);
  printMap("Counts by Exam Targets", byExamTargets);
  printMap("Counts by Unit/Subtopic", byUnitSubtopic);
}

main();

