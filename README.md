

## Staying signed in

Google only gives a web page access for one hour at a time. To stay signed in on a
device, the site uses a small helper (`netlify/functions/gauth.js`). It keeps
Google's long-lived sign-in in an encrypted cookie that page scripts can't read, and
quietly fetches a new one-hour pass when the old one runs out.

The helper needs your OAuth **client secret**, which must never go in this repository:

1. In Google Cloud Console, open **APIs & Services → Credentials** and click your
   OAuth web client. Copy the **Client secret** (or add a new one).
2. In Netlify, open **Site configuration → Environment variables** and add
   `GOOGLE_CLIENT_SECRET` with that value, for all deploy contexts.
3. Redeploy. Then sign in once more on each device.
4. Optional but recommended: in **APIs & Services → OAuth consent screen**, set the
   publishing status to **In production**. While it says *Testing*, Google ends
   these sign-ins after 7 days.

Without the variable, the app works as before: you sign in again when the hour is up.
Signing out of an account in Settings removes it from this device only.

## Optional: settings sync

Settings › Accounts › Sync keeps widgets, packs, wallpaper, colours, filters, notes
and to-dos the same on every device. It saves one private file in your Google
account's app-data space that only this app can read. To use it, turn on the
**Google Drive API** once for this app's project in Google Cloud Console
(APIs & Services → Library → Google Drive API → Enable). Each person then
allows the extra permission the first time they switch sync on.

## Files

- `index.html`: the page's markup
- `app.css`, `app.js`, `boot.js`: styles and code (cached by the browser)
- `google-shim.js`: talks to Gmail, Calendar and Drive
- `sw.js`: lets the app open without internet
- `netlify/functions/gauth.js`: optional helper for staying signed in
- `netlify.toml`: hosting settings and security headers
