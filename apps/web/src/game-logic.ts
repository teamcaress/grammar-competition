import type { Card } from "./cards";

export type CardState = {
  card_id: string;
  box: number;
  due_date: string;
  correct_streak: number;
  total_attempts: number;
  last_seen_at: string;
};

export type DailyScore = {
  date: string;
  points: number;
  answers_count: number;
};

export type SessionCard = Card & {
  source: "due" | "new" | "near_due";
  current_box: number | null;
  due_date: string | null;
};

export type AnswerResult = {
  card_id: string;
  is_new_card: boolean;
  correct: boolean;
  explanation: string;
  new_box: number;
  due_date: string;
  requeue_in_session: boolean;
  points_awarded: number;
  daily_points: number;
  answers_today: number;
};

/** Number of cards at box 4 needed to "complete" a unit */
export const UNIT_COMPLETION_THRESHOLD = 15;

export type DashboardData = {
  due_count: number;
  daily_points: number;
  answers_today: number;
  unit_mastery: Array<{
    unit_id: string;
    total_cards: number;
    seen_cards: number;
    mastered_cards: number;
    mastery_ratio: number;
    completed: boolean;
  }>;
};

const LEITNER_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 21,
};

function utcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return utcDateString(d);
}

export function todayKey(): string {
  return utcDateString(new Date());
}

export function selectSessionCards(
  allCards: Card[],
  cardStates: Map<string, CardState>,
  size: number
): SessionCard[] {
  const now = new Date().toISOString();
  const result: SessionCard[] = [];

  // 1. Due cards (box assigned, due_date <= now)
  const dueCards: SessionCard[] = [];
  for (const card of allCards) {
    const state = cardStates.get(card.id);
    if (state && state.due_date <= now) {
      dueCards.push({
        ...card,
        source: "due",
        current_box: state.box,
        due_date: state.due_date,
      });
    }
  }
  dueCards.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  result.push(...dueCards.slice(0, size));

  if (result.length >= size) return result.slice(0, size);

  // 2. New cards (never seen, max 5)
  const remainingAfterDue = size - result.length;
  const newLimit = Math.min(5, remainingAfterDue);
  const newCards: SessionCard[] = [];
  for (const card of allCards) {
    if (!cardStates.has(card.id)) {
      newCards.push({
        ...card,
        source: "new",
        current_box: null,
        due_date: null,
      });
    }
  }
  newCards.sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  result.push(...newCards.slice(0, newLimit));

  if (result.length >= size) return result.slice(0, size);

  // 3. Near-due cards (due_date > now)
  const remainingAfterNew = size - result.length;
  const usedIds = new Set(result.map((c) => c.id));
  const nearDue: SessionCard[] = [];
  for (const card of allCards) {
    if (usedIds.has(card.id)) continue;
    const state = cardStates.get(card.id);
    if (state && state.due_date > now) {
      nearDue.push({
        ...card,
        source: "near_due",
        current_box: state.box,
        due_date: state.due_date,
      });
    }
  }
  nearDue.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  result.push(...nearDue.slice(0, remainingAfterNew));

  return result.slice(0, size);
}

export function processAnswer(
  card: Card,
  choice: string,
  cardStates: Map<string, CardState>,
  dailyScore: DailyScore | undefined
): { answerResult: AnswerResult; newCardState: CardState; newDailyScore: DailyScore } {
  const priorState = cardStates.get(card.id);
  const isNewCard = !priorState;
  const correct = choice === card.correct_answer;

  const baseBox = priorState?.box ?? 1;
  const newBox = correct ? Math.min(4, baseBox + 1) : 1;

  const now = new Date();
  const reviewedAt = now.toISOString();
  const dueDate = addDaysIso(now, LEITNER_INTERVAL_DAYS[newBox]);
  const correctStreak = correct ? (priorState?.correct_streak ?? 0) + 1 : 0;
  const totalAttempts = (priorState?.total_attempts ?? 0) + 1;
  const requeueInSession = !correct;

  const dayKey = todayKey();
  const existingAnswers = dailyScore?.answers_count ?? 0;
  const scoringAllowed = existingAnswers < 60;
  const pointsAwarded = scoringAllowed && correct ? (isNewCard ? 1 : 2) : 0;

  const newDailyScore: DailyScore = {
    date: dayKey,
    points: (dailyScore?.points ?? 0) + pointsAwarded,
    answers_count: existingAnswers + 1,
  };

  const newCardState: CardState = {
    card_id: card.id,
    box: newBox,
    due_date: dueDate,
    correct_streak: correctStreak,
    total_attempts: totalAttempts,
    last_seen_at: reviewedAt,
  };

  const answerResult: AnswerResult = {
    card_id: card.id,
    is_new_card: isNewCard,
    correct,
    explanation: card.explanation,
    new_box: newBox,
    due_date: dueDate,
    requeue_in_session: requeueInSession,
    points_awarded: pointsAwarded,
    daily_points: newDailyScore.points,
    answers_today: newDailyScore.answers_count,
  };

  return { answerResult, newCardState, newDailyScore };
}

export function computeDashboard(
  allCards: Card[],
  cardStates: Map<string, CardState>,
  dailyScore: DailyScore | undefined
): DashboardData {
  const now = new Date().toISOString();
  let dueCount = 0;

  for (const state of cardStates.values()) {
    if (state.due_date <= now) dueCount++;
  }

  // Unit mastery
  const unitMap = new Map<
    string,
    { total: number; seen: number; mastered: number }
  >();

  for (const card of allCards) {
    let entry = unitMap.get(card.unit);
    if (!entry) {
      entry = { total: 0, seen: 0, mastered: 0 };
      unitMap.set(card.unit, entry);
    }
    entry.total++;
    const state = cardStates.get(card.id);
    if (state) {
      entry.seen++;
      if (state.box === 4) entry.mastered++;
    }
  }

  const unitMastery = [...unitMap.entries()]
    .map(([unit_id, e]) => ({
      unit_id,
      total_cards: e.total,
      seen_cards: e.seen,
      mastered_cards: e.mastered,
      mastery_ratio:
        UNIT_COMPLETION_THRESHOLD > 0
          ? Math.min(1, e.mastered / UNIT_COMPLETION_THRESHOLD)
          : 0,
      completed: e.mastered >= UNIT_COMPLETION_THRESHOLD,
    }))
    .sort((a, b) => a.unit_id.localeCompare(b.unit_id));

  return {
    due_count: dueCount,
    daily_points: dailyScore?.points ?? 0,
    answers_today: dailyScore?.answers_count ?? 0,
    unit_mastery: unitMastery,
  };
}

export function computeStreak(activeDateKeys: string[]): number {
  const set = new Set(activeDateKeys);
  let streak = 0;
  let cursor = todayKey();
  while (set.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}
