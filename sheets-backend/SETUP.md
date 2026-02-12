# Google Sheets Backend Setup

## 1. Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to **CardState**.
3. Add these headers in row 1:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | user | card_id | box | due_date | correct_streak | total_attempts | last_seen_at |

4. Create a second tab named **Users**.
5. Add these headers in row 1:

   | A | B |
   |---|---|
   | name | pin |

6. Add the initial players:

   | name | pin |
   |---|---|
   | Neal | 0413 |
   | Amie | 0221 |
   | Baxter | 07101 |
   | Lula | 0115 |

   **Important:** Format columns A and B as **Plain Text** (select the columns, then Format > Number > Plain text) so PINs with leading zeros aren't treated as numbers.

7. Create a third tab named **DailyScores**.
5. Add these headers in row 1:

   | A | B | C | D |
   |---|---|---|---|
   | user | date | points | answers_count |

## 2. Add the Apps Script

1. In the spreadsheet, go to **Extensions > Apps Script**.
2. Delete any existing code in `Code.gs`.
3. Paste the contents of `Code.gs` from this directory.
4. Save (Ctrl+S / Cmd+S).

## 3. Deploy as Web App

1. In the Apps Script editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description**: Grammar Trainer API
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**.
5. Authorize the app when prompted (review permissions, click Allow).
6. Copy the **Web app URL** (it looks like `https://script.google.com/macros/s/.../exec`).

## 4. Configure the Frontend

Create or edit `apps/web/.env`:

```
VITE_SHEETS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

## 5. Test

Test the GET endpoint in your browser:

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=getUserData&user=Neal
```

You should see a JSON response like:

```json
{"cardStates":[],"dailyScore":null}
```

Test the POST endpoint from your browser console:

```js
fetch("https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec", {
  method: "POST",
  body: JSON.stringify({
    action: "saveAnswer",
    user: "Neal",
    card_id: "test_123",
    box: 2,
    due_date: "2025-01-15T00:00:00.000Z",
    correct_streak: 1,
    total_attempts: 1,
    last_seen_at: "2025-01-14T12:00:00.000Z",
    points_awarded: 1
  })
}).then(r => r.json()).then(console.log);
```

Check the Google Sheet to verify the row appeared.

## Redeploying After Changes

After editing `Code.gs` in the Apps Script editor:

1. Click **Deploy > Manage deployments**.
2. Click the pencil icon on your deployment.
3. Set **Version** to "New version".
4. Click **Deploy**.

The URL stays the same.
