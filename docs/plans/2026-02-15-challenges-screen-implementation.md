# Challenges Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a dedicated challenges screen with Active/History sections and home screen notifications

**Architecture:** Replace the simple challenge-pick flow with a comprehensive challenges screen that shows pending challenges to accept, sent challenges waiting for opponent, completed challenge history with winner highlighting, and notifications on the home screen.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing sheets-api

---

## Task 1: Update AppStage Type and Add State Variables

**Files:**
- Modify: `apps/web/src/App.tsx:31`

**Step 1: Update AppStage type**

Remove `"challenge-pick"` and add `"challenges"`:

```typescript
type AppStage = "login" | "welcome" | "home" | "practice" | "summary" | "leaderboard" | "challenges";
```

**Step 2: Add new state variables**

After line 103 where `pendingChallenges` is defined, add:

```typescript
const [sentChallenges, setSentChallenges] = useState<Challenge[]>([]);
const [completedChallenges, setCompletedChallenges] = useState<Challenge[]>([]);
```

**Step 3: Remove challengeOpponent state**

Find and remove this line (around line 104):

```typescript
const [challengeOpponent, setChallengeOpponent] = useState("");
```

**Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "refactor: update AppStage type and challenge state variables

- Remove challenge-pick stage, add challenges stage
- Add sentChallenges and completedChallenges state
- Remove challengeOpponent state (moved to inline picker)"
```

---

## Task 2: Update Challenge Data Handling on Login

**Files:**
- Modify: `apps/web/src/App.tsx:234` (handleLogin function)
- Modify: `apps/web/src/App.tsx:497` (handleBackToHome function)

**Step 1: Update login challenge data handling**

Replace line 234:

```typescript
getUserChallenges(user).then(({ pending }) => setPendingChallenges(pending)).catch(() => {});
```

With:

```typescript
getUserChallenges(user).then(({ pending, completed }) => {
  setPendingChallenges(pending);
  setCompletedChallenges(completed ?? []);
  // Filter sent challenges on frontend
  const sent = (completed ?? [])
    .filter(ch => ch.creator.toLowerCase() === user.toLowerCase() && ch.status === "open");
  setSentChallenges(sent);
}).catch(() => {});
```

**Step 2: Update handleBackToHome challenge refresh**

Replace line 497:

```typescript
getUserChallenges(userName).then(({ pending }) => setPendingChallenges(pending)).catch(() => {});
```

With:

```typescript
getUserChallenges(userName).then(({ pending, completed }) => {
  setPendingChallenges(pending);
  setCompletedChallenges(completed ?? []);
  const sent = (completed ?? [])
    .filter(ch => ch.creator.toLowerCase() === userName.toLowerCase() && ch.status === "open");
  setSentChallenges(sent);
}).catch(() => {});
```

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: fetch and filter sent/completed challenges on login

- Store completed challenges from backend
- Filter sent challenges on frontend (creator + open status)
- Update both login and return-to-home flows"
```

---

## Task 3: Remove Old Challenge-Pick Stage UI

**Files:**
- Modify: `apps/web/src/App.tsx:894-933` (challenge-pick section)

**Step 1: Delete the challenge-pick section**

Find the section starting with `{stage === "challenge-pick" ? (` (around line 894) and delete the entire section including the closing parentheses and ternary operator. Delete from line 894 through line 933.

**Step 2: Verify no references to challenge-pick remain**

Run:

```bash
grep -n "challenge-pick" apps/web/src/App.tsx
```

Expected: No matches

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "refactor: remove challenge-pick stage UI

