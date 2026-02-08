interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  COOKIE_NAME: string;
  SESSION_SECRET: string;
}

interface SessionPayload {
  userId: string;
  roomId: string;
  displayName: string;
  issuedAt: number;
}

interface AuthenticatedUser {
  id: string;
  display_name: string;
  room_id: string;
  created_at: string;
}

interface StartSessionBody {
  unit_id?: string;
  size?: number;
}

interface AnswerBody {
  card_id?: string;
  choice?: string;
  response_ms?: number;
}

const json = (data: unknown, status = 200, extraHeaders?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });

const corsHeaders = (origin: string): HeadersInit => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  vary: "origin"
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const fromBase64Url = (input: string): Uint8Array => {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importSigningKey = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

const createSessionToken = async (payload: SessionPayload, secret: string): Promise<string> => {
  const key = await importSigningKey(secret);
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const payloadPart = toBase64Url(payloadBytes);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textEncoder.encode(payloadPart))
  );
  const sigPart = toBase64Url(sigBytes);
  return `${payloadPart}.${sigPart}`;
};

const verifySessionToken = async (
  token: string,
  secret: string
): Promise<SessionPayload | null> => {
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) {
    return null;
  }
  const key = await importSigningKey(secret);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(sigPart),
    textEncoder.encode(payloadPart)
  );
  if (!verified) {
    return null;
  }
  try {
    const payload = JSON.parse(textDecoder.decode(fromBase64Url(payloadPart))) as SessionPayload;
    if (!payload.userId || !payload.roomId || !payload.displayName || !payload.issuedAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) return acc;
    acc[rawKey] = rest.join("=");
    return acc;
  }, {});
};

