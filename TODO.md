# TODO

## PIN-based User Login

Switch from the hardcoded 4-name picker to a flexible PIN-based login that supports 3-8 players.

**How it works:**
- Add a new tab called `Users` to the Google Sheet with columns: `Name`, `PIN`
- Each player picks their own short numeric PIN (e.g. 4 digits)
- On the login screen, player types their name and PIN
- Apps Script validates the name+PIN pair against the Users tab
- On success, proceed as today (load card states, compute dashboard)
- No password reset flow needed — the sheet is accessible to the family, so PINs can be edited directly

**Changes needed:**
1. **Google Sheet**: Add `Users` tab with headers `Name | PIN`
2. **Code.gs**: Add `handleLogin(name, pin)` that checks the Users tab and returns success/failure
3. **sheets-api.ts**: Add `login(name, pin)` fetch wrapper
4. **App.tsx**: Replace the 4-button name picker with a name input + PIN input + "Play" button
5. **App.tsx**: Store `userName` from the validated response instead of the button label

**Notes:**
- PINs are not hashed — this is a family game, not a bank
- The Google Sheet is already semi-public, so this is just a light gate to prevent accidental name mix-ups
- Pre-populate the Users tab with Neal, Amie, Baxter, Lula and their chosen PINs
