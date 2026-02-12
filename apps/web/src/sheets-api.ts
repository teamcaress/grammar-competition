import type { CardState, DailyScore } from "./game-logic";

const sheetsUrl = import.meta.env.VITE_SHEETS_URL ?? "";

type LeaderboardRange = "today" | "week" | "all";

export type LeaderboardRow = {
  display_name: string;
  points: number;
  mastered: number;
  streak: number;
};

type GetUserDataResponse = {
  cardStates: Array<{
    card_id: string;
    box: number;
    due_date: string;
    correct_streak: number;
    total_attempts: number;
    last_seen_at: string;
  }>;
  dailyScore: DailyScore | null;
};

type GetLeaderboardResponse = {
  range: LeaderboardRange;
  rows: LeaderboardRow[];
};

export async function login(
  name: string,
  pin: string
): Promise<{ user: string }> {
  const res = await fetch(sheetsUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "login", name, pin }),
  });
  const data = (await res.json()) as { ok?: boolean; user?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return { user: data.user ?? name };
}

export async function joinGame(
  name: string,
  pin: string
): Promise<{ user: string }> {
  const res = await fetch(sheetsUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "joinGame", name, pin }),
  });
  const data = (await res.json()) as { ok?: boolean; user?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return { user: data.user ?? name };
}

export async function getUserData(
  user: string
): Promise<{ cardStates: Map<string, CardState>; dailyScore: DailyScore | undefined }> {
  const url = `${sheetsUrl}?action=getUserData&user=${encodeURIComponent(user)}`;
  const res = await fetch(url);
  const data = (await res.json()) as GetUserDataResponse;

  const map = new Map<string, CardState>();
  for (const cs of data.cardStates ?? []) {
    map.set(cs.card_id, cs);
  }

  return {
    cardStates: map,
    dailyScore: data.dailyScore ?? undefined,
  };
}

export async function saveAnswer(payload: {
  user: string;
  card_id: string;
  box: number;
  due_date: string;
  correct_streak: number;
  total_attempts: number;
  last_seen_at: string;
  points_awarded: number;
}): Promise<void> {
  // Use Content-Type: text/plain to avoid CORS preflight
  await fetch(sheetsUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "saveAnswer", ...payload }),
  });
}

export function saveAnswerFireAndForget(payload: Parameters<typeof saveAnswer>[0]): void {
  saveAnswer(payload).catch((err) => {
    console.warn("saveAnswer background error:", err);
  });
}

export async function getLeaderboard(
  range: LeaderboardRange
): Promise<{ range: LeaderboardRange; rows: LeaderboardRow[] }> {
  const url = `${sheetsUrl}?action=getLeaderboard&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  const data = (await res.json()) as GetLeaderboardResponse;
  return { range: data.range ?? range, rows: data.rows ?? [] };
}
