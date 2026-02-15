# Challenges Screen Design

**Date:** 2026-02-15
**Status:** Approved

## Problem Statement

Users currently have limited visibility into challenges:
- Pending challenges appear embedded in home screen (easy to miss)
- No way to see challenges you've sent
- Completed challenge results only visible once in summary screen
- No challenge history or winner indication

## Solution Overview

Create a dedicated challenges screen with two main sections:
1. **Active** - pending challenges to accept + sent challenges waiting for opponent + create button
2. **History** - completed challenges with visual winner highlights

Add notifications to home screen (badge + preview card) so users know when they've been challenged.

## Navigation & Structure

### App Stage Changes
- **Remove:** `"challenge-pick"` stage (opponent picker)
- **Add:** `"challenges"` stage
- **Updated type:** `"login" | "welcome" | "home" | "practice" | "summary" | "leaderboard" | "challenges"`

### Navigation Flow
```
Home → "Challenge a Player (N)" button → Challenges Screen
                                              ├─ Active Tab
                                              │   ├─ Pending (to accept)
                                              │   ├─ Sent (waiting)
                                              │   └─ Create button
                                              └─ History Tab
                                                  └─ Completed (with winners)
```

### State Requirements
**Keep existing:**
- `pendingChallenges: Challenge[]` - challenges where you're opponent, status "open"

**Add new:**
- `sentChallenges: Challenge[]` - challenges where you're creator, status "open"
- `completedChallenges: Challenge[]` - all completed challenges

**Backend API:**
- Use existing `getUserChallenges` endpoint
- Filter on frontend: sent = challenges where `creator === userName && status === "open"`
- Alternatively: modify backend to return `{pending, sent, completed}` (cleaner, but requires deployment)

## Active Section Design

### Structure
Three subsections displayed vertically:

#### 1. Pending Challenges (Action Required)
- List of challenges where user is the opponent
- **Card content:**
  - "{Creator} challenged you!"
  - "10 cards"
  - Tap → starts practice session with those cards
- **Visual:** Amber background (`bg-amber-50`), amber border (`ring-amber-200`)
- **Empty state:** "No pending challenges"

#### 2. Sent Challenges (Waiting for Opponent)
- List of challenges where user is the creator
- **Card content:**
  - "Waiting for {Opponent}"
  - "10 cards · Sent {date}"
  - No tap action (informational only)
- **Visual:** Light gray background (`bg-slate-50`), slate border (`ring-slate-200`)
- **Empty state:** Hide this subsection entirely

