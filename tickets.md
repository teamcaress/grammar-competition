# SAT/ACT Grammar Trainer Ticket Backlog

This backlog is organized into two lanes:
- App lane (blocking path to MVP launch)
- Content lane (parallelizable from day 1)

Status legend: `todo`, `in_progress`, `done`, `blocked`

## Milestone 1: Core Platform + First Playable Session

### T-001: Project Scaffold + Environments
- Status: `done`
- Owner: `app`
- Depends on: none
- Scope:
  - Initialize frontend (phone-first React + Tailwind) and Worker API.
  - Configure Cloudflare Pages + Worker + D1 bindings for local/dev/prod.
  - Add `.dev.vars.example` and README run instructions.
- Acceptance criteria:
  - `npm run dev` (or equivalent) runs frontend + API locally.
  - Worker can read/write D1 in local dev.
  - Deployment config files are committed.

### T-002: D1 Schema + Migrations
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-001`
- Scope:
  - Create migration(s) for tables from spec: `users`, `rooms`, `cards`, `user_card_state`, `reviews`, `daily_scores`.
  - Add indexes for due-card queries and leaderboard aggregation.
- Acceptance criteria:
  - Fresh DB bootstraps from migrations with no manual SQL.
  - Query plan for due cards and leaderboard is index-backed.

### T-003: Login + Session Cookie
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-002`
- Scope:
  - Implement `POST /api/login` with `{ room_code, display_name }`.
  - Create/find room and user record; set signed session cookie.
  - Add auth middleware for protected API routes.
- Acceptance criteria:
  - Returning user keeps same identity across sessions.
  - Invalid/missing cookie blocks protected routes.

### T-004: Practice Session Start Endpoint
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-003`, `T-002`
- Scope:
  - Implement `POST /api/session/start` with selection priority:
    1) due cards
    2) new cards (max 5)
    3) near-due fill
  - Support configurable session size (10-20).
- Acceptance criteria:
  - Endpoint returns deterministic card list shape and metadata.
  - New cards per session never exceed configured cap.

### T-005: Answer Submission + Leitner Update
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-004`
- Scope:
  - Implement `POST /api/session/answer` with:
    - correctness check
    - review log insert
    - Leitner move rules (1d/3d/7d/21d)
    - wrong answer reset to box 1
    - same-session wrong-card requeue signal
  - Return `{ correct, explanation, new_box }`.
- Acceptance criteria:
  - Box transitions and due dates match spec for all outcomes.
  - Review rows and user card state updates are atomic.

### T-006: Daily Scoring + Cap Logic
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-005`
- Scope:
  - Award points: +2 correct review, +1 correct new.
  - Enforce first-60-answers/day scoring cap.
  - Upsert `daily_scores`.
- Acceptance criteria:
  - Scores stop increasing after answer #60 in local date window.
  - Repeated calls on same answer payload are idempotent-safe.

### T-007: Login + Name Picker Screen (Mobile)
- Status: `in_progress`
- Owner: `frontend`
- Depends on: `T-003`
- Scope:
  - Build login UI with room code + display name.
  - Persist auth state after successful login.
- Acceptance criteria:
  - User can enter app without manual refresh hacks.
  - Basic client-side validation and API error states exist.

### T-008: Practice Card UI + Feedback Loop
- Status: `in_progress`
- Owner: `frontend`
- Depends on: `T-004`, `T-005`, `T-007`
- Scope:
  - Render prompt + 4 choices.
  - Submit answers and show instant correctness + explanation.
  - Advance through 10-20 card session.
- Acceptance criteria:
  - No double-submit race issues.
  - Card progression reflects API responses reliably.

### T-009: Session Summary Screen
- Status: `in_progress`
- Owner: `frontend`
- Depends on: `T-008`, `T-006`
- Scope:
  - Show correct %, points earned, weak-skill highlights.
- Acceptance criteria:
  - Summary numbers match server-tracked results.

## Milestone 2: Dashboard + Leaderboard + Unlocks

### T-010: Dashboard Endpoint
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-006`
- Scope:
  - Implement `GET /api/dashboard`:
    - due count
    - unit mastery
    - daily points
- Acceptance criteria:
  - Response supports home screen without extra requests.

### T-011: Leaderboard Endpoint
- Status: `in_progress`
- Owner: `backend`
- Depends on: `T-006`
- Scope:
  - Implement `GET /api/leaderboard?range=today|week|all`.
  - Return sorted rows: display_name, points, mastered, streak.
- Acceptance criteria:
  - Range logic and ordering match spec.
  - Ties handled deterministically.

