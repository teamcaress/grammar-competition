import fs from "node:fs";
import path from "node:path";

const MIN_PER_SUBTOPIC = 8;
const MIN_DUAL_TARGET_RATIO = 0.7;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadCards(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) fail(`File not found: ${fullPath}`);
  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!Array.isArray(parsed)) fail(`Expected JSON array in ${fullPath}`);
  return { cards: parsed, fullPath };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function main() {
  const inputPath = process.argv[2] ?? "datasets/cards.seed.master.v1.json";
  const { cards, fullPath } = loadCards(inputPath);

  const subtopicCounts = new Map();
  let dualTargetCount = 0;

  for (const card of cards) {
    const key = `${card.unit ?? "?"} :: ${card.subtopic ?? "?"}`;
    subtopicCounts.set(key, (subtopicCounts.get(key) ?? 0) + 1);

    const targets = Array.isArray(card.exam_targets) ? card.exam_targets : [];
    if (targets.includes("SAT") && targets.includes("ACT")) dualTargetCount += 1;
  }

  const belowThreshold = [...subtopicCounts.entries()]
    .filter(([, count]) => count < MIN_PER_SUBTOPIC)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const dualRatio = cards.length === 0 ? 0 : dualTargetCount / cards.length;

  console.log(`Blueprint check: ${fullPath}`);
  console.log(`Total cards: ${cards.length}`);
  console.log(`Dual-target cards (SAT+ACT): ${dualTargetCount} (${pct(dualRatio)})`);
  console.log(`Minimum dual-target target: ${pct(MIN_DUAL_TARGET_RATIO)}`);
  console.log(`Subtopics under minimum ${MIN_PER_SUBTOPIC}: ${belowThreshold.length}`);

  if (belowThreshold.length > 0) {
    for (const [key, count] of belowThreshold) {
      console.log(`- ${key}: ${count} (needs +${MIN_PER_SUBTOPIC - count})`);
    }
  }

  const passDualRatio = dualRatio >= MIN_DUAL_TARGET_RATIO;
  const passSubtopics = belowThreshold.length === 0;

  if (passDualRatio && passSubtopics) {
    console.log("Blueprint status: PASS");
    process.exit(0);
  }

  console.log("Blueprint status: GAPS REMAIN");
  process.exit(2);
}

main();