#### 3. Create New Challenge
- Button at bottom: "Challenge Someone"
- Tap → expands inline opponent picker (scrollable list of player names)
- Select opponent → creates challenge → appears in Sent list
- Uses existing `selectChallengeCards()` logic (10 random cards from user's seen cards)

**Display order:** Pending first (requires action), then Sent, then Create button

## History Section Design

### Structure
- Shows last 10 completed challenges (from backend)
- Sorted by `created_at` descending (newest first)
- Each challenge displays both players side-by-side in a 2-column grid

### Challenge Card Layout
```
┌─────────────────────────────────────┐
│ vs {Opponent} · {relative date}     │
├──────────────────┬──────────────────┤
│   You            │   Opponent       │
│   8/10           │   6/10           │
│   16 pts         │   12 pts         │
└──────────────────┴──────────────────┘
```

### Winner Highlighting
Visual indication based on performance:

**Winner (higher score):**
- Green border: `ring-2 ring-green-500`
- Green background: `bg-green-50`
- Checkmark icon optional

**Loser (lower score):**
- Neutral background: `bg-slate-50`
- Light border: `ring-1 ring-slate-200`

**Tie (identical scores):**
- Both sides get amber border: `ring-2 ring-amber-400`
- Both sides get amber background: `bg-amber-50`

### Winner Logic
```javascript
function determineWinner(challenge, userName) {
  const userCorrect = challenge.creator === userName
    ? challenge.creator_correct
    : challenge.opponent_correct;
  const opponentCorrect = challenge.creator === userName
    ? challenge.opponent_correct
    : challenge.creator_correct;

  const userScore = challenge.creator === userName
    ? challenge.creator_score
    : challenge.opponent_score;
  const opponentScore = challenge.creator === userName
    ? challenge.opponent_score
    : challenge.creator_score;

  // Compare correct answers first
  if (userCorrect > opponentCorrect) return "won";
  if (userCorrect < opponentCorrect) return "lost";

  // If tied on correct, compare points
  if (userScore > opponentScore) return "won";
  if (userScore < opponentScore) return "lost";

  return "tie";
}
```

**Empty state:** "No challenge history yet"

## Home Screen Notifications

### Badge on Button
- Display `Challenge a Player (N)` where N = pending challenge count
- OR use visual badge dot (small circle with number, positioned top-right of button)
- Only visible when `pendingChallenges.length > 0`

### Preview Card
**Display condition:** When `pendingChallenges.length > 0`

**Location:** Above the "Challenge a Player" button on home screen

**Card content:**
- "{Creator} challenged you!"
- "10 cards · Tap to view"
- If multiple: "and {N} more..."
- Amber background to match challenge theme

**Behavior:**
- Tap → navigates to challenges screen (Active section scrolled to top)
- Shows first/oldest pending challenge only

### Cleanup
- Remove existing "Pending Challenges" section that's currently embedded in home screen
- All challenge display now lives on dedicated challenges screen
- Home screen only shows notification preview

## Data Flow

### On Login / Return to Home
1. Fetch `getUserChallenges(userName)` via sheets-api
2. Store in state:
   - `pendingChallenges` - where `status === "open" && opponent === userName`
   - `completedChallenges` - where `status === "completed"`
3. Filter on frontend for sent challenges:
   - `sentChallenges` - where `status === "open" && creator === userName`

### Navigating to Challenges Screen
- Use existing challenge data from state (no new fetch)
- Optionally refetch if data is stale (not required for MVP)

### Creating a Challenge
1. User taps "Challenge Someone" → opponent picker appears inline
2. User selects opponent
3. Call `createChallenge(creator, opponent, cardIds)` with 10 random cards
4. Challenge appears immediately in "Sent" section
5. Stay on challenges screen (don't navigate away)

### Accepting a Challenge
1. User taps pending challenge card
2. Navigate to `practice` stage with challenge cards loaded
3. Complete session as normal
4. On completion, call `submitChallengeResult()`
5. Return to home → refetch `getUserChallenges()` to update all sections

### After Completing a Challenge (as opponent)
1. Challenge status changes from "open" → "completed"
2. Challenge moves from Active (Pending) → History section
3. Creator sees the completion when they next refresh challenges screen

## Implementation Notes

### Backend Changes
**Option A (Recommended for MVP):** Frontend filtering
- Use existing `getUserChallenges` endpoint
- Filter challenges by creator/opponent and status on frontend
- No backend deployment required

**Option B (Future enhancement):** Backend update
- Modify `handleGetUserChallenges` in Code.gs to return three arrays:
  ```javascript
  return {
    pending: [],  // opponent === user && status === "open"
    sent: [],     // creator === user && status === "open"
    completed: [] // status === "completed"
  };
  ```
- Cleaner separation of concerns
- Requires Apps Script deployment

### Existing Code to Remove
- `"challenge-pick"` stage and related UI
- Pending challenges section from home screen (lines ~840-857 in App.tsx)
- `challengeOpponent` state (moved to inline picker)

### New Components to Create
- `ChallengesScreen` component with Active/History sections
- Inline opponent picker (reusable for other features)
- Challenge history card with winner highlighting
- Home screen notification preview card

## Success Criteria

1. Users can see all pending challenges in one place
2. Users can see challenges they've sent (waiting for opponent)
3. Users can view challenge history with clear winner indication
4. Users are notified on home screen when they have pending challenges (badge + preview)
5. Challenge creation flow is simple (inline picker, no extra navigation)
6. Winner/loser/tie is visually obvious in history

## Future Enhancements

- Push notifications when challenged (requires external service)
- Filter/search challenge history
- Challenge reminders for sent challenges with no response
- Ability to cancel sent challenges
- Challenge statistics (win/loss record)
- Challenge leaderboard (separate from daily points)
