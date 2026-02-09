import dns from "node:dns";
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

type SeedCard = {
  unit: string;
  subtopic: string;
  prompt: string;
  choices: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty: number;
  tags?: string[];
};

const datasetPath = process.argv[2];
if (!datasetPath) {
  console.error("Usage: tsx scripts/seed-cards.ts <path-to-dataset.json>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const raw = fs.readFileSync(datasetPath, "utf8");
const cards = JSON.parse(raw) as SeedCard[];
if (!Array.isArray(cards)) {
  console.error("Dataset must be a JSON array.");
  process.exit(1);
}

const makeCardId = (card: SeedCard): string => {
  const base = `${card.unit}\n${card.subtopic}\n${card.prompt}`;
  const digest = crypto.createHash("sha256").update(base).digest("hex").slice(0, 24);
  return `card_${digest}`;
};

dns.setDefaultResultOrder("ipv4first");

const ssl =
  databaseUrl.includes("supabase.co") ? ({ rejectUnauthorized: false } as const) : undefined;
const pool = new Pool({ connectionString: databaseUrl, ssl });

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const card of cards) {
      const id = makeCardId(card);
      const unitId = String(card.unit ?? "").trim();
      const subtopic = String(card.subtopic ?? "").trim();
      const prompt = String(card.prompt ?? "").trim();
      const explanation = String(card.explanation ?? "").trim();
      const difficulty = Number(card.difficulty ?? 1);
      const correctChoice = String(card.correct_answer ?? "").trim().toUpperCase();
      const choices = card.choices ?? {};
      const tags = Array.isArray(card.tags) ? card.tags : [];

      if (!unitId || !subtopic || !prompt || !explanation) {
        throw new Error(`Invalid card (missing fields): ${id}`);
      }
      if (!["A", "B", "C", "D"].includes(correctChoice)) {
        throw new Error(`Invalid correct_answer for ${id}: ${correctChoice}`);
      }

      await client.query(
        `
          INSERT INTO cards
            (id, unit_id, subtopic, prompt, choices_json, correct_choice, explanation, difficulty, tags_json)
          VALUES
            ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            unit_id = EXCLUDED.unit_id,
            subtopic = EXCLUDED.subtopic,
            prompt = EXCLUDED.prompt,
            choices_json = EXCLUDED.choices_json,
            correct_choice = EXCLUDED.correct_choice,
            explanation = EXCLUDED.explanation,
            difficulty = EXCLUDED.difficulty,
            tags_json = EXCLUDED.tags_json
        `,
        [id, unitId, subtopic, prompt, JSON.stringify(choices), correctChoice, explanation, difficulty, JSON.stringify(tags)]
      );
    }
    await client.query("COMMIT");
    console.log(`Seeded ${cards.length} cards from ${datasetPath}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
