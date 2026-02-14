#!/usr/bin/env node
/**
 * Merge family-personalized grammar cards from agent outputs and dataset files
 * into the main cards.json file.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = '/Users/nealcaren/Documents/GitHub/grammar-competition';
const CARDS_PATH = join(ROOT, 'apps/web/src/data/cards.json');
const TASKS_DIR = '/private/tmp/claude-501/-Users-nealcaren-Documents-GitHub-grammar-competition/tasks';

// Agent IDs that generated personalized family cards
const AGENT_IDS = [
  'a46f17c',  // Batch 1 Sentence Boundaries
  'a115b2e',  // Batch 1 Modifiers
  'a580f18',  // Batch 1 Concision
  'a091a3e',  // Batch 1 Diction
  'a716be1',  // Batch 2 Punctuation
  'a300c5f',  // Batch 2 Agreement
  'a3b7994',  // Batch 2 Modifiers
  'a684939',  // Batch 2 Parallelism
  'ad87cf4',  // Batch 2 Transitions
  'a44032d',  // Batch 2 Concision
  'ac623e3',  // Batch 2 Diction
];

// Family-related keywords for filtering personalized cards from mixed files
const FAMILY_KEYWORDS = [
  'Baxter', 'Lula', 'Neal', 'Amie', 'Ironwoods', 'Duke',
  'Chapel Hill High', 'Tulane', 'UNC', 'Tar Heel', 'Blue Devil',
  'Kenan Stadium', 'cross country', 'cross-country', '3200',
  'linguistics', 'Linguistics', 'cycling', 'backpacking',
];

function isPersonalized(card) {
  const text = card.prompt + ' ' + card.explanation;
  return FAMILY_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * Extract JSON arrays from an agent output JSONL file.
 * Agent outputs are JSONL where each line is a message.
 * Cards are in assistant messages as JSON arrays in ```json blocks or plain text.
 */
function extractCardsFromAgentOutput(agentId) {
  const outputPath = join(TASKS_DIR, `${agentId}.output`);
  let content;
  try {
    content = readFileSync(outputPath, 'utf-8');
  } catch (e) {
    console.warn(`  Could not read output for agent ${agentId}: ${e.message}`);
    return [];
  }

  const cards = [];
  const lines = content.split('\n').filter(l => l.trim());

  for (const line of lines) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    // Look for assistant messages with card content
    if (msg.message?.role !== 'assistant') continue;
    const contentArr = msg.message?.content;
    if (!Array.isArray(contentArr)) continue;

    for (const block of contentArr) {
      if (block.type !== 'text') continue;
      const text = block.text;

      // Try to extract JSON arrays from ```json blocks
      const jsonBlockRegex = /```json\s*\n(\[[\s\S]*?\])\s*\n```/g;
      let match;
      while ((match = jsonBlockRegex.exec(text)) !== null) {
        try {
          const arr = JSON.parse(match[1]);
          if (Array.isArray(arr) && arr.length > 0 && arr[0].unit) {
            cards.push(...arr);
          }
        } catch {
          // Try to fix common JSON issues
        }
      }

      // Also try to find standalone JSON arrays (not in code blocks)
      if (cards.length === 0) {
        const standaloneRegex = /(\[\s*\{[\s\S]*?\}\s*\])/g;
        while ((match = standaloneRegex.exec(text)) !== null) {
          try {
            const arr = JSON.parse(match[1]);
            if (Array.isArray(arr) && arr.length > 0 && arr[0].unit) {
              cards.push(...arr);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  return cards;
}

// ---- Main ----

console.log('Reading existing cards.json...');
const existing = JSON.parse(readFileSync(CARDS_PATH, 'utf-8'));
console.log(`  Existing cards: ${existing.length}`);

// Track prompts for deduplication
const existingPrompts = new Set(existing.map(c => c.prompt.trim().toLowerCase()));

const newCards = [];

// 1. Read file-based card sources
const fileSources = [
  join(ROOT, 'datasets/cards.punctuation-hierarchy.family.json'),
  join(ROOT, 'datasets/cards.parallelism.family.v1.json'),
];

for (const src of fileSources) {
  try {
    const cards = JSON.parse(readFileSync(src, 'utf-8'));
    console.log(`  Read ${cards.length} cards from ${src.split('/').pop()}`);
    newCards.push(...cards);
  } catch (e) {
    console.warn(`  Could not read ${src}: ${e.message}`);
  }
}

// 2. Read personalized cards from mixed files
const mixedSources = [
  join(ROOT, 'datasets/cards.transitions-rhetoric.v1.json'),
  join(ROOT, 'proposed-cards.json'),
];

for (const src of mixedSources) {
  try {
    const allCards = JSON.parse(readFileSync(src, 'utf-8'));
    const personalized = allCards.filter(isPersonalized);
    console.log(`  Read ${personalized.length} personalized cards from ${src.split('/').pop()} (of ${allCards.length} total)`);
    newCards.push(...personalized);
  } catch (e) {
    console.warn(`  Could not read ${src}: ${e.message}`);
  }
}

// 3. Extract cards from agent outputs
console.log('\nExtracting cards from agent outputs...');
for (const agentId of AGENT_IDS) {
  const cards = extractCardsFromAgentOutput(agentId);
  if (cards.length > 0) {
    // Only keep personalized cards from agent outputs
    const personalized = cards.filter(isPersonalized);
    console.log(`  Agent ${agentId}: ${personalized.length} personalized cards (of ${cards.length} total)`);
    newCards.push(...personalized);
  } else {
    console.warn(`  Agent ${agentId}: no cards found`);
  }
}

// 4. Deduplicate against existing cards
console.log(`\nTotal new cards before dedup: ${newCards.length}`);
const uniqueNew = [];
const seenPrompts = new Set(existingPrompts);

for (const card of newCards) {
  const key = card.prompt.trim().toLowerCase();
  if (!seenPrompts.has(key)) {
    seenPrompts.add(key);
    uniqueNew.push(card);
  }
}

console.log(`After dedup against existing: ${uniqueNew.length} new cards`);

// 5. Normalize unit names to match existing convention
// Check existing unit names
const existingUnits = new Set(existing.map(c => c.unit));
console.log('\nExisting units:', [...existingUnits].sort());

// Map non-standard unit names
const UNIT_MAP = {
  'Modification & Parallelism': 'Modifiers',
  'Rhetoric & Transitions': 'Transitions & Rhetoric',
};

for (const card of uniqueNew) {
  if (UNIT_MAP[card.unit]) {
    card.unit = UNIT_MAP[card.unit];
  }
}

// 6. Merge and write
const merged = [...existing, ...uniqueNew];
writeFileSync(CARDS_PATH, JSON.stringify(merged, null, 2) + '\n');

console.log(`\nWrote ${merged.length} total cards to cards.json (+${uniqueNew.length} new)`);

// Print summary by unit
const unitCounts = {};
for (const card of uniqueNew) {
  unitCounts[card.unit] = (unitCounts[card.unit] || 0) + 1;
}
console.log('\nNew cards by unit:');
for (const [unit, count] of Object.entries(unitCounts).sort()) {
  console.log(`  ${unit}: ${count}`);
}