const sessionCookie = (cookieName: string, token: string, secure: boolean): string => {
  const maxAge = 60 * 60 * 24 * 30;
  const securePart = secure ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly${securePart}; SameSite=Lax; Max-Age=${maxAge}`;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const normalizeRoomCode = (value: string): string => value.trim().toUpperCase();
const normalizeDisplayName = (value: string): string => value.trim();

const getSessionFromRequest = async (request: Request, env: Env): Promise<SessionPayload | null> => {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[env.COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token, env.SESSION_SECRET);
};

const getAuthenticatedUser = async (
  request: Request,
  env: Env
): Promise<AuthenticatedUser | null> => {
  const session = await getSessionFromRequest(request, env);
  if (!session) return null;
  return env.DB.prepare(
    "SELECT id, display_name, room_id, created_at FROM users WHERE id = ?1 AND room_id = ?2 LIMIT 1"
  )
    .bind(session.userId, session.roomId)
    .first<AuthenticatedUser>();
};

const clampSessionSize = (input: unknown): number => {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return 10;
  return Math.min(20, Math.max(10, Math.floor(parsed)));
};

const parseChoices = (value: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return parsed;
  } catch {
    return {};
  }
};

const LEITNER_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 21
};

const addDaysIso = (base: Date, days: number): string => {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

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

type LeaderboardRange = "today" | "week" | "all";
const parseLeaderboardRange = (value: string | null): LeaderboardRange => {
  if (value === "week" || value === "all") return value;
  return "today";
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("origin");
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const origin = requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;

    if (!env.SESSION_SECRET || env.SESSION_SECRET.trim().length < 16) {
      return json(
        { error: "SESSION_SECRET is not configured." },
        500,
        corsHeaders(origin)
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const { pathname } = url;

    if (pathname === "/api/health" && request.method === "GET") {
      return json(
        {
          ok: true,
          service: "grammar-trainer-api"
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/login" && request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON." }, 400, corsHeaders(origin));
      }

      const roomCode = normalizeRoomCode(
        typeof body === "object" && body !== null ? String((body as Record<string, unknown>).room_code ?? "") : ""
      );
      const displayName = normalizeDisplayName(
        typeof body === "object" && body !== null
          ? String((body as Record<string, unknown>).display_name ?? "")
          : ""
      );

      if (!roomCode || roomCode.length < 4 || roomCode.length > 32) {
        return json(
          { error: "room_code must be 4-32 characters." },
          400,
          corsHeaders(origin)
        );
      }

      if (!displayName || displayName.length < 2 || displayName.length > 32) {
        return json(
          { error: "display_name must be 2-32 characters." },
          400,
          corsHeaders(origin)
        );
      }

      const roomHash = await sha256Hex(roomCode);
      let room = await env.DB.prepare(
        "SELECT id FROM rooms WHERE room_code_hash = ?1 LIMIT 1"
      )
        .bind(roomHash)
        .first<{ id: string }>();

      if (!room) {
        const roomId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT OR IGNORE INTO rooms (id, room_code_hash) VALUES (?1, ?2)"
        )
          .bind(roomId, roomHash)
          .run();
        room = await env.DB.prepare(
          "SELECT id FROM rooms WHERE room_code_hash = ?1 LIMIT 1"
        )
          .bind(roomHash)
          .first<{ id: string }>();
      }

      if (!room) {
        return json({ error: "Could not create room." }, 500, corsHeaders(origin));
      }

      let user = await env.DB.prepare(
        "SELECT id, display_name, room_id FROM users WHERE room_id = ?1 AND display_name = ?2 COLLATE NOCASE LIMIT 1"
      )
        .bind(room.id, displayName)
        .first<{ id: string; display_name: string; room_id: string }>();

      if (!user) {
        const userId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT OR IGNORE INTO users (id, display_name, room_id) VALUES (?1, ?2, ?3)"
        )
          .bind(userId, displayName, room.id)
          .run();
        user = await env.DB.prepare(
          "SELECT id, display_name, room_id FROM users WHERE room_id = ?1 AND display_name = ?2 COLLATE NOCASE LIMIT 1"
        )
          .bind(room.id, displayName)
          .first<{ id: string; display_name: string; room_id: string }>();
      }

      if (!user) {
        return json({ error: "Could not create user." }, 500, corsHeaders(origin));
      }

      const payload: SessionPayload = {
        userId: user.id,
        roomId: user.room_id,
        displayName: user.display_name,
        issuedAt: Date.now()
      };

      const token = await createSessionToken(payload, env.SESSION_SECRET);
      return json(
        {
          ok: true,
          user_id: user.id,
          display_name: user.display_name,
          room_id: user.room_id
        },
        200,
        {
          ...corsHeaders(origin),
          "set-cookie": sessionCookie(
            env.COOKIE_NAME,
            token,
            url.protocol === "https:"
          )
        }
      );
    }

    if (pathname === "/api/me" && request.method === "GET") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) {
        return json({ error: "Unauthorized" }, 401, corsHeaders(origin));
      }

      return json(
        {
          id: user.id,
          display_name: user.display_name,
          room_id: user.room_id,
          created_at: user.created_at
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/session/start" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) {
        return json({ error: "Unauthorized" }, 401, corsHeaders(origin));
      }

      let body: StartSessionBody = {};
      try {
        body = (await request.json()) as StartSessionBody;
      } catch {
        // Use defaults if body is missing or invalid JSON.
      }

      const unitId =
        typeof body.unit_id === "string" && body.unit_id.trim().length > 0
          ? body.unit_id.trim()
          : null;
      const size = clampSessionSize(body.size);
      const now = new Date().toISOString();

      const dueCards = await env.DB.prepare(
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
          WHERE u.user_id = ?1
            AND (?2 IS NULL OR c.unit_id = ?2)
            AND u.due_date <= ?3
          ORDER BY u.due_date ASC
          LIMIT ?4
        `
      )
        .bind(user.id, unitId, now, size)
        .all<{
          id: string;
          unit_id: string;
          subtopic: string;
          prompt: string;
          choices_json: string;
          explanation: string;
          difficulty: number;
          current_box: number;
          due_date: string;
          source: "due";
        }>();

      const dueResults = dueCards.results ?? [];
      const remainingAfterDue = Math.max(0, size - dueResults.length);
      const newLimit = Math.min(5, remainingAfterDue);

      const newCards =
        newLimit > 0
          ? await env.DB.prepare(
              `
                SELECT
                  c.id,
                  c.unit_id,
                  c.subtopic,
                  c.prompt,
                  c.choices_json,
                  c.explanation,
                  c.difficulty,
                  NULL AS current_box,
                  NULL AS due_date,
                  'new' AS source
                FROM cards c
                LEFT JOIN user_card_state u
                  ON c.id = u.card_id AND u.user_id = ?1
                WHERE u.card_id IS NULL
                  AND (?2 IS NULL OR c.unit_id = ?2)
                ORDER BY c.difficulty ASC, c.id ASC
                LIMIT ?3
              `
            )
              .bind(user.id, unitId, newLimit)
              .all<{
                id: string;
                unit_id: string;
                subtopic: string;
                prompt: string;
                choices_json: string;
                explanation: string;
                difficulty: number;
                current_box: null;
                due_date: null;
                source: "new";
              }>()
          : { results: [] };

      const newResults = newCards.results ?? [];
      const remainingAfterNew = Math.max(0, size - dueResults.length - newResults.length);

      const nearDueCards =
        remainingAfterNew > 0
          ? await env.DB.prepare(
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
                WHERE u.user_id = ?1
                  AND (?2 IS NULL OR c.unit_id = ?2)
                  AND u.due_date > ?3
                ORDER BY u.due_date ASC
                LIMIT ?4
              `
            )
              .bind(user.id, unitId, now, remainingAfterNew)
              .all<{
                id: string;
                unit_id: string;
                subtopic: string;
                prompt: string;
                choices_json: string;
                explanation: string;
                difficulty: number;
                current_box: number;
                due_date: string;
                source: "near_due";
              }>()
          : { results: [] };

      const nearDueResults = nearDueCards.results ?? [];

      const cards = [...dueResults, ...newResults, ...nearDueResults].map((card) => ({
        id: card.id,
        unit_id: card.unit_id,
        subtopic: card.subtopic,
        prompt: card.prompt,
        choices: parseChoices(card.choices_json),
        explanation: card.explanation,
        difficulty: card.difficulty,
        source: card.source,
        current_box: card.current_box,
        due_date: card.due_date
      }));

      return json(
        {
          session_size: size,
          unit_id: unitId,
          counts: {
            due: dueResults.length,
            new: newResults.length,
            near_due: nearDueResults.length
          },
          cards
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/dashboard" && request.method === "GET") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) {
        return json({ error: "Unauthorized" }, 401, corsHeaders(origin));
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const todayKey = utcDateString(now);

      const dueRow = await env.DB.prepare(
        "SELECT COUNT(*) AS due_count FROM user_card_state WHERE user_id = ?1 AND due_date <= ?2"
      )
        .bind(user.id, nowIso)
        .first<{ due_count: number }>();

      const dailyRow = await env.DB.prepare(
        "SELECT points, answers_count FROM daily_scores WHERE user_id = ?1 AND date = ?2 LIMIT 1"
      )
        .bind(user.id, todayKey)
        .first<{ points: number; answers_count: number }>();

      const unitMasteryRows = await env.DB.prepare(
        `
          SELECT
            c.unit_id,
            COUNT(c.id) AS total_cards,
            COALESCE(SUM(CASE WHEN u.box = 4 THEN 1 ELSE 0 END), 0) AS mastered_cards,
            COALESCE(SUM(CASE WHEN u.box IS NOT NULL THEN 1 ELSE 0 END), 0) AS seen_cards
          FROM cards c
          LEFT JOIN user_card_state u
            ON u.card_id = c.id AND u.user_id = ?1
          GROUP BY c.unit_id
          ORDER BY c.unit_id ASC
        `
      )
        .bind(user.id)
        .all<{
          unit_id: string;
          total_cards: number;
          mastered_cards: number;
          seen_cards: number;
        }>();

      const unitMastery = (unitMasteryRows.results ?? []).map((row) => ({
        unit_id: row.unit_id,
        total_cards: Number(row.total_cards ?? 0),
        seen_cards: Number(row.seen_cards ?? 0),
        mastered_cards: Number(row.mastered_cards ?? 0),
        mastery_ratio:
          Number(row.total_cards ?? 0) > 0
            ? Number(row.mastered_cards ?? 0) / Number(row.total_cards ?? 0)
            : 0
      }));

      return json(
        {
          due_count: Number(dueRow?.due_count ?? 0),
          daily_points: Number(dailyRow?.points ?? 0),
          answers_today: Number(dailyRow?.answers_count ?? 0),
          unit_mastery: unitMastery
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/leaderboard" && request.method === "GET") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) {
        return json({ error: "Unauthorized" }, 401, corsHeaders(origin));
      }

      const range = parseLeaderboardRange(url.searchParams.get("range"));
      const todayKey = utcDateString(new Date());
      const weekStartKey = shiftDateKey(todayKey, -6);

      let scoringCondition = "";
      let scoringBindings: Array<string> = [];
      if (range === "today") {
        scoringCondition = "AND ds.date = ?2";
        scoringBindings = [todayKey];
      } else if (range === "week") {
        scoringCondition = "AND ds.date >= ?2 AND ds.date <= ?3";
        scoringBindings = [weekStartKey, todayKey];
      }

      const pointRows =
        range === "all"
          ? await env.DB.prepare(
              `
                SELECT
                  u.id AS user_id,
                  u.display_name,
                  COALESCE((
                    SELECT SUM(ds.points)
                    FROM daily_scores ds
                    WHERE ds.user_id = u.id
                  ), 0) AS points,
                  COALESCE((
                    SELECT COUNT(*)
                    FROM user_card_state s
                    WHERE s.user_id = u.id AND s.box = 4
                  ), 0) AS mastered
                FROM users u
                WHERE u.room_id = ?1
              `
            )
              .bind(user.room_id)
              .all<{
                user_id: string;
                display_name: string;
                points: number;
                mastered: number;
              }>()
          : await env.DB.prepare(
              `
                SELECT
                  u.id AS user_id,
                  u.display_name,
                  COALESCE((
                    SELECT SUM(ds.points)
                    FROM daily_scores ds
                    WHERE ds.user_id = u.id
                    ${scoringCondition}
                  ), 0) AS points,
                  COALESCE((
                    SELECT COUNT(*)
                    FROM user_card_state s
                    WHERE s.user_id = u.id AND s.box = 4
                  ), 0) AS mastered
                FROM users u
                WHERE u.room_id = ?1
              `
            )
              .bind(user.room_id, ...scoringBindings)
              .all<{
                user_id: string;
                display_name: string;
                points: number;
                mastered: number;
              }>();

      const streakRows = await env.DB.prepare(
        `
          SELECT ds.user_id, ds.date
          FROM daily_scores ds
          INNER JOIN users u ON u.id = ds.user_id
          WHERE u.room_id = ?1 AND ds.points > 0
        `
      )
        .bind(user.room_id)
        .all<{ user_id: string; date: string }>();

      const streakSets = new Map<string, Set<string>>();
      for (const row of streakRows.results ?? []) {
        if (!streakSets.has(row.user_id)) {
          streakSets.set(row.user_id, new Set());
        }
        streakSets.get(row.user_id)!.add(row.date);
      }

      const leaderboard = (pointRows.results ?? [])
        .map((row) => {
          const activeDates = streakSets.get(row.user_id) ?? new Set<string>();
          return {
            display_name: row.display_name,
            points: Number(row.points ?? 0),
            mastered: Number(row.mastered ?? 0),
            streak: currentStreak(activeDates, todayKey)
          };
        })
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.mastered !== a.mastered) return b.mastered - a.mastered;
          if (b.streak !== a.streak) return b.streak - a.streak;
          return a.display_name.localeCompare(b.display_name);
        });

      return json(
        {
          range,
          rows: leaderboard
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/session/answer" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) {
        return json({ error: "Unauthorized" }, 401, corsHeaders(origin));
      }

      let body: AnswerBody;
      try {
        body = (await request.json()) as AnswerBody;
      } catch {
        return json({ error: "Request body must be valid JSON." }, 400, corsHeaders(origin));
      }

      const cardId = typeof body.card_id === "string" ? body.card_id.trim() : "";
      const choice = typeof body.choice === "string" ? body.choice.trim().toUpperCase() : "";
      const responseMs = Number(body.response_ms);

      if (!cardId) {
        return json({ error: "card_id is required." }, 400, corsHeaders(origin));
      }
      if (!["A", "B", "C", "D"].includes(choice)) {
        return json({ error: "choice must be one of A, B, C, D." }, 400, corsHeaders(origin));
      }
      if (!Number.isFinite(responseMs) || responseMs < 0) {
        return json({ error: "response_ms must be a non-negative number." }, 400, corsHeaders(origin));
      }

      const card = await env.DB.prepare(
        "SELECT id, correct_choice, explanation FROM cards WHERE id = ?1 LIMIT 1"
      )
        .bind(cardId)
        .first<{ id: string; correct_choice: string; explanation: string }>();

      if (!card) {
        return json({ error: "Card not found." }, 404, corsHeaders(origin));
      }

      const priorState = await env.DB.prepare(
        `
          SELECT box, due_date, correct_streak, total_attempts
          FROM user_card_state
          WHERE user_id = ?1 AND card_id = ?2
          LIMIT 1
        `
      )
        .bind(user.id, cardId)
        .first<{
          box: number;
          due_date: string;
          correct_streak: number;
          total_attempts: number;
        }>();

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
      const dailyScoreRow = await env.DB.prepare(
        "SELECT points, answers_count FROM daily_scores WHERE user_id = ?1 AND date = ?2 LIMIT 1"
      )
        .bind(user.id, dayKey)
        .first<{ points: number; answers_count: number }>();

      const existingAnswersToday = dailyScoreRow?.answers_count ?? 0;
      const scoringAllowed = existingAnswersToday < 60;
      const pointsAwarded = scoringAllowed && correct ? (isNewCard ? 1 : 2) : 0;

      const statements = [
        env.DB.prepare(
          `
            INSERT INTO reviews (user_id, card_id, timestamp, correct, choice, response_ms)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
          `
        ).bind(user.id, cardId, reviewedAt, correct ? 1 : 0, choice, Math.floor(responseMs)),
        env.DB.prepare(
          `
            INSERT INTO user_card_state
              (user_id, card_id, box, due_date, correct_streak, total_attempts, last_seen_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(user_id, card_id) DO UPDATE SET
              box = excluded.box,
              due_date = excluded.due_date,
              correct_streak = excluded.correct_streak,
              total_attempts = excluded.total_attempts,
              last_seen_at = excluded.last_seen_at
          `
        ).bind(user.id, cardId, newBox, dueDate, correctStreak, totalAttempts, reviewedAt),
        env.DB.prepare(
          `
            INSERT INTO daily_scores (user_id, date, points, answers_count)
            VALUES (?1, ?2, ?3, 1)
            ON CONFLICT(user_id, date) DO UPDATE SET
              points = points + ?3,
              answers_count = answers_count + 1
          `
        ).bind(user.id, dayKey, pointsAwarded)
      ];

      await env.DB.batch(statements);

      const updatedDailyScore = await env.DB.prepare(
        "SELECT points, answers_count FROM daily_scores WHERE user_id = ?1 AND date = ?2 LIMIT 1"
      )
        .bind(user.id, dayKey)
        .first<{ points: number; answers_count: number }>();

      return json(
        {
          card_id: cardId,
          is_new_card: isNewCard,
          correct,
          explanation: card.explanation,
          new_box: newBox,
          due_date: dueDate,
          requeue_in_session: requeueInSession,
          points_awarded: pointsAwarded,
          daily_points: updatedDailyScore?.points ?? pointsAwarded,
          answers_today: updatedDailyScore?.answers_count ?? existingAnswersToday + 1
        },
        200,
        corsHeaders(origin)
      );
    }

    if (pathname === "/api/db-check" && request.method === "GET") {
      const row = await env.DB.prepare("SELECT 1 AS alive").first<{ alive: number }>();
      return json(
        {
          ok: row?.alive === 1,
          db: "reachable"
        },
        200,
        corsHeaders(origin)
      );
    }

    return json({ error: "Not found" }, 404, corsHeaders(origin));
  }
};
