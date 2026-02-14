import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { initCards, getCards, getCardById } from "./cards";
import {
  selectSessionCards,
  selectChallengeCards,
  processAnswer,
  computeDashboard,
  SUBTOPIC_MASTERY_THRESHOLD,
  UNIT_COMPLETION_PERCENT,
  type CardState,
  type DailyScore,
  type SessionCard,
  type AnswerResult,
  type DashboardData,
} from "./game-logic";
import {
  getPlayerNames,
  login,
  joinGame,
  getUserData,
  saveAnswerFireAndForget,
  getLeaderboard,
  createChallenge,
  getUserChallenges,
  submitChallengeResult,
  type LeaderboardRow,
  type Challenge,
} from "./sheets-api";

type AppStage = "login" | "welcome" | "home" | "practice" | "summary" | "leaderboard" | "challenge-pick";

type ChoiceKey = "A" | "B" | "C" | "D";

type AnswerHistoryItem = {
  cardId: string;
  choice: ChoiceKey | null;
  correct: boolean;
  pointsAwarded: number;
  unitId: string;
  subtopic: string;
  speedMultiplier?: number;
  timedOut?: boolean;
};

type LeaderboardRange = "today" | "week" | "all";

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

function getSummaryMessage(pct: number, isFirstSession: boolean): string {
  if (isFirstSession) {
    if (pct === 100) return "A perfect first session! You're a natural.";
    if (pct >= 80) return "Great start! You've already got a strong foundation.";
    if (pct >= 60) return "Nice first session! The cards you missed will come back for extra practice.";
    return "Welcome aboard! Every answer helps the app learn what to review with you.";
  }
  if (pct === 100) return "Flawless! You nailed every single one.";
  if (pct >= 80) return "Strong session! You're really getting the hang of this.";
  if (pct >= 60) return "Solid work! Tricky cards will come back for another round.";
  return "Tough round — but showing up is what matters. Keep at it!";
}

