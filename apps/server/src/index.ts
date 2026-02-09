import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDb } from "./db.js";
import { createSessionToken, verifySessionToken, type SessionPayload } from "./session.js";

type LeaderboardRange = "today" | "week" | "all";
const parseLeaderboardRange = (value: unknown): LeaderboardRange => {
  if (value === "week" || value === "all") return value;
  return "today";
};

const normalizeRoomCode = (value: string): string => value.trim().toUpperCase();
const normalizeDisplayName = (value: string): string => value.trim();

const sha256Hex = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const utcDateString = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (dateKey: string, deltaDays: number): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return utcDateString(date);
};

const currentStreak = (activeDateKeys: Set<string>, todayKey: string): number => {
  let streak = 0;
  let cursor = todayKey;
  while (activeDateKeys.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
};

const LEITNER_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 21 };
const addDaysIso = (base: Date, days: number): string => {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const clampSessionSize = (input: unknown): number => {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return 10;
  return Math.min(20, Math.max(10, Math.floor(parsed)));
};

const asyncHandler =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void fn(req, res).catch(next);
  };

const cookieName = process.env.COOKIE_NAME ?? "gc_session";
// Optional. If set, cross-origin browser requests must match this exact origin.
// If unset and you serve web+api from the same host (Render), same-origin calls will work
// (they typically do not include an Origin header).
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const port = Number(process.env.PORT ?? 8787);

if (!sessionSecret || sessionSecret.trim().length < 16) {
  throw new Error("SESSION_SECRET is required and must be at least 16 chars.");
}

const { pool } = createDb();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Minimal CORS (only needed when the web app is hosted on a different origin than the API).
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (!origin) {
    next();
    return;
  }

  if (allowedOrigin && origin === allowedOrigin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "content-type");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(403).json({ error: "Origin not allowed." });
});

type UnitMasteryRow = {
  unit_id: string;
  total_cards: number;
  mastered_cards: number;
  seen_cards: number;
};

type LeaderboardPointRow = {
  user_id: string;
  display_name: string;
  points: number;
  mastered: number;
};

type StreakRow = {
  user_id: string;
  date: string;
};

