# 📄 DEV SPEC SHEET

**Project:** SAT/ACT Grammar Skills Trainer (Spaced Repetition + Leaderboard)
**Platform:** Phone-only web app
**Hosting:** Cloudflare Pages + Cloudflare Worker + D1
**Users:** ~4 concurrent users

---

# 1) Product Goal

Build a lightweight web app that trains SAT/ACT grammar skills using:

* Unit-based progression
* Spaced repetition review (Anki-style)
* Immediate feedback
* Simple leaderboard

Content will be derived from an external research document outlining grammar competencies.

---

# 2) Core User Flow

### First Launch

1. User enters **Room Code**
2. Selects or creates **Display Name**
3. Worker creates `user_id`
4. Session cookie stored

(No passwords. Identity stored server-side.)

---

### Daily Use Flow

1. Home screen → shows:

   * “Start Practice”
   * Leaderboard
   * Due review count

2. Practice session:

   * 10–20 questions
   * Mix of:

     * Due reviews
     * New cards
   * Instant feedback

3. Session summary:

   * Correct %
   * Points earned
   * Cards requeued

---

# 3) Units / Skills Structure

Content will be organized from supplied research document.

### Initial Units

1. Sentence Boundaries
2. Punctuation Hierarchy
3. Agreement & Consistency
4. Modifiers
5. Parallelism
6. Transitions & Rhetoric
7. Concision / Economy
8. Diction & Idioms

Each unit contains subtopics + cards.

---

# 4) Card Types (MVP)

All multiple choice.

### Type A — Revision

“Which version fixes the error?”

### Type B — Error ID

Select which underlined section is wrong.

### Type C — Best Choice

Transition / concision / rhetoric decisions.

Free-response is out of scope for MVP.

---

# 5) Spaced Repetition System

Use **Leitner boxes**.

| Box | Interval |
| --- | -------- |
| 1   | 1 day    |
| 2   | 3 days   |
| 3   | 7 days   |
| 4   | 21 days  |

Rules:

* Correct → move up one box
* Wrong → reset to Box 1
* Wrong cards reappear later in same session

---

# 6) Leaderboard System

### Scoring

* +2 correct review
* +1 correct new card
* 0 wrong
* Cap scoring at first 60 answers/day

### Views

* Today
* This week
* All-time mastery

### Additional stats

* Mastered cards (Box 4)
* Units unlocked

---

# 7) Data Model (Cloudflare D1)

### users

```
id (text, pk)
display_name
room_id
created_at
```

### rooms

```
id
room_code_hash
```

### cards

```
id
unit_id
subtopic
prompt
choices_json
correct_choice
explanation
difficulty
tags_json
```

### user_card_state

```
user_id
card_id
box
due_date
correct_streak
total_attempts
last_seen_at
```

### reviews

```
user_id
card_id
timestamp
correct
choice
response_ms
```

### daily_scores

```
user_id
date
points
```

---

# 8) API Endpoints (Worker)

### Auth / Identity

`POST /api/login`

```
{ room_code, display_name }
```

Returns cookie session.

---

### Practice

`POST /api/session/start`

```
{ unit_id, size }
```

Selection logic:

1. Due cards
2. New cards (max 5)
3. Near-due fill

---

`POST /api/session/answer`

```
{ card_id, choice, response_ms }
```

Worker:

* Scores answer
* Updates Leitner box
* Logs review
* Updates daily points

Returns:

```
{ correct, explanation, new_box }
```

---

### Dashboard

`GET /api/dashboard`
Returns:

* Due count
* Unit mastery
* Daily points

---

### Leaderboard

`GET /api/leaderboard?range=today|week|all`

Returns sorted rows:

```
display_name
points
mastered
streak
```

---

# 9) Frontend Screens (Phone-First)

### 1. Login / Name Picker

* Enter room code
* Pick name

### 2. Home

* Start Practice
* Leaderboard
* Due count

### 3. Practice Card

* Prompt
* 4 choices
* Tap answer
* Instant feedback + explanation

### 4. Session Summary

* Score
* Weak skills

### 5. Leaderboard

* Tabs: Today / Week / All-time

---

# 10) Content Ingestion

Developer should build:

### CSV / JSON uploader

Fields:

```
unit
subtopic
prompt
choice_a
choice_b
choice_c
choice_d
correct
explanation
difficulty
tags
```

Content will be derived from supplied research doc.

---

# 11) Tech Stack

### Frontend

* React SPA (or Next static export)
* Tailwind

### Hosting

* Cloudflare Pages

### Backend

* Cloudflare Worker

### Database

* Cloudflare D1

### Auth

* Room code + display name
* Session cookie

---

# 12) Non-Goals (MVP exclusions)

Do NOT build yet:

* Free response grading
* AI explanations
* Teacher dashboards
* Multi-room analytics
* Desktop UI
* Adaptive difficulty modeling beyond Leitner

---

# 13) Build Order (Dev Tickets)

1. Repo + Pages deploy
2. Worker hello-world
3. D1 schema + migrations
4. Login + session cookie
5. Card fetch endpoint
6. Answer submission logic
7. Leitner scheduling
8. Practice UI
9. Dashboard counts
10. Leaderboard
11. CSV uploader
12. Unit unlock logic

---

# 14) Success Criteria

App is “done” when:

* 4 users can log in via room code
* Each has persistent progress
* Due reviews schedule correctly
* Leaderboard updates daily
* Units unlock via mastery

