import rawCards from "./data/cards.json";

export type Card = {
  id: string;
  unit: string;
  subtopic: string;
  prompt: string;
  choices: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty: number;
};

type RawCard = {
  unit: string;
  subtopic: string;
  prompt: string;
  choices: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty: number;
};

let cards: Card[] = [];
const byId = new Map<string, Card>();

async function makeCardId(unit: string, subtopic: string, prompt: string): Promise<string> {
  const base = `${unit}\n${subtopic}\n${prompt}`;
  const encoded = new TextEncoder().encode(base);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `card_${hex.slice(0, 24)}`;
}

export async function initCards(): Promise<void> {
  if (cards.length > 0) return;

  const raws = rawCards as RawCard[];
  const results: Card[] = [];

  for (const raw of raws) {
    const id = await makeCardId(raw.unit, raw.subtopic, raw.prompt);
    const card: Card = {
      id,
      unit: raw.unit,
      subtopic: raw.subtopic,
      prompt: raw.prompt,
      choices: raw.choices,
      correct_answer: raw.correct_answer,
      explanation: raw.explanation,
      difficulty: raw.difficulty,
    };
    results.push(card);
    byId.set(id, card);
  }

  cards = results;
}

export function getCards(): Card[] {
  return cards;
}

export function getCardById(id: string): Card | undefined {
  return byId.get(id);
}
