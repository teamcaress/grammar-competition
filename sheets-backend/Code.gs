/**
 * Grammar Trainer — Google Apps Script backend
 *
 * Spreadsheet layout:
 *   Sheet "CardState"   — columns: user | card_id | box | due_date | correct_streak | total_attempts | last_seen_at
 *   Sheet "DailyScores" — columns: user | date | points | answers_count
 */

/* ------------------------------------------------------------------ */
/*  Routing                                                            */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var action = (e.parameter.action || "").toString();
  var result;

  if (action === "getUserData") {
    result = handleGetUserData(e.parameter.user || "");
  } else if (action === "getLeaderboard") {
    result = handleGetLeaderboard(e.parameter.range || "today");
  } else {
    result = { error: "Unknown action" };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid JSON" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var action = (body.action || "").toString();
  var result;

  if (action === "saveAnswer") {
    result = handleSaveAnswer(body);
  } else {
    result = { error: "Unknown action" };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function todayKey() {
  var d = new Date();
  var y = d.getUTCFullYear();
  var m = ("0" + (d.getUTCMonth() + 1)).slice(-2);
  var day = ("0" + d.getUTCDate()).slice(-2);
  return y + "-" + m + "-" + day;
}

/** Convert a cell value (possibly a Date object) to "YYYY-MM-DD" string (UTC). */
function toDateKey(val) {
  if (val instanceof Date) {
    var y = val.getUTCFullYear();
    var m = ("0" + (val.getUTCMonth() + 1)).slice(-2);
    var d = ("0" + val.getUTCDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }
  return val.toString();
}

/** Convert a cell value (possibly a Date object) to an ISO 8601 string. */
function toIsoString(val) {
  if (val instanceof Date) {
    return val.toISOString();
  }
  return val.toString();
}

function shiftDateKey(dateKey, delta) {
  var parts = dateKey.split("-");
  var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
  d.setUTCDate(d.getUTCDate() + delta);
  var y = d.getUTCFullYear();
  var m = ("0" + (d.getUTCMonth() + 1)).slice(-2);
  var day = ("0" + d.getUTCDate()).slice(-2);
  return y + "-" + m + "-" + day;
}

/* ------------------------------------------------------------------ */
/*  getUserData                                                        */
/* ------------------------------------------------------------------ */

function handleGetUserData(user) {
  if (!user) return { error: "user is required" };

  var csSheet = getSheet("CardState");
  var dsSheet = getSheet("DailyScores");
  var cardStates = [];
  var dailyScore = null;
  var today = todayKey();

  // Scan CardState for this user
  if (csSheet) {
    var csData = csSheet.getDataRange().getValues();
    for (var i = 1; i < csData.length; i++) {
      if (csData[i][0] === user) {
        cardStates.push({
          card_id: csData[i][1],
          box: Number(csData[i][2]),
          due_date: toIsoString(csData[i][3]),
          correct_streak: Number(csData[i][4]),
          total_attempts: Number(csData[i][5]),
          last_seen_at: toIsoString(csData[i][6])
        });
      }
    }
  }

  // Find today's DailyScores row
  if (dsSheet) {
    var dsData = dsSheet.getDataRange().getValues();
    for (var j = 1; j < dsData.length; j++) {
      if (dsData[j][0] === user && toDateKey(dsData[j][1]) === today) {
        dailyScore = {
          date: today,
          points: Number(dsData[j][2]),
          answers_count: Number(dsData[j][3])
        };
        break;
      }
    }
  }

  return { cardStates: cardStates, dailyScore: dailyScore };
}

/* ------------------------------------------------------------------ */
/*  saveAnswer                                                         */
/* ------------------------------------------------------------------ */

function handleSaveAnswer(body) {
  var user = (body.user || "").toString();
  var cardId = (body.card_id || "").toString();
  var newBox = Number(body.box);
  var dueDate = (body.due_date || "").toString();
  var correctStreak = Number(body.correct_streak);
  var totalAttempts = Number(body.total_attempts);
  var lastSeenAt = (body.last_seen_at || "").toString();
  var pointsAwarded = Number(body.points_awarded);

  if (!user || !cardId) return { error: "user and card_id are required" };

  // Upsert CardState
  var csSheet = getSheet("CardState");
  if (!csSheet) return { error: "CardState sheet not found" };

  var csData = csSheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < csData.length; i++) {
    if (csData[i][0] === user && csData[i][1] === cardId) {
      foundRow = i + 1; // 1-indexed for Sheet API
      break;
    }
  }

  if (foundRow > 0) {
    csSheet.getRange(foundRow, 3, 1, 5).setValues([
      [newBox, dueDate, correctStreak, totalAttempts, lastSeenAt]
    ]);
  } else {
    csSheet.appendRow([user, cardId, newBox, dueDate, correctStreak, totalAttempts, lastSeenAt]);
  }

  // Upsert DailyScores
  var dsSheet = getSheet("DailyScores");
  if (!dsSheet) return { error: "DailyScores sheet not found" };

  var today = todayKey();
  var dsData = dsSheet.getDataRange().getValues();
  var dsRow = -1;
  for (var j = 1; j < dsData.length; j++) {
    if (dsData[j][0] === user && toDateKey(dsData[j][1]) === today) {
      dsRow = j + 1;
      break;
    }
  }

  if (dsRow > 0) {
    var curPoints = Number(dsData[dsRow - 1][2]);
    var curCount = Number(dsData[dsRow - 1][3]);
    dsSheet.getRange(dsRow, 3, 1, 2).setValues([
      [curPoints + pointsAwarded, curCount + 1]
    ]);
  } else {
    dsSheet.appendRow([user, today, pointsAwarded, 1]);
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  getLeaderboard                                                     */
/* ------------------------------------------------------------------ */

function handleGetLeaderboard(range) {
  var dsSheet = getSheet("DailyScores");
  var csSheet = getSheet("CardState");
  var today = todayKey();
  var weekStart = shiftDateKey(today, -6);

  // Gather points per user
  var pointsMap = {};   // user -> total points in range
  var datesMap = {};    // user -> Set of active date keys (points > 0)

  if (dsSheet) {
    var dsData = dsSheet.getDataRange().getValues();
    for (var i = 1; i < dsData.length; i++) {
      var u = dsData[i][0].toString();
      var dateVal = toDateKey(dsData[i][1]);
      var pts = Number(dsData[i][2]);

      // Track active dates for streak (always, regardless of range)
      if (pts > 0) {
        if (!datesMap[u]) datesMap[u] = {};
        datesMap[u][dateVal] = true;
      }

      // Filter by range for points
      var inRange = false;
      if (range === "today") {
        inRange = (dateVal === today);
      } else if (range === "week") {
        inRange = (dateVal >= weekStart && dateVal <= today);
      } else {
        inRange = true; // "all"
      }

      if (inRange) {
        pointsMap[u] = (pointsMap[u] || 0) + pts;
      }
    }
  }

  // Gather mastered count per user (box === 4)
  var masteredMap = {};
  if (csSheet) {
    var csData = csSheet.getDataRange().getValues();
    for (var j = 1; j < csData.length; j++) {
      var cu = csData[j][0].toString();
      if (Number(csData[j][2]) === 4) {
        masteredMap[cu] = (masteredMap[cu] || 0) + 1;
      }
    }
  }

  // Compute streaks and build rows
  var allUsers = {};
  for (var k in pointsMap) allUsers[k] = true;
  for (var k2 in masteredMap) allUsers[k2] = true;

  var rows = [];
  for (var name in allUsers) {
    var activeDates = datesMap[name] || {};
    var streak = 0;
    var cursor = today;
    while (activeDates[cursor]) {
      streak++;
      cursor = shiftDateKey(cursor, -1);
    }

    rows.push({
      display_name: name,
      points: pointsMap[name] || 0,
      mastered: masteredMap[name] || 0,
      streak: streak
    });
  }

  rows.sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.mastered !== a.mastered) return b.mastered - a.mastered;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.display_name.localeCompare(b.display_name);
  });

  return { range: range, rows: rows };
}
