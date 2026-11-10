# My inbox and calendar on Netlify

This folder is the Netlify version of the app. People sign in with their own Google account, and the app talks to Gmail and Google Calendar straight from their browser. Nothing is stored on Netlify, and no one can see anyone else's mail.

Files:

- `index.html`: the app
- `google-shim.js`: connects the app to Gmail and Google Calendar
- `config.js`: where you paste your Google client ID
- `netlify.toml`: Netlify settings

## Step 1: Put the site on Netlify (2 minutes)

1. Go to https://app.netlify.com/drop and sign in (free).
2. Drag this whole folder onto the page.
3. Netlify gives you an address like `https://something-random.netlify.app`. You can rename it under **Site configuration > Change site name**.
4. Copy that address. You need it in step 2.

The site opens now, but mail and calendar won't load until you finish step 2.

## Step 2: Get a Google client ID (about 10 minutes, free)

1. Go to https://console.cloud.google.com and create a new project, for example "My inbox app".
2. Open **APIs & Services > Library**. Search for and **Enable** both **Gmail API** and **Google Calendar API**.
3. Open **Google Auth Platform** (also called **OAuth consent screen**):
   - App name: anything, for example "My inbox".
   - User type / Audience: **External**.
   - Leave it in **Testing** mode.
   - Under **Test users**, add your Gmail address and the address of every friend who will use it. Only these people can sign in.
4. Under **Data access** (or **Scopes**), add these two:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
5. Open **Clients** (or **Credentials > Create credentials > OAuth client ID**):
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, add your Netlify address from step 1, for example `https://something-random.netlify.app`. No slash at the end.
   - Press **Create** and copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

## Step 3: Paste the client ID and upload again

1. Open `config.js` in any text editor.
2. Replace `PASTE_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com` with your client ID, keeping the quotes.
3. In Netlify, open your site, go to **Deploys**, and drag the folder onto the page again.

Open the site and press **Sign in with Google**.

## Good to know

- **"Google hasn't verified this app" warning:** You and your friends will see this when signing in, because the app is in Testing mode. Press **Continue**. It's expected for a private app.
- **Up to 100 people:** Testing mode allows up to 100 test users, and each one has to be added by you in step 2. Making it open to anyone requires Google's verification, which for Gmail access includes a paid security review.
- **Signing in again:** Google sign-ins last one hour. When it runs out, a "Sign in again" button appears at the top. A new browser tab also asks you to sign in once.
- **Different from the Claude version:** The Summarize button is removed, since it needs Claude. Notes are saved in each person's browser and don't sync between devices. Everything else works the same, including mail, spam filtering, reading, replying, deleting, the calendar, adding and editing events, widgets, wallpapers and the glass slider.
- **If something doesn't load:** The status pills under the greeting say what's wrong. A pill saying the service isn't available usually means one of the two APIs isn't enabled. "Not allowed" usually means a box wasn't ticked when signing in, so sign out and sign in again.