const sessionCookie = (token: string, secure: boolean): string => {
  const maxAge = 60 * 60 * 24 * 30;
  const securePart = secure ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=${maxAge}`;
};

const getSessionFromRequest = (req: express.Request): SessionPayload | null => {
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  return verifySessionToken(token, sessionSecret);
};

const getAuthenticatedUser = async (req: express.Request) => {
  const session = getSessionFromRequest(req);
  if (!session) return null;
  const result = await pool.query(
    "SELECT id, display_name, room_id, created_at FROM users WHERE id = $1 AND room_id = $2 LIMIT 1",
    [session.userId, session.roomId]
  );
  return result.rows[0] ?? null;
};

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "grammar-trainer-server" }));

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
  const roomCode = normalizeRoomCode(String(req.body?.room_code ?? ""));
  const displayName = normalizeDisplayName(String(req.body?.display_name ?? ""));

  if (!roomCode || roomCode.length < 4 || roomCode.length > 32) {
    res.status(400).json({ error: "room_code must be 4-32 characters." });
    return;
  }
  if (!displayName || displayName.length < 2 || displayName.length > 32) {
    res.status(400).json({ error: "display_name must be 2-32 characters." });
    return;
  }

  const roomHash = sha256Hex(roomCode);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomRow = await client.query("SELECT id FROM rooms WHERE room_code_hash = $1 LIMIT 1", [
      roomHash
    ]);
    let roomId = roomRow.rows[0]?.id as string | undefined;
    if (!roomId) {
      roomId = crypto.randomUUID();
      await client.query(
        "INSERT INTO rooms (id, room_code_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [roomId, roomHash]
      );
      const reread = await client.query("SELECT id FROM rooms WHERE room_code_hash = $1 LIMIT 1", [
        roomHash
      ]);
      roomId = reread.rows[0]?.id;
    }
    if (!roomId) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Could not create room." });
      return;
    }

    const userRow = await client.query(
      "SELECT id, display_name, room_id FROM users WHERE room_id = $1 AND lower(display_name) = lower($2) LIMIT 1",
      [roomId, displayName]
    );
    let user = userRow.rows[0] as { id: string; display_name: string; room_id: string } | undefined;
    if (!user) {
      const userId = crypto.randomUUID();
      await client.query(
        "INSERT INTO users (id, display_name, room_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [userId, displayName, roomId]
      );
      const reread = await client.query(
        "SELECT id, display_name, room_id FROM users WHERE room_id = $1 AND lower(display_name) = lower($2) LIMIT 1",
        [roomId, displayName]
      );
      user = reread.rows[0];
    }
    if (!user) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Could not create user." });
      return;
    }

    await client.query("COMMIT");

    const payload: SessionPayload = {
      userId: user.id,
      roomId: user.room_id,
      displayName: user.display_name,
      issuedAt: Date.now()
    };
    const token = createSessionToken(payload, sessionSecret);

    const secure = (req.header("x-forwarded-proto") ?? "").includes("https") || req.secure;
    res.setHeader("set-cookie", sessionCookie(token, secure));
    res.json({
      ok: true,
      user_id: user.id,
      display_name: user.display_name,
      room_id: user.room_id
    });
    return;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  })
);

app.get(
  "/api/me",
  asyncHandler(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(user);
  })
);

app.post(
  "/api/session/start",
  asyncHandler(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const unitId =
      typeof req.body?.unit_id === "string" && req.body.unit_id.trim().length > 0
        ? req.body.unit_id.trim()
        : null;
    const size = clampSessionSize(req.body?.size);
    const nowIso = new Date().toISOString();

    const dueCards = await pool.query(
      `
        SELECT
          c.id,
          c.unit_id,
          c.subtopic,
          c.prompt,
          c.choices_json,
          c.explanation,
          c.difficulty,
          u.box AS current_box,
          u.due_date,
          'due' AS source
        FROM user_card_state u
        INNER JOIN cards c ON c.id = u.card_id
        WHERE u.user_id = $1
          AND ($2::text IS NULL OR c.unit_id = $2::text)
          AND u.due_date <= $3::timestamptz
        ORDER BY u.due_date ASC
        LIMIT $4
      `,
      [user.id, unitId, nowIso, size]
    );

    const dueResults = dueCards.rows ?? [];
    const remainingAfterDue = Math.max(0, size - dueResults.length);
    const newLimit = Math.min(5, remainingAfterDue);

    const newCards =
      newLimit > 0
        ? await pool.query(
            `
              SELECT
                c.id,
                c.unit_id,
                c.subtopic,
                c.prompt,
                c.choices_json,
                c.explanation,
                c.difficulty,
                NULL::int AS current_box,
                NULL::timestamptz AS due_date,
                'new' AS source
              FROM cards c
              LEFT JOIN user_card_state u
                ON c.id = u.card_id AND u.user_id = $1
              WHERE u.card_id IS NULL
                AND ($2::text IS NULL OR c.unit_id = $2::text)
              ORDER BY c.difficulty ASC, c.id ASC
              LIMIT $3
            `,
            [user.id, unitId, newLimit]
          )
        : { rows: [] as any[] };

    const newResults = newCards.rows ?? [];
    const remainingAfterNew = Math.max(0, size - dueResults.length - newResults.length);

    const nearDueCards =
      remainingAfterNew > 0
        ? await pool.query(
            `
              SELECT
                c.id,
                c.unit_id,
                c.subtopic,
                c.prompt,
                c.choices_json,
                c.explanation,
                c.difficulty,
                u.box AS current_box,
                u.due_date,
                'near_due' AS source
              FROM user_card_state u
              INNER JOIN cards c ON c.id = u.card_id
              WHERE u.user_id = $1
                AND ($2::text IS NULL OR c.unit_id = $2::text)
                AND u.due_date > $3::timestamptz
              ORDER BY u.due_date ASC
              LIMIT $4
            `,
            [user.id, unitId, nowIso, remainingAfterNew]
          )
        : { rows: [] as any[] };

    const nearDueResults = nearDueCards.rows ?? [];

    const cards = [...dueResults, ...newResults, ...nearDueResults].map((card) => ({
      id: card.id,
      unit_id: card.unit_id,
      subtopic: card.subtopic,
      prompt: card.prompt,
      choices: card.choices_json ?? {},
      explanation: card.explanation,
      difficulty: Number(card.difficulty ?? 0),
      source: card.source,
      current_box: card.current_box,
      due_date: card.due_date
    }));

    res.json({
      session_size: size,
      unit_id: unitId,
      counts: {
        due: dueResults.length,
        new: newResults.length,
        near_due: nearDueResults.length
      },
      cards
    });
  })
);

app.get(
  "/api/dashboard",
  asyncHandler(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = utcDateString(now);

    const dueRow = await pool.query(
      "SELECT COUNT(*)::int AS due_count FROM user_card_state WHERE user_id = $1 AND due_date <= $2::timestamptz",
      [user.id, nowIso]
    );

    const dailyRow = await pool.query(
      "SELECT points::int, answers_count::int FROM daily_scores WHERE user_id = $1 AND date = $2::date LIMIT 1",
      [user.id, todayKey]
    );

    const unitMasteryRows = await pool.query(
      `
        SELECT
          c.unit_id,
          COUNT(c.id)::int AS total_cards,
          COALESCE(SUM(CASE WHEN u.box = 4 THEN 1 ELSE 0 END), 0)::int AS mastered_cards,
          COALESCE(SUM(CASE WHEN u.box IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS seen_cards
        FROM cards c
        LEFT JOIN user_card_state u
          ON u.card_id = c.id AND u.user_id = $1
        GROUP BY c.unit_id
        ORDER BY c.unit_id ASC
      `,
      [user.id]
    );

    const unitMastery = (unitMasteryRows.rows as UnitMasteryRow[]).map((row) => ({
      unit_id: row.unit_id,
      total_cards: Number(row.total_cards ?? 0),
      seen_cards: Number(row.seen_cards ?? 0),
      mastered_cards: Number(row.mastered_cards ?? 0),
      mastery_ratio: Number(row.total_cards ?? 0) > 0 ? Number(row.mastered_cards ?? 0) / Number(row.total_cards ?? 0) : 0
    }));

    res.json({
      due_count: Number(dueRow.rows[0]?.due_count ?? 0),
      daily_points: Number(dailyRow.rows[0]?.points ?? 0),
      answers_today: Number(dailyRow.rows[0]?.answers_count ?? 0),
      unit_mastery: unitMastery
    });
  })
);

app.get(
  "/api/leaderboard",
  asyncHandler(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const range = parseLeaderboardRange(req.query?.range);
    const todayKey = utcDateString(new Date());
    const weekStartKey = shiftDateKey(todayKey, -6);

    let scoringCondition = "";
    let scoringBindings: Array<string> = [];
    if (range === "today") {
      scoringCondition = "AND ds.date = $2::date";
      scoringBindings = [todayKey];
    } else if (range === "week") {
      scoringCondition = "AND ds.date >= $2::date AND ds.date <= $3::date";
      scoringBindings = [weekStartKey, todayKey];
    }

    const pointRows =
      range === "all"
        ? await pool.query(
            `
              SELECT
                u.id AS user_id,
                u.display_name,
                COALESCE((
                  SELECT SUM(ds.points)
                  FROM daily_scores ds
                  WHERE ds.user_id = u.id
                ), 0)::int AS points,
                COALESCE((
                  SELECT COUNT(*)
                  FROM user_card_state s
                  WHERE s.user_id = u.id AND s.box = 4
                ), 0)::int AS mastered
              FROM users u
              WHERE u.room_id = $1
            `,
            [user.room_id]
          )
        : await pool.query(
            `
              SELECT
                u.id AS user_id,
                u.display_name,
                COALESCE((
                  SELECT SUM(ds.points)
                  FROM daily_scores ds
                  WHERE ds.user_id = u.id
                  ${scoringCondition}
                ), 0)::int AS points,
                COALESCE((
                  SELECT COUNT(*)
                  FROM user_card_state s
                  WHERE s.user_id = u.id AND s.box = 4
                ), 0)::int AS mastered
              FROM users u
              WHERE u.room_id = $1
            `,
            [user.room_id, ...scoringBindings]
          );

    const streakRows = await pool.query(
      `
        SELECT ds.user_id, ds.date::text AS date
        FROM daily_scores ds
        INNER JOIN users u ON u.id = ds.user_id
        WHERE u.room_id = $1 AND ds.points > 0
      `,
      [user.room_id]
    );

    const streakSets = new Map<string, Set<string>>();
    for (const row of streakRows.rows as StreakRow[]) {
      if (!streakSets.has(row.user_id)) {
        streakSets.set(row.user_id, new Set());
      }
      streakSets.get(row.user_id)!.add(row.date);
    }

    const leaderboard = (pointRows.rows as LeaderboardPointRow[])
      .map((row: LeaderboardPointRow) => {
        const activeDates = streakSets.get(row.user_id) ?? new Set<string>();
        return {
          display_name: row.display_name,
          points: Number(row.points ?? 0),
          mastered: Number(row.mastered ?? 0),
          streak: currentStreak(activeDates, todayKey)
        };
      })
      .sort((a: { display_name: string; points: number; mastered: number; streak: number }, b: { display_name: string; points: number; mastered: number; streak: number }) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.mastered !== a.mastered) return b.mastered - a.mastered;
        if (b.streak !== a.streak) return b.streak - a.streak;
        return a.display_name.localeCompare(b.display_name);
      });

    res.json({ range, rows: leaderboard });
  })
);

app.post(
  "/api/session/answer",
  asyncHandler(async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const cardId = typeof req.body?.card_id === "string" ? req.body.card_id.trim() : "";
    const choice = typeof req.body?.choice === "string" ? req.body.choice.trim().toUpperCase() : "";
    const responseMs = Number(req.body?.response_ms);

    if (!cardId) {
      res.status(400).json({ error: "card_id is required." });
      return;
    }
    if (!["A", "B", "C", "D"].includes(choice)) {
      res.status(400).json({ error: "choice must be one of A, B, C, D." });
      return;
    }
    if (!Number.isFinite(responseMs) || responseMs < 0) {
      res.status(400).json({ error: "response_ms must be a non-negative number." });
      return;
    }

    const cardRow = await pool.query(
      "SELECT id, correct_choice, explanation FROM cards WHERE id = $1 LIMIT 1",
      [cardId]
    );
    const card = cardRow.rows[0] as { id: string; correct_choice: string; explanation: string } | undefined;
    if (!card) {
      res.status(404).json({ error: "Card not found." });
      return;
    }

    const priorStateRow = await pool.query(
      `
        SELECT box, due_date, correct_streak, total_attempts
        FROM user_card_state
        WHERE user_id = $1 AND card_id = $2
        LIMIT 1
      `,
      [user.id, cardId]
    );
    const priorState = priorStateRow.rows[0] as
      | { box: number; due_date: string; correct_streak: number; total_attempts: number }
      | undefined;

    const isNewCard = !priorState;
    const correct = choice === card.correct_choice;
    const baseBox = priorState?.box ?? 1;
    const newBox = correct ? Math.min(4, baseBox + 1) : 1;
    const now = new Date();
    const reviewedAt = now.toISOString();
    const dueDate = addDaysIso(now, LEITNER_INTERVAL_DAYS[newBox]);
    const correctStreak = correct ? (priorState?.correct_streak ?? 0) + 1 : 0;
    const totalAttempts = (priorState?.total_attempts ?? 0) + 1;
    const requeueInSession = !correct;

    const dayKey = utcDateString(now);
    const dailyScoreRow = await pool.query(
      "SELECT points::int, answers_count::int FROM daily_scores WHERE user_id = $1 AND date = $2::date LIMIT 1",
      [user.id, dayKey]
    );
    const existingAnswersToday = Number(dailyScoreRow.rows[0]?.answers_count ?? 0);
    const scoringAllowed = existingAnswersToday < 60;
    const pointsAwarded = scoringAllowed && correct ? (isNewCard ? 1 : 2) : 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO reviews (user_id, card_id, timestamp, correct, choice, response_ms)
          VALUES ($1, $2, $3::timestamptz, $4, $5, $6)
        `,
        [user.id, cardId, reviewedAt, correct, choice, Math.floor(responseMs)]
      );

      await client.query(
        `
          INSERT INTO user_card_state
            (user_id, card_id, box, due_date, correct_streak, total_attempts, last_seen_at)
          VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::timestamptz)
          ON CONFLICT (user_id, card_id) DO UPDATE SET
            box = EXCLUDED.box,
            due_date = EXCLUDED.due_date,
            correct_streak = EXCLUDED.correct_streak,
            total_attempts = EXCLUDED.total_attempts,
            last_seen_at = EXCLUDED.last_seen_at
        `,
        [user.id, cardId, newBox, dueDate, correctStreak, totalAttempts, reviewedAt]
      );

      await client.query(
        `
          INSERT INTO daily_scores (user_id, date, points, answers_count)
          VALUES ($1, $2::date, $3, 1)
          ON CONFLICT (user_id, date) DO UPDATE SET
            points = daily_scores.points + EXCLUDED.points,
            answers_count = daily_scores.answers_count + 1
        `,
        [user.id, dayKey, pointsAwarded]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const updatedDailyScore = await pool.query(
      "SELECT points::int, answers_count::int FROM daily_scores WHERE user_id = $1 AND date = $2::date LIMIT 1",
      [user.id, dayKey]
    );

    res.json({
      card_id: cardId,
      is_new_card: isNewCard,
      correct,
      explanation: card.explanation,
      new_box: newBox,
      due_date: dueDate,
      requeue_in_session: requeueInSession,
      points_awarded: pointsAwarded,
      daily_points: Number(updatedDailyScore.rows[0]?.points ?? pointsAwarded),
      answers_today: Number(updatedDailyScore.rows[0]?.answers_count ?? existingAnswersToday + 1)
    });
  })
);

app.get(
  "/api/db-check",
  asyncHandler(async (_req, res) => {
    await pool.query("SELECT 1 AS alive");
    res.json({ ok: true, db: "reachable" });
  })
);

const resolveWebDistDir = (): string | null => {
  const candidates = [
    process.env.WEB_DIST_DIR,
    // Render build from repo root.
    path.resolve(process.cwd(), "apps/web/dist"),
    // Running from apps/server.
    path.resolve(process.cwd(), "../web/dist")
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    const indexPath = path.join(candidate, "index.html");
    if (fs.existsSync(indexPath)) return candidate;
  }
  return null;
};

const webDistDir = resolveWebDistDir();
if (webDistDir) {
  // Serve the built SPA alongside the API from one host (simplest for Render).
  app.use(express.static(webDistDir, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webDistDir, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${port}`);
});
