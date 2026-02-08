import { FormEvent, useEffect, useMemo, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

type AppStage =
  | "checking"
  | "login"
  | "home"
  | "practice"
  | "summary"
  | "leaderboard";

type User = {
  id: string;
  display_name: string;
  room_id: string;
};

type ChoiceKey = "A" | "B" | "C" | "D";

type SessionCard = {
  id: string;
  unit_id: string;
  subtopic: string;
  prompt: string;
  choices: Record<string, string>;
  explanation: string;
  difficulty: number;
  source: "due" | "new" | "near_due";
  current_box: number | null;
  due_date: string | null;
};

type AnswerResponse = {
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

type AnswerHistoryItem = {
  cardId: string;
  choice: ChoiceKey;
  correct: boolean;
  pointsAwarded: number;
  unitId: string;
  subtopic: string;
};

type DashboardResponse = {
  due_count: number;
  daily_points: number;
  answers_today: number;
  unit_mastery: Array<{
    unit_id: string;
    total_cards: number;
    seen_cards: number;
    mastered_cards: number;
    mastery_ratio: number;
  }>;
};

type LeaderboardRange = "today" | "week" | "all";
type LeaderboardRow = {
  display_name: string;
  points: number;
  mastered: number;
  streak: number;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Request failed")
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

function countWeakSubtopics(history: AnswerHistoryItem[]): Array<{ key: string; misses: number }> {
  const missesByKey = new Map<string, number>();
  for (const item of history) {
    if (item.correct) continue;
    const key = `${item.unitId} :: ${item.subtopic}`;
    missesByKey.set(key, (missesByKey.get(key) ?? 0) + 1);
  }
  return [...missesByKey.entries()]
    .map(([key, misses]) => ({ key, misses }))
    .sort((a, b) => b.misses - a.misses)
    .slice(0, 3);
}

export function App() {
  const [stage, setStage] = useState<AppStage>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sessionSize, setSessionSize] = useState(12);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [history, setHistory] = useState<AnswerHistoryItem[]>([]);
  const [pendingAnswer, setPendingAnswer] = useState<AnswerResponse | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<ChoiceKey | null>(null);
  const [cardStartedAtMs, setCardStartedAtMs] = useState(0);
  const [dailyPoints, setDailyPoints] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [leaderboardRange, setLeaderboardRange] = useState<LeaderboardRange>("today");
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const currentCard = queue[0] ?? null;
  const totalAnswered = history.length;
  const totalCorrect = history.filter((item) => item.correct).length;
  const pointsEarned = history.reduce((sum, item) => sum + item.pointsAwarded, 0);

  const weakSkills = useMemo(() => countWeakSubtopics(history), [history]);

  async function loadDashboard() {
    const result = await apiRequest<DashboardResponse>("/api/dashboard", {
      method: "GET"
    });
    setDashboard(result);
    setDailyPoints(result.daily_points);
  }

  async function loadLeaderboard(range: LeaderboardRange) {
    setIsLeaderboardLoading(true);
    try {
      const result = await apiRequest<{ range: LeaderboardRange; rows: LeaderboardRow[] }>(
        `/api/leaderboard?range=${range}`,
        { method: "GET" }
      );
      setLeaderboardRows(result.rows ?? []);
    } finally {
      setIsLeaderboardLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const me = await apiRequest<{
          id: string;
          display_name: string;
          room_id: string;
        }>("/api/me", { method: "GET" });
        setUser(me);
        setStage("home");
        try {
          await loadDashboard();
        } catch (error) {
          setGlobalError(
            error instanceof Error ? error.message : "Could not load dashboard."
          );
        }
      } catch {
        setStage("login");
      }
    })();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGlobalError(null);
    setIsLoading(true);

    try {
      const result = await apiRequest<{
        user_id: string;
        display_name: string;
        room_id: string;
      }>("/api/login", {
        method: "POST",
        body: JSON.stringify({
          room_code: roomCode,
          display_name: displayName
        })
      });

      setUser({
        id: result.user_id,
        display_name: result.display_name,
        room_id: result.room_id
      });
      setStage("home");
      try {
        await loadDashboard();
      } catch (error) {
        setGlobalError(
          error instanceof Error ? error.message : "Could not load dashboard."
        );
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not log in.");
    } finally {
      setIsLoading(false);
    }
  }

  async function startPractice() {
    setGlobalError(null);
    setIsLoading(true);

    try {
      const result = await apiRequest<{
        cards: SessionCard[];
      }>("/api/session/start", {
        method: "POST",
        body: JSON.stringify({ size: sessionSize })
      });

      const cards = result.cards ?? [];
      if (cards.length === 0) {
        setGlobalError(
          "No cards were returned. Import cards first or try a different unit."
        );
        setStage("home");
        return;
      }

      setQueue(cards);
      setHistory([]);
      setPendingAnswer(null);
      setSelectedChoice(null);
      setDailyPoints(0);
      setCardStartedAtMs(Date.now());
      setStage("practice");
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not start session.");
      setStage("home");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitAnswer(choice: ChoiceKey) {
    if (!currentCard || pendingAnswer) return;

    setIsLoading(true);
    setGlobalError(null);
    setSelectedChoice(choice);

    try {
      const result = await apiRequest<AnswerResponse>("/api/session/answer", {
        method: "POST",
        body: JSON.stringify({
          card_id: currentCard.id,
          choice,
          response_ms: Math.max(0, Date.now() - cardStartedAtMs)
        })
      });

      setPendingAnswer(result);
      setDailyPoints(result.daily_points);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not submit answer.");
      setSelectedChoice(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function openLeaderboard() {
    setGlobalError(null);
    const initialRange: LeaderboardRange = "today";
    setLeaderboardRange(initialRange);
    try {
      await loadLeaderboard(initialRange);
      setStage("leaderboard");
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Could not load leaderboard."
      );
    }
  }

  async function changeLeaderboardRange(range: LeaderboardRange) {
    setGlobalError(null);
    setLeaderboardRange(range);
    try {
      await loadLeaderboard(range);
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Could not load leaderboard."
      );
    }
  }

  function continueAfterFeedback() {
    if (!currentCard || !selectedChoice || !pendingAnswer) return;

    const nextHistoryItem: AnswerHistoryItem = {
      cardId: currentCard.id,
      choice: selectedChoice,
      correct: pendingAnswer.correct,
      pointsAwarded: pendingAnswer.points_awarded,
      unitId: currentCard.unit_id,
      subtopic: currentCard.subtopic
    };

    const remaining = queue.slice(1);
    const nextQueue = pendingAnswer.requeue_in_session
      ? [...remaining, currentCard]
      : remaining;

    setHistory((prev) => [...prev, nextHistoryItem]);
    setQueue(nextQueue);
    setPendingAnswer(null);
    setSelectedChoice(null);
    setCardStartedAtMs(Date.now());

    if (nextQueue.length === 0) {
      setStage("summary");
    }
  }

  async function resetToHome() {
    setQueue([]);
    setHistory([]);
    setPendingAnswer(null);
    setSelectedChoice(null);
    setGlobalError(null);
    try {
      await loadDashboard();
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Could not refresh dashboard."
      );
    }
    setStage("home");
  }

  if (stage === "checking") {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 py-8">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-700">Checking session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          SAT/ACT Grammar Trainer
        </p>
        <h1 className="mt-1 text-xl font-bold text-ink">Phone Practice MVP</h1>
        <p className="mt-1 text-xs text-slate-500">API: {apiBase}</p>
      </header>

      {globalError ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {globalError}
        </div>
      ) : null}

      {stage === "login" ? (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-semibold">Join Room</h2>
          <form className="mt-3 space-y-3" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Room Code</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="ROOM123"
                required
                minLength={4}
                maxLength={32}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Display Name</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alex"
                required
                minLength={2}
                maxLength={32}
              />
            </label>
            <button
              className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Continue"}
            </button>
          </form>
        </section>
      ) : null}

      {stage === "home" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-700">
              Signed in as <span className="font-semibold">{user?.display_name}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Room: {user?.room_id}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Due</p>
                <p className="text-sm font-semibold">{dashboard?.due_count ?? 0}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Today</p>
                <p className="text-sm font-semibold">{dashboard?.daily_points ?? 0} pts</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Answers</p>
                <p className="text-sm font-semibold">{dashboard?.answers_today ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Session Size</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min={10}
                max={20}
                value={sessionSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isNaN(value)) return;
                  setSessionSize(Math.max(10, Math.min(20, Math.floor(value))));
                }}
              />
            </label>

            <button
              className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              onClick={() => void startPractice()}
              disabled={isLoading}
            >
              {isLoading ? "Starting..." : "Start Practice"}
            </button>

            <button
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => void openLeaderboard()}
              disabled={isLeaderboardLoading}
            >
              {isLeaderboardLoading ? "Loading..." : "View Leaderboard"}
            </button>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold">Unit Mastery</h3>
            {dashboard?.unit_mastery?.length ? (
              <ul className="mt-2 space-y-2 text-xs text-slate-700">
                {dashboard.unit_mastery.slice(0, 4).map((unit) => (
                  <li key={unit.unit_id}>
                    <div className="flex items-center justify-between">
                      <span>{unit.unit_id}</span>
                      <span>
                        {unit.mastered_cards}/{unit.total_cards}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100">
                      <div
                        className="h-1.5 rounded bg-accent"
                        style={{
                          width: `${Math.round((unit.mastery_ratio ?? 0) * 100)}%`
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-600">No unit data available yet.</p>
            )}
          </div>
        </section>
      ) : null}

      {stage === "practice" && currentCard ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {currentCard.unit_id} · {currentCard.subtopic}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Remaining: {queue.length} · Answered: {totalAnswered}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-900">{currentCard.prompt}</p>
          </div>

          <div className="space-y-2">
            {(["A", "B", "C", "D"] as ChoiceKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => void submitAnswer(key)}
                disabled={Boolean(pendingAnswer) || isLoading}
                className={`w-full rounded-xl px-3 py-3 text-left text-sm ring-1 transition ${
                  selectedChoice === key
                    ? "bg-sky-50 ring-sky-300"
                    : "bg-white ring-slate-200 hover:ring-slate-300"
                } disabled:opacity-70`}
              >
                <span className="mr-2 font-semibold">{key}.</span>
                <span>{currentCard.choices[key]}</span>
              </button>
            ))}
          </div>

          {pendingAnswer ? (
            <div
              className={`rounded-2xl p-4 ring-1 ${
                pendingAnswer.correct
                  ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                  : "bg-rose-50 text-rose-900 ring-rose-200"
              }`}
            >
              <p className="text-sm font-semibold">
                {pendingAnswer.correct ? "Correct" : "Incorrect"}
              </p>
              <p className="mt-1 text-sm">{pendingAnswer.explanation}</p>
              <p className="mt-2 text-xs">
                Box {pendingAnswer.new_box} · +{pendingAnswer.points_awarded} pts · Daily{" "}
                {pendingAnswer.daily_points}
              </p>
              <button
                className="mt-3 w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
                type="button"
                onClick={continueAfterFeedback}
              >
                {queue.length > 1 || pendingAnswer.requeue_in_session
                  ? "Next Card"
                  : "Finish Session"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {stage === "summary" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold">Session Summary</h2>
            <p className="mt-2 text-sm text-slate-700">
              Score: {totalCorrect}/{totalAnswered} (
              {totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0}%)
            </p>
            <p className="mt-1 text-sm text-slate-700">Points earned: {pointsEarned}</p>
            <p className="mt-1 text-sm text-slate-700">Daily points: {dailyPoints}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold">Weak Skills</h3>
            {weakSkills.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No weak skills detected this session.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {weakSkills.map((item) => (
                  <li key={item.key}>
                    {item.key} ({item.misses} miss{item.misses === 1 ? "" : "es"})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => void resetToHome()}
          >
            Back to Home
          </button>

          <button
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            type="button"
            onClick={() => void openLeaderboard()}
          >
            View Leaderboard
          </button>
        </section>
      ) : null}

      {stage === "leaderboard" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold">Leaderboard</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["today", "week", "all"] as LeaderboardRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => void changeLeaderboardRange(range)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold uppercase ${
                    leaderboardRange === range
                      ? "bg-ink text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  disabled={isLeaderboardLoading}
                >
                  {range}
                </button>
              ))}
            </div>

            {isLeaderboardLoading ? (
              <p className="mt-3 text-sm text-slate-600">Loading leaderboard...</p>
            ) : leaderboardRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No scores yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {leaderboardRows.map((row, index) => (
                  <li
                    key={`${row.display_name}-${index}`}
                    className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">
                        #{index + 1} {row.display_name}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">{row.points} pts</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Mastered: {row.mastered} · Streak: {row.streak}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => setStage("home")}
          >
            Back to Home
          </button>
        </section>
      ) : null}
    </main>
  );
}