- Delete opponent picker screen
- Will be replaced with inline picker in challenges screen"
```

---

## Task 4: Remove Old Pending Challenges from Home Screen

**Files:**
- Modify: `apps/web/src/App.tsx:840-857` (pending challenges section on home)

**Step 1: Delete the pending challenges section from home**

Find the section starting with `{pendingChallenges.length > 0 ? (` (around line 840) and delete through the closing div (around line 857).

**Step 2: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "refactor: remove pending challenges from home screen

- Challenges now shown on dedicated screen
- Home will show notification preview instead"
```

---

## Task 5: Add Home Screen Notification (Badge + Preview Card)

**Files:**
- Modify: `apps/web/src/App.tsx:831-837` (Challenge a Player button area)

**Step 1: Add preview card above the button**

Before the "Challenge a Player" button (around line 831), add this preview card:

```typescript
{pendingChallenges.length > 0 ? (
  <div
    className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 cursor-pointer"
    onClick={() => setStage("challenges")}
  >
    <p className="font-semibold text-amber-800">
      {pendingChallenges[0].creator} challenged you!
    </p>
    <p className="text-sm text-amber-700">
      10 cards · Tap to view
      {pendingChallenges.length > 1 && ` · and ${pendingChallenges.length - 1} more...`}
    </p>
  </div>
) : null}
```

**Step 2: Update the Challenge a Player button to show badge**

Replace the "Challenge a Player" button (around line 831-837) with:

```typescript
<button
  className="w-full rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
  type="button"
  onClick={() => setStage("challenges")}
>
  Challenge a Player{pendingChallenges.length > 0 ? ` (${pendingChallenges.length})` : ""}
</button>
```

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: add home screen challenge notifications

- Show preview card for first pending challenge
- Add badge count to Challenge a Player button
- Both navigate to new challenges screen"
```

---

## Task 6: Create Helper Function for Winner Determination

**Files:**
- Modify: `apps/web/src/App.tsx` (add helper function before component)

**Step 1: Add determineWinner helper function**

After the imports and before the `export default function App()` line (around line 113), add:

```typescript
function determineWinner(
  challenge: Challenge,
  userName: string
): "won" | "lost" | "tie" {
  const isCreator = challenge.creator.toLowerCase() === userName.toLowerCase();

  const userCorrect = isCreator ? challenge.creator_correct : challenge.opponent_correct;
  const opponentCorrect = isCreator ? challenge.opponent_correct : challenge.creator_correct;
  const userScore = isCreator ? challenge.creator_score : challenge.opponent_score;
  const opponentScore = isCreator ? challenge.opponent_score : challenge.creator_score;

  // Compare correct answers first
  if (userCorrect > opponentCorrect) return "won";
  if (userCorrect < opponentCorrect) return "lost";

  // If tied on correct, compare points
  if (userScore > opponentScore) return "won";
  if (userScore < opponentScore) return "lost";

  return "tie";
}
```

**Step 2: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: add determineWinner helper function

- Compares correct answers first, then points
- Returns won/lost/tie for visual highlighting"
```

---

## Task 7: Create Inline Opponent Picker Component

**Files:**
- Modify: `apps/web/src/App.tsx` (add within challenges screen)

**Step 1: Add state for opponent picker**

In the component state section, add:

```typescript
const [showOpponentPicker, setShowOpponentPicker] = useState(false);
const [selectedOpponent, setSelectedOpponent] = useState("");
```

**Step 2: Create startChallenge function using inline picker**

Replace the existing `startChallenge` function (around line 299) with:

```typescript
async function startChallengeInline() {
  if (!userName || !selectedOpponent) return;
  setIsLoading(true);
  setGlobalError(null);
  try {
    const cardIds = selectChallengeCards(getCards(), cardStates, 10);
    const { challenge_id } = await createChallenge(userName, selectedOpponent, cardIds);

    // Add to sent challenges immediately
    const newChallenge: Challenge = {
      challenge_id,
      creator: userName,
      opponent: selectedOpponent,
      card_ids: cardIds,
      creator_score: 0,
      creator_correct: 0,
      opponent_score: 0,
      opponent_correct: 0,
      status: "open",
      created_at: new Date().toISOString(),
    };
    setSentChallenges([...sentChallenges, newChallenge]);

    // Reset picker
    setShowOpponentPicker(false);
    setSelectedOpponent("");
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : "Could not create challenge.");
  } finally {
    setIsLoading(false);
  }
}
```

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: add inline opponent picker state and function

- showOpponentPicker and selectedOpponent state
- startChallengeInline creates challenge and updates UI
- Stays on challenges screen after creation"
```

---

## Task 8: Create Challenges Screen - Active Section

**Files:**
- Modify: `apps/web/src/App.tsx` (add new stage section)

**Step 1: Add challenges screen section after leaderboard**

After the leaderboard section (around line 1195), add the challenges screen:

```typescript
{stage === "challenges" ? (
  <section className="mt-4 space-y-3">
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-base font-semibold">Active Challenges</h2>

      {/* Pending Challenges - To Accept */}
      {pendingChallenges.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-slate-700">Pending</h3>
          <div className="mt-2 space-y-2">
            {pendingChallenges.map((ch) => (
              <button
                key={ch.challenge_id}
                type="button"
                className="w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm ring-1 ring-amber-200"
                onClick={() => acceptChallenge(ch)}
              >
                <p className="font-semibold text-amber-800">{ch.creator} challenged you!</p>
                <p className="text-xs text-amber-700">10 cards · Tap to play</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No pending challenges</p>
      )}

      {/* Sent Challenges - Waiting */}
      {sentChallenges.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700">Sent</h3>
          <div className="mt-2 space-y-2">
            {sentChallenges.map((ch) => (
              <div
                key={ch.challenge_id}
                className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200"
              >
                <p className="font-semibold text-slate-700">Waiting for {ch.opponent}</p>
                <p className="text-xs text-slate-600">
                  10 cards · Sent {new Date(ch.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Create New Challenge */}
      <div className="mt-4">
        {!showOpponentPicker ? (
          <button
            className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={() => setShowOpponentPicker(true)}
          >
            Challenge Someone
          </button>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">Pick Your Opponent</h3>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {playerNames
                .filter((name) => name.toLowerCase() !== userName?.toLowerCase())
                .map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedOpponent(name)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ring-1 ${
                      selectedOpponent === name
                        ? "bg-amber-50 ring-amber-400 text-amber-800"
                        : "bg-white ring-slate-200 text-slate-700"
                    }`}
                  >
                    {name}
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                type="button"
                disabled={!selectedOpponent || isLoading}
                onClick={() => void startChallengeInline()}
              >
                {isLoading ? "Creating..." : "Send Challenge"}
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                type="button"
                onClick={() => {
                  setShowOpponentPicker(false);
                  setSelectedOpponent("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </section>
) : null}
```

**Step 2: Test navigation**

Run: `npm run dev`

Expected:
- Click "Challenge a Player" on home → goes to challenges screen
- Shows Active section with pending/sent/create

**Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: create challenges screen Active section

- Show pending challenges to accept
- Show sent challenges waiting for opponent
- Inline opponent picker for creating challenges
- All in dedicated challenges screen"
```

---

## Task 9: Add Challenges Screen - History Section

**Files:**
- Modify: `apps/web/src/App.tsx` (add to challenges screen after Active section)

**Step 1: Add History section below Active section**

Inside the challenges screen section, after the Active section div closes, add:

```typescript
<div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
  <h2 className="text-base font-semibold">Challenge History</h2>

  {completedChallenges.length === 0 ? (
    <p className="mt-3 text-sm text-slate-600">No challenge history yet</p>
  ) : (
    <div className="mt-3 space-y-3">
      {completedChallenges
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((ch) => {
          if (!userName) return null;
          const result = determineWinner(ch, userName);
          const isCreator = ch.creator.toLowerCase() === userName.toLowerCase();
          const opponentName = isCreator ? ch.opponent : ch.creator;
          const userCorrect = isCreator ? ch.creator_correct : ch.opponent_correct;
          const userScore = isCreator ? ch.creator_score : ch.opponent_score;
          const opponentCorrect = isCreator ? ch.opponent_correct : ch.creator_correct;
          const opponentScore = isCreator ? ch.opponent_score : ch.creator_score;

          const userClasses = result === "won"
            ? "bg-green-50 ring-2 ring-green-500"
            : result === "tie"
            ? "bg-amber-50 ring-2 ring-amber-400"
            : "bg-slate-50 ring-1 ring-slate-200";

          const opponentClasses = result === "lost"
            ? "bg-green-50 ring-2 ring-green-500"
            : result === "tie"
            ? "bg-amber-50 ring-2 ring-amber-400"
            : "bg-slate-50 ring-1 ring-slate-200";

          return (
            <div key={ch.challenge_id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-700">
                vs {opponentName} · {new Date(ch.created_at).toLocaleDateString()}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className={`rounded-lg p-3 ${userClasses}`}>
                  <p className="text-xs text-slate-500">You</p>
                  <p className="text-lg font-bold text-slate-800">{userCorrect}/10</p>
                  <p className="text-xs text-slate-600">{userScore} pts</p>
                </div>
                <div className={`rounded-lg p-3 ${opponentClasses}`}>
                  <p className="text-xs text-slate-500">{opponentName}</p>
                  <p className="text-lg font-bold text-slate-800">{opponentCorrect}/10</p>
                  <p className="text-xs text-slate-600">{opponentScore} pts</p>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  )}
</div>
```

**Step 2: Add Back to Home button**

After the History section div closes, add:

```typescript
<button
  className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
  type="button"
  onClick={() => setStage("home")}
>
  Back to Home
</button>
```

**Step 3: Test visual highlighting**

Run: `npm run dev`

Expected:
- Completed challenges show in History
- Winner side has green border/background
- Loser side has neutral styling
- Tie shows both sides with amber

**Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: add challenges screen History section

- Show completed challenges sorted newest first
- Visual winner highlighting (green=won, amber=tie, neutral=lost)
- Compare correct answers first, then points
- Add Back to Home button"
```

---

## Task 10: Fix acceptChallenge to Work with New Flow

**Files:**
- Modify: `apps/web/src/App.tsx:336-347` (acceptChallenge function)

**Step 1: Verify acceptChallenge function exists**

The existing `acceptChallenge` function should work as-is, but verify it's still present around line 336. No changes needed if it already:
- Takes a Challenge parameter
- Builds challenge queue
- Sets activeChallenge
- Navigates to practice

**Step 2: Test accepting challenge**

Run: `npm run dev`

Expected:
- Click pending challenge → starts practice with those cards
- Complete session → challenge moves to History
- Return to challenges screen → pending list updated

**Step 3: If no issues, commit checkpoint**

```bash
git add apps/web/src/App.tsx
git commit -m "test: verify acceptChallenge works with new flow

- Confirmed existing function compatible
- Pending challenges correctly start practice sessions"
```

---

## Task 11: Manual Testing Checklist

**Step 1: Test complete flow**

Run: `npm run dev`

**Home Screen:**
- [ ] Badge shows on "Challenge a Player" button when pending exist
- [ ] Preview card appears above button when pending exist
- [ ] Clicking preview or button goes to challenges screen

**Challenges Screen - Active:**
- [ ] Pending challenges show first
- [ ] Sent challenges show (if any)
- [ ] "Challenge Someone" button works
- [ ] Inline opponent picker appears
- [ ] Can select opponent and create challenge
- [ ] New challenge appears in Sent section immediately

**Challenges Screen - History:**
- [ ] Completed challenges show newest first
- [ ] Winner has green border/background
- [ ] Loser has neutral styling
- [ ] Tie shows both amber

**Navigation:**
- [ ] Back to Home button works
- [ ] All old challenge-pick references removed

**Step 2: Fix any issues found**

Make corrections as needed.

**Step 3: Final commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: complete challenges screen implementation

- Dedicated challenges screen with Active/History
- Home screen notifications (badge + preview)
- Inline opponent picker
- Visual winner highlighting
- All functionality tested and working

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria Checklist

- [ ] Challenges screen accessible from home
- [ ] Active section shows pending (to accept) and sent (waiting)
- [ ] History section shows completed with visual winner indication
- [ ] Home screen shows badge count on button
- [ ] Home screen shows preview card for first pending challenge
- [ ] Inline opponent picker works for creating challenges
- [ ] Old challenge-pick stage completely removed
- [ ] Old pending challenges section removed from home
- [ ] Navigation flows correctly between screens
- [ ] Winner determination works (correct > points > tie)

---

## Notes

- This implementation uses frontend filtering for sent challenges (no backend changes required)
- Future enhancement: modify backend to return three arrays for cleaner separation
- All existing challenge functionality (accept, complete, create) remains compatible
- Visual styling matches existing app patterns (amber for challenges, green for success)
