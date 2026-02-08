import fs from "node:fs";
import path from "node:path";

function readCards(filePath) {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${fullPath}`);
  }
  return parsed;
}

function dedupeKey(card) {
  if (typeof card.skill_code === "string" && card.skill_code.trim().length > 0) {
    return `skill:${card.skill_code.trim()}`;
  }
  const base = [
    card.unit ?? "",
    card.subtopic ?? "",
    card.prompt ?? "",
    card.correct_answer ?? "",
    JSON.stringify(card.choices ?? {})
  ].join("|");
  return `fallback:${base}`;
}

function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length < 2) {
    console.error("Usage: node scripts/merge-card-datasets.mjs <input1> <input2> [input3...]");
    process.exit(1);
  }

  const merged = [];
  const seen = new Set();

  for (const input of inputs) {
    const cards = readCards(input);
    for (const card of cards) {
      const key = dedupeKey(card);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(card);
    }
  }

  const outPath = path.resolve("datasets/cards.seed.master.v1.json");
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`Wrote ${merged.length} cards to ${outPath}`);
}

main();