### T-012: Home + Leaderboard Screens
- Status: `in_progress`
- Owner: `frontend`
- Depends on: `T-010`, `T-011`, `T-007`
- Scope:
  - Home: Start Practice, due count, points snapshot.
  - Leaderboard: tabs for Today / Week / All-time.
- Acceptance criteria:
  - Tab switches do not break scroll/state on mobile.
  - Empty states are graceful.

### T-013: Unit Unlock Logic
- Status: `todo`
- Owner: `backend`
- Depends on: `T-005`, `T-010`
- Scope:
  - Implement unlocking based on mastery threshold (to be finalized).
  - Expose unlock status in dashboard/session start responses.
- Acceptance criteria:
  - Locked units cannot be started via API.
  - Newly unlocked units appear immediately after qualifying review.

## Milestone 3: Content Pipeline (Parallel Lane)

### T-014: Card Schema + Import Contract
- Status: `done`
- Owner: `content/backend`
- Depends on: `T-002`
- Scope:
  - Finalize JSON/CSV schema fields from `spec-sheet.md`.
  - Define validation rules (required fields, choices, difficulty bounds).
- Acceptance criteria:
  - One canonical schema doc checked into repo.
  - Invalid rows fail with actionable errors.

### T-015: Seed Card Generation (By Unit)
- Status: `in_progress`
- Owner: `content`
- Depends on: `T-014`
- Scope:
  - Use card-generation prompt from `cards.md`.
  - Incorporate ACT-specific patterns from `resources/act-prep.md` via `docs/act-prep-carding-guide.md`.
  - Follow coverage requirements in `docs/satact-content-blueprint.md`.
  - Create seed set for 8 units with balanced difficulty.
- Acceptance criteria:
  - Each blueprint subtopic has at least 8 seed cards.
  - Every card maps to one allowed domain/subtopic.
  - Card metadata includes `exam_targets` and `skill_code`.

### T-016: Card Expansion (Variations)
- Status: `in_progress`
- Owner: `content`
- Depends on: `T-015`
- Scope:
  - Generate easier + harder variations per source card.
- Acceptance criteria:
  - Variations preserve rule while changing wording/context.
  - Difficulty labels are internally consistent.

### T-017: Dataset QA Audit + Fix Pass
- Status: `todo`
- Owner: `content`
- Depends on: `T-015`, `T-016`
- Scope:
  - Run QA auditor prompt from `cards.md`.
  - Run blueprint coverage checks from `docs/satact-content-blueprint.md`.
  - Resolve all high-severity flags before import.
- Acceptance criteria:
  - Zero high-severity ambiguous/incorrect cards.
  - Coverage requirements pass for all competency families.
  - Audit log retained for traceability.

### T-018: Importer Tool (CSV/JSON -> D1)
- Status: `todo`
- Owner: `backend`
- Depends on: `T-014`, `T-017`
- Scope:
  - Build ingestion script/uploader into `cards` table.
  - Add duplicate detection and id strategy.
- Acceptance criteria:
  - Import is repeatable without duplicating identical cards.
  - Post-import validation reports card counts by unit/subtopic.

## Milestone 4: Hardening + Launch

### T-019: End-to-End QA (4 Concurrent Users)
- Status: `todo`
- Owner: `qa`
- Depends on: `T-009`, `T-012`, `T-018`, `T-013`
- Scope:
  - Validate login, persistence, due scheduling, requeues, scoring cap.
  - Simulate 4 concurrent users in same room.
- Acceptance criteria:
  - No data corruption or session crossover.
  - Leaderboard and dashboard reflect recent activity within expected latency.

### T-020: Launch Checklist + Smoke Tests
- Status: `todo`
- Owner: `app`
- Depends on: `T-019`
- Scope:
  - Production env vars/bindings check.
  - Migration runbook and rollback notes.
  - Post-deploy smoke script.
- Acceptance criteria:
  - New deploy can be verified in <10 minutes.
  - MVP success criteria in spec are all test-passed.

## Parallelization Plan

Run these tracks in parallel from the start:
- Track A (App critical path): `T-001 -> T-006 -> T-007 -> T-009 -> T-010/T-011 -> T-012 -> T-013 -> T-019 -> T-020`
- Track B (Content): `T-014 -> T-015 -> T-016 -> T-017 -> T-018`

Primary join point:
- `T-018` must complete before realistic full-session QA (`T-019`).

## Immediate Next 5 Tickets

1. `T-002` D1 Schema + Migrations
2. `T-003` Login + Session Cookie
3. `T-004` Practice Session Start Endpoint
4. `T-015` Seed Card Generation (parallel)
5. `T-005` Answer Submission + Leitner Update