export function App() {
  const [stage, setStage] = useState<AppStage>("login");
  const [userName, setUserName] = useState<string | null>(null);
  const [cardsReady, setCardsReady] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [dailyScore, setDailyScore] = useState<DailyScore | undefined>(undefined);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [streak, setStreak] = useState(0);

  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [history, setHistory] = useState<AnswerHistoryItem[]>([]);
  const [pendingAnswer, setPendingAnswer] = useState<AnswerResult | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<ChoiceKey | null>(null);
  const [cardStartedAtMs, setCardStartedAtMs] = useState(0);

  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [loginName, setLoginName] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [isJoinMode, setIsJoinMode] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [speedMode, setSpeedMode] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [pendingChallenges, setPendingChallenges] = useState<Challenge[]>([]);
  const [challengeOpponent, setChallengeOpponent] = useState("");

  const [leaderboardRange, setLeaderboardRange] = useState<LeaderboardRange>("today");
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const isFirstSession = useRef(false);

  const currentCard = queue[0] ?? null;
  const totalAnswered = history.length;
  const totalCorrect = history.filter((item) => item.correct).length;
  const pctCorrect = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const pointsEarned = history.reduce((sum, item) => sum + item.pointsAwarded, 0);
  const weakSkills = useMemo(() => countWeakSubtopics(history), [history]);
  const summaryMessage = useMemo(
    () => getSummaryMessage(pctCorrect, isFirstSession.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pctCorrect, totalAnswered]
  );

  // Pacing estimate: sessions per day needed to finish by May 1
  const pacingEstimate = useMemo(() => {
    if (!dashboard?.unit_mastery?.length) return null;

    // Calculate subtopics remaining across all units
    const subtopicsNeeded = dashboard.unit_mastery.reduce((sum, u) => {
      const subtopicsForCompletion = Math.ceil(u.total_subtopics * UNIT_COMPLETION_PERCENT);
      return sum + Math.max(0, subtopicsForCompletion - u.mastered_subtopics);
    }, 0);

    // Each subtopic needs ~3 cards to master
    const cardsLeft = subtopicsNeeded * SUBTOPIC_MASTERY_THRESHOLD;

    const target = new Date(Date.UTC(2026, 4, 1)); // May 1, 2026
    const daysLeft = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86_400_000));
    if (daysLeft === 0) return { cardsLeft, daysLeft, sessionsPerDay: 0 };

    // Each 10-card session introduces ~2 new cards on average (rest are reviews).
    // Calculate sessions needed: cards ÷ days ÷ 2 cards per session, minimum 1/day.
    const cardsPerDay = cardsLeft / daysLeft;
    const sessionsPerDay = Math.max(1, Math.ceil(cardsPerDay / 2));
    return { cardsLeft, daysLeft, sessionsPerDay, conceptsLeft: subtopicsNeeded };
  }, [dashboard]);

  // Fire confetti when entering the summary stage
  useEffect(() => {
    if (stage !== "summary" || totalAnswered === 0) return;
    if (pctCorrect === 100) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.7 } });
    } else if (pctCorrect >= 80) {
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
    }
  }, [stage, pctCorrect, totalAnswered]);

  // Speed mode countdown timer
  useEffect(() => {
    if (stage !== "practice" || !speedMode || pendingAnswer || !currentCard) return;
    setTimeRemaining(15);
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, speedMode, currentCard?.id, pendingAnswer]);

  // Auto-submit on timer expiry
  useEffect(() => {
    if (timeRemaining !== 0 || !speedMode || stage !== "practice" || pendingAnswer || !currentCard) return;
    handleSpeedTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining]);

  // Initialize cards and fetch player names on mount
  useEffect(() => {
    initCards()
      .then(() => setCardsReady(true))
      .catch((err) => setGlobalError(`Failed to load cards: ${err}`));
    getPlayerNames()
      .then((names) => setPlayerNames(names))
      .catch(() => {});
  }, []);

  // Auto-login from saved credentials
  useEffect(() => {
    if (!cardsReady || userName) return;
    try {
      const saved = localStorage.getItem("grammar_saved_user");
      if (!saved) return;
      const { name, pin } = JSON.parse(saved);
      if (name && pin) void handleLogin(name, pin);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsReady]);

  function refreshDashboard(states: Map<string, CardState>, score: DailyScore | undefined) {
    const d = computeDashboard(getCards(), states, score);
    setDashboard(d);
  }

  async function handleLogin(nameOverride?: string, pinOverride?: string) {
    const name = (nameOverride ?? loginName).trim();
    const pin = (pinOverride ?? loginPin).trim();
    if (!name) {
      setGlobalError("Pick your name first.");
      return;
    }
    if (pin.length !== 4) {
      setGlobalError("PIN must be 4 digits.");
      return;
    }
    setGlobalError(null);
    setIsLoading(true);
    try {
      const authFn = isJoinMode ? joinGame : login;
      const { user } = await authFn(name, pin);
      if (isJoinMode) {
        setPlayerNames((prev) => [...prev, user].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
      }
      const { cardStates: states, dailyScore: score, streak: userStreak } = await getUserData(user);
      setUserName(user);
      setCardStates(states);
      setDailyScore(score);
      setStreak(userStreak);
      refreshDashboard(states, score);
      getUserChallenges(user).then(({ pending }) => setPendingChallenges(pending)).catch(() => {});
      isFirstSession.current = states.size === 0;
      try { localStorage.setItem("grammar_saved_user", JSON.stringify({ name: user, pin })); } catch {}
      setStage(states.size === 0 ? "welcome" : "home");
    } catch (error) {
      setLoginPin("");
      setGlobalError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setIsLoading(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (isLoading) return;
    setGlobalError(null);
    const next = loginPin + digit;
    if (next.length > 4) return;
    setLoginPin(next);
    if (next.length === 4) {
      void handleLogin(undefined, next);
    }
  }

  function handlePinDelete() {
    if (isLoading) return;
    setGlobalError(null);
    setLoginPin((prev) => prev.slice(0, -1));
  }

  function startPractice(sizeOverride?: number) {
    setGlobalError(null);
    const size = sizeOverride ?? 10;
    const pool = selectedUnit
      ? getCards().filter((c) => c.unit === selectedUnit)
      : getCards();
    const cards = selectSessionCards(pool, cardStates, size);
    if (cards.length === 0) {
      setGlobalError("No cards available for this unit right now. Try another or come back later.");
      return;
    }
    setQueue(cards);
    setHistory([]);
    setPendingAnswer(null);
    setSelectedChoice(null);
    setActiveChallenge(null);
    setCardStartedAtMs(Date.now());
    setStage("practice");
  }

  function buildChallengeQueue(cardIds: string[]): SessionCard[] {
    return cardIds
      .map((id) => {
        const card = getCardById(id);
        if (!card) return null;
        const state = cardStates.get(id);
        return {
          ...card,
          source: (state ? "due" : "new") as SessionCard["source"],
          current_box: state?.box ?? null,
          due_date: state?.due_date ?? null,
        };
      })
      .filter((c): c is SessionCard => c !== null);
  }

  async function startChallenge() {
    if (!userName || !challengeOpponent) return;
    setIsLoading(true);
    setGlobalError(null);
    try {
      const cardIds = selectChallengeCards(getCards(), cardStates, 10);
      const { challenge_id } = await createChallenge(userName, challengeOpponent, cardIds);
      const challengeCards = buildChallengeQueue(cardIds);
      if (challengeCards.length === 0) {
        setGlobalError("Could not build challenge cards.");
        return;
      }
      setActiveChallenge({
        challenge_id,
        creator: userName,
        opponent: challengeOpponent,
        card_ids: cardIds,
        creator_score: 0,
        creator_correct: 0,
        opponent_score: 0,
        opponent_correct: 0,
        status: "open",
        created_at: new Date().toISOString(),
      });
      setQueue(challengeCards);
      setHistory([]);
      setPendingAnswer(null);
      setSelectedChoice(null);
      setCardStartedAtMs(Date.now());
      setStage("practice");
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not create challenge.");
    } finally {
      setIsLoading(false);
    }
  }

  function acceptChallenge(challenge: Challenge) {
    const challengeCards = buildChallengeQueue(challenge.card_ids);
    if (challengeCards.length === 0) {
      setGlobalError("Could not load challenge cards.");
      return;
    }
    setActiveChallenge(challenge);
    setQueue(challengeCards);
    setHistory([]);
    setPendingAnswer(null);
    setSelectedChoice(null);
    setCardStartedAtMs(Date.now());
    setStage("practice");
  }

  function submitAnswer(choice: ChoiceKey) {
    if (!currentCard || pendingAnswer) return;

    const card = getCardById(currentCard.id);
    if (!card) return;

    setSelectedChoice(choice);

    const { answerResult, newCardState, newDailyScore } = processAnswer(
      card,
      choice,
      cardStates,
      dailyScore
    );

    // Apply speed bonus
    let mult = 1;
    if (speedMode && answerResult.correct) {
      const elapsed = (Date.now() - cardStartedAtMs) / 1000;
      if (elapsed < 5) mult = 3;
      else if (elapsed < 10) mult = 2;
      if (mult > 1) {
        const bonus = answerResult.points_awarded * (mult - 1);
        answerResult.points_awarded *= mult;
        newDailyScore.points += bonus;
        answerResult.daily_points = newDailyScore.points;
      }
    }
    setSpeedMultiplier(mult);

    // Update local state immediately
    setCardStates((prev) => {
      const next = new Map(prev);
      next.set(card.id, newCardState);
      return next;
    });
    setDailyScore(newDailyScore);
    setPendingAnswer(answerResult);

    // Fire-and-forget save to Google Sheets
    if (userName) {
      saveAnswerFireAndForget({
        user: userName,
        card_id: card.id,
        box: newCardState.box,
        due_date: newCardState.due_date,
        correct_streak: newCardState.correct_streak,
        total_attempts: newCardState.total_attempts,
        last_seen_at: newCardState.last_seen_at,
        points_awarded: answerResult.points_awarded,
      });
    }
  }

  function handleSpeedTimeout() {
    if (!currentCard || pendingAnswer) return;
    const card = getCardById(currentCard.id);
    if (!card) return;

    setSelectedChoice(null);
    setSpeedMultiplier(1);

    const { answerResult, newCardState, newDailyScore } = processAnswer(
      card,
      "__timeout__",
      cardStates,
      dailyScore
    );

    setCardStates((prev) => {
      const next = new Map(prev);
      next.set(card.id, newCardState);
      return next;
    });
    setDailyScore(newDailyScore);
    setPendingAnswer(answerResult);

    if (userName) {
      saveAnswerFireAndForget({
        user: userName,
        card_id: card.id,
        box: newCardState.box,
        due_date: newCardState.due_date,
        correct_streak: newCardState.correct_streak,
        total_attempts: newCardState.total_attempts,
        last_seen_at: newCardState.last_seen_at,
        points_awarded: 0,
      });
    }
  }

  function continueAfterFeedback() {
    if (!currentCard || !pendingAnswer) return;

    const nextHistoryItem: AnswerHistoryItem = {
      cardId: currentCard.id,
      choice: selectedChoice,
      correct: pendingAnswer.correct,
      pointsAwarded: pendingAnswer.points_awarded,
      unitId: currentCard.unit,
      subtopic: currentCard.subtopic,
      ...(speedMode ? { speedMultiplier, timedOut: selectedChoice === null } : {}),
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
      // Submit challenge result if in a challenge
      if (activeChallenge && userName) {
        const finalHistory = [...history, nextHistoryItem];
        const totalPts = finalHistory.reduce((s, h) => s + h.pointsAwarded, 0);
        const totalOk = finalHistory.filter((h) => h.correct).length;
        submitChallengeResult(
          activeChallenge.challenge_id,
          userName,
          totalPts,
          totalOk
        ).then((res) => {
          if (res.challenge) setActiveChallenge(res.challenge);
        }).catch(console.warn);
      }
      setStage("summary");
    }
  }

  function resetToHome() {
    setQueue([]);
    setHistory([]);
    setPendingAnswer(null);
    setSelectedChoice(null);
    setGlobalError(null);
    setActiveChallenge(null);
    if (streak === 0 && (dailyScore?.answers_count ?? 0) > 0) {
      setStreak(1);
    }
    refreshDashboard(cardStates, dailyScore);
    if (userName) {
      getUserChallenges(userName).then(({ pending }) => setPendingChallenges(pending)).catch(() => {});
    }
    setStage("home");
  }

  async function openLeaderboard() {
    setGlobalError(null);
    const initialRange: LeaderboardRange = "today";
    setLeaderboardRange(initialRange);
    setIsLeaderboardLoading(true);
    try {
      const result = await getLeaderboard(initialRange);
      setLeaderboardRows(result.rows ?? []);
      setStage("leaderboard");
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Could not load leaderboard."
      );
    } finally {
      setIsLeaderboardLoading(false);
    }
  }

  async function changeLeaderboardRange(range: LeaderboardRange) {
    setGlobalError(null);
    setLeaderboardRange(range);
    setIsLeaderboardLoading(true);
    try {
      const result = await getLeaderboard(range);
      setLeaderboardRows(result.rows ?? []);
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Could not load leaderboard."
      );
    } finally {
      setIsLeaderboardLoading(false);
    }
  }

  if (!cardsReady) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-4 py-8">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-700">Loading cards...</p>
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
        <h1 className="mt-1 text-xl font-bold text-ink">Grammar Showdown</h1>
      </header>

      {globalError ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {globalError}
        </div>
      ) : null}

      {stage === "login" ? (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-semibold">
            {isJoinMode ? "Join the Game" : "Sign In"}
          </h2>

          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
            {isJoinMode ? (
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="text"
                autoComplete="username"
                placeholder="Pick a display name"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                disabled={isLoading}
              />
            ) : (
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={loginName}
                onChange={(e) => { setLoginName(e.target.value); setLoginPin(""); setGlobalError(null); }}
                disabled={isLoading}
              >
                <option value="">Select your name</option>
                {playerNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
          </div>

          {/* PIN dots */}
          <div className="mt-4 flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  i < loginPin.length
                    ? "border-accent bg-accent"
                    : "border-slate-300 bg-white"
                }`}
              />
            ))}
          </div>
          {isLoading ? (
            <p className="mt-2 text-center text-xs text-slate-500">Signing in...</p>
          ) : (
            <p className="mt-2 text-center text-xs text-slate-400">Enter 4-digit PIN</p>
          )}

          {/* Number pad */}
          <div className="mx-auto mt-3 grid max-w-[16rem] grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <button
                key={d}
                type="button"
                className="rounded-xl bg-slate-100 py-3 text-lg font-semibold text-slate-800 active:bg-slate-200 disabled:opacity-40"
                disabled={isLoading || loginPin.length >= 4}
                onClick={() => handlePinDigit(d)}
              >
                {d}
              </button>
            ))}
            <div />
            <button
              type="button"
              className="rounded-xl bg-slate-100 py-3 text-lg font-semibold text-slate-800 active:bg-slate-200 disabled:opacity-40"
              disabled={isLoading || loginPin.length >= 4}
              onClick={() => handlePinDigit("0")}
            >
              0
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-100 py-3 text-lg font-semibold text-slate-600 active:bg-slate-200 disabled:opacity-40"
              disabled={isLoading || loginPin.length === 0}
              onClick={handlePinDelete}
            >
              &#9003;
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            {isJoinMode ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-semibold text-accent"
                  onClick={() => { setIsJoinMode(false); setLoginPin(""); setGlobalError(null); }}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                New player?{" "}
                <button
                  type="button"
                  className="font-semibold text-accent"
                  onClick={() => { setIsJoinMode(true); setLoginPin(""); setGlobalError(null); }}
                >
                  Join the Game
                </button>
              </>
            )}
          </p>
        </section>
      ) : null}

      {stage === "welcome" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold">
              Welcome, {userName}!
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              Grammar Showdown helps you learn SAT/ACT grammar through short daily practice sessions.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <span className="font-semibold">How it works:</span> Answer multiple-choice questions. Cards you get right advance through 4 levels over increasing intervals (1, 3, 7, and 21 days). Cards you miss reset to level 1 for more practice.
              </li>
              <li>
                <span className="font-semibold">How long:</span> There are 8 independent skill areas, each with multiple concepts. To complete a skill area, master 80% of its concepts by getting {SUBTOPIC_MASTERY_THRESHOLD} cards per concept to level 4. With one session a day, plan on about 2-3 weeks per skill area. You can work on any area in any order.
              </li>
              <li>
                <span className="font-semibold">Your first session:</span> We'll start you off with a quick 5-card warm-up so you can get the feel for it.
              </li>
            </ul>
          </div>
          <button
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => startPractice(5)}
          >
            Start Your First Session
          </button>
          <button
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            type="button"
            onClick={() => setStage("home")}
          >
            Skip to Home
          </button>
        </section>
      ) : null}

      {stage === "home" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">
                Signed in as <span className="font-semibold">{userName}</span>
              </p>
              <button
                className="text-xs text-slate-400 hover:text-slate-600"
                onClick={() => {
                  try { localStorage.removeItem("grammar_saved_user"); } catch {}
                  setUserName(null);
                  setLoginName("");
                  setLoginPin("");
                  setStage("login");
                }}
              >
                Sign out
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
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
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Streak</p>
                <p className="text-sm font-semibold">
                  {streak > 0 ? (
                    <span className={streak >= 7 ? "text-lg" : streak >= 3 ? "text-base" : "text-sm"}>
                      🔥
                    </span>
                  ) : null}
                  {" "}{streak}d
                </p>
              </div>
            </div>
          </div>

          {pacingEstimate && pacingEstimate.cardsLeft > 0 ? (
            <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-sm font-semibold text-sky-900">
                {pacingEstimate.sessionsPerDay === 1
                  ? "Aim for 1 session per day to stay on track"
                  : `Aim for ${pacingEstimate.sessionsPerDay} sessions per day to complete all units`}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                {pacingEstimate.conceptsLeft} concepts to go · {pacingEstimate.daysLeft} days until May 1
              </p>
            </div>
          ) : pacingEstimate && pacingEstimate.cardsLeft === 0 ? (
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="text-sm font-semibold text-emerald-900">
                All done! Every skill area is complete.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Skill Area</span>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedUnit ?? ""}
                onChange={(e) => setSelectedUnit(e.target.value || null)}
              >
                <option value="">All units (mixed)</option>
                {dashboard?.unit_mastery?.map((u) => (
                  <option key={u.unit_id} value={u.unit_id}>
                    {u.unit_id}{u.completed ? " \u2713" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Speed Round</span>
              <button
                type="button"
                onClick={() => setSpeedMode((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  speedMode ? "bg-amber-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    speedMode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <button
              className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                speedMode ? "bg-amber-500" : "bg-accent"
              }`}
              type="button"
              onClick={() => startPractice()}
              disabled={isLoading}
            >
              {speedMode ? "Start Speed Round" : "Start Practice"}
            </button>

            <button
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => void openLeaderboard()}
              disabled={isLeaderboardLoading}
            >
              {isLeaderboardLoading ? "Loading..." : "View Leaderboard"}
            </button>

            <button
              className="mt-2 w-full rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
              type="button"
              onClick={() => { setChallengeOpponent(""); setStage("challenge-pick"); }}
            >
              Challenge a Player
            </button>
          </div>

          {pendingChallenges.length > 0 ? (
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <h3 className="text-sm font-semibold text-amber-800">Pending Challenges</h3>
              <div className="mt-2 space-y-2">
                {pendingChallenges.map((ch) => (
                  <button
                    key={ch.challenge_id}
                    type="button"
                    className="w-full rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-amber-200"
                    onClick={() => acceptChallenge(ch)}
                  >
                    <p className="font-semibold text-amber-800">{ch.creator} challenged you!</p>
                    <p className="text-xs text-amber-700">10 cards · Tap to play</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold">Unit Progress</h3>
            {dashboard?.unit_mastery?.length ? (
              <ul className="mt-2 space-y-2 text-xs text-slate-700">
                {dashboard.unit_mastery.map((unit) => (
                  <li key={unit.unit_id}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        {unit.completed ? (
                          <span className="text-emerald-600" title="Complete">&#10003;</span>
                        ) : null}
                        {unit.unit_id}
                      </span>
                      <span>
                        {unit.mastered_subtopics}/{unit.total_subtopics} concepts
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100">
                      <div
                        className={`h-1.5 rounded ${unit.completed ? "bg-emerald-500" : "bg-accent"}`}
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

      {stage === "challenge-pick" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold">Pick Your Opponent</h2>
            <div className="mt-3 space-y-2">
              {playerNames
                .filter((n) => n.toLowerCase() !== userName?.toLowerCase())
                .map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setChallengeOpponent(name)}
                    className={`w-full rounded-lg px-3 py-3 text-left text-sm font-semibold ring-1 ${
                      challengeOpponent === name
                        ? "bg-amber-50 ring-amber-400 text-amber-800"
                        : "bg-white ring-slate-200 text-slate-700"
                    }`}
                  >
                    {name}
                  </button>
                ))}
            </div>
            <button
              className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              disabled={!challengeOpponent || isLoading}
              onClick={() => void startChallenge()}
            >
              {isLoading ? "Creating..." : "Start Challenge"}
            </button>
            <button
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => setStage("home")}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {stage === "practice" && currentCard ? (
        <section className="mt-4 space-y-3">
          {activeChallenge ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-center ring-1 ring-amber-200">
              <p className="text-sm font-semibold text-amber-800">
                Challenge vs {activeChallenge.creator === userName ? activeChallenge.opponent : activeChallenge.creator}
              </p>
            </div>
          ) : null}
          {pendingAnswer ? (
            <div
              className={`rounded-2xl p-4 ring-1 ${
                pendingAnswer.correct
                  ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                  : "bg-rose-50 text-rose-900 ring-rose-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {speedMode && !pendingAnswer.correct && selectedChoice === null
                    ? "Time's up!"
                    : pendingAnswer.correct ? "Correct" : "Incorrect"}
                </p>
                <p className="text-xs">
                  +{pendingAnswer.points_awarded} pts
                  {speedMode && pendingAnswer.correct && speedMultiplier > 1 ? (
                    <span className="ml-1 font-bold text-amber-600">({speedMultiplier}x)</span>
                  ) : null}
                  {" "}· Box {pendingAnswer.new_box}
                </p>
              </div>
              {!pendingAnswer.correct ? (
                <p className="mt-1 text-xs font-semibold">
                  Answer: {currentCard.correct_answer}. {currentCard.choices[currentCard.correct_answer as ChoiceKey]}
                </p>
              ) : null}
              <p className="mt-1 text-sm">{pendingAnswer.explanation}</p>
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
          ) : (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {currentCard.unit} · {currentCard.subtopic}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Remaining: {queue.length} · Answered: {totalAnswered}
              </p>
              {speedMode ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={timeRemaining <= 5 ? "font-semibold text-rose-600" : "text-slate-500"}>
                      {timeRemaining}s
                    </span>
                    {timeRemaining <= 5 ? (
                      <span className="font-semibold text-rose-600">Hurry!</span>
                    ) : null}
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full transition-all duration-1000 ease-linear ${
                        timeRemaining <= 5 ? "bg-rose-500" : timeRemaining <= 10 ? "bg-amber-400" : "bg-accent"
                      }`}
                      style={{ width: `${(timeRemaining / 15) * 100}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-sm font-bold text-slate-700">
                {currentCard.card_type === "error_id"
                  ? "Which part, if any, contains an error?"
                  : currentCard.card_type === "revision"
                    ? "Choose the best version of the sentence."
                    : "Choose the best option."}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-900">{currentCard.prompt}</p>
            </div>
          )}

          <div className="space-y-2">
            {(["A", "B", "C", "D"] as ChoiceKey[]).map((key) => {
              const isCorrectKey = pendingAnswer && key === currentCard.correct_answer;
              const isSelectedWrong = pendingAnswer && !pendingAnswer.correct && key === selectedChoice;
              let ringClass = "bg-white ring-slate-200 hover:ring-slate-300";
              if (isCorrectKey) ringClass = "bg-emerald-50 ring-emerald-400";
              else if (isSelectedWrong) ringClass = "bg-rose-50 ring-rose-400";
              else if (selectedChoice === key) ringClass = "bg-sky-50 ring-sky-300";

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => submitAnswer(key)}
                  disabled={Boolean(pendingAnswer) || isLoading}
                  className={`w-full rounded-xl px-3 py-3 text-left text-sm ring-1 transition ${ringClass} disabled:opacity-70`}
                >
                  <span className="mr-2 font-semibold">{key}.</span>
                  <span>{currentCard.choices[key]}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {stage === "summary" ? (
        <section className="mt-4 space-y-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold">Session Summary</h2>
            <p className="mt-2 text-sm font-medium text-slate-800">{summaryMessage}</p>
            <p className="mt-3 text-sm text-slate-700">
              Score: {totalCorrect}/{totalAnswered} ({pctCorrect}%)
            </p>
            <p className="mt-1 text-sm text-slate-700">Points earned: {pointsEarned}</p>
            <p className="mt-1 text-sm text-slate-700">
              Daily points: {dailyScore?.points ?? 0}
            </p>
          </div>

          {activeChallenge ? (
            <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <h3 className="text-sm font-semibold text-amber-800">
                Challenge vs {activeChallenge.creator === userName ? activeChallenge.opponent : activeChallenge.creator}
              </h3>
              {activeChallenge.status === "completed" ? (
                <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-white p-3 ring-1 ring-amber-200">
                    <p className="text-xs text-slate-500">{activeChallenge.creator}</p>
                    <p className="text-lg font-bold text-amber-800">{activeChallenge.creator_correct}/10</p>
                    <p className="text-xs text-slate-600">{activeChallenge.creator_score} pts</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 ring-1 ring-amber-200">
                    <p className="text-xs text-slate-500">{activeChallenge.opponent}</p>
                    <p className="text-lg font-bold text-amber-800">{activeChallenge.opponent_correct}/10</p>
                    <p className="text-xs text-slate-600">{activeChallenge.opponent_score} pts</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-700">
                  Challenge sent! {activeChallenge.opponent} will see it next time they log in.
                </p>
              )}
            </div>
          ) : null}

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

          {speedMode ? (
            <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <h3 className="text-sm font-semibold text-amber-800">Speed Round Stats</h3>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-amber-900">
                <div>
                  <p className="text-lg font-bold">{history.filter((h) => h.speedMultiplier === 3).length}</p>
                  <p>3x bonus</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{history.filter((h) => h.speedMultiplier === 2).length}</p>
                  <p>2x bonus</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{history.filter((h) => h.timedOut).length}</p>
                  <p>Timed out</p>
                </div>
              </div>
            </div>
          ) : null}

          <button
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={resetToHome}
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
                      Completed: {row.mastered} · Streak: {row.streak}
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
