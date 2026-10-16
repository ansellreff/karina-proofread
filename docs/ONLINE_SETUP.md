# Putting the app online: your steps

The app goes on **Vercel** (free Hobby plan), with your documents in a private **Neon** database connected
through Vercel. You open it from any PC or phone with **your password**. There is no Microsoft or Azure step.
You upload and download documents by hand, as now. All of it is free, and takes about 15 minutes.

**Never paste a password, secret or API key into the chat.** You type those yourself, only where named below.

---

## 1. GitHub (where the code lives)
1. Create a free account at **https://github.com/signup**, using reffriandi@gmail.com.
2. Open **https://github.com/new**:
   - **Repository name:** `karina-proofread`
   - **Private**
   - Leave everything else unticked: no README, .gitignore or license.
   - Press **Create repository**.
3. Send me the address it shows, for example `https://github.com/<your-username>/karina-proofread`.

I then check the whole project history for student names and keys, and only when it is clean, push the code. The
first time, Windows opens a GitHub sign-in in your browser: approve it there.

## 2. Vercel (where the app runs)
1. Sign up at **https://vercel.com/signup** with **Continue with GitHub**. Choose the **Hobby** plan (personal use).
2. **Add New → Project**, pick `karina-proofread` and set:
   - **Root Directory:** `web` (press Edit next to it)
   - Leave the rest as it is. Don't deploy yet if it offers; the next two steps come first.
3. In the project, **Storage → Create Database → Neon**, region **Singapore**, and connect it to the project.
   This adds `DATABASE_URL` by itself.
4. **Settings → Environment Variables:** add these three, for all environments:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic key (the same as in `web\.env.local` on this computer) |
   | `APP_PASSWORD_HASH` | made in step 5 below |
   | `AUTH_SECRET` | made in step 5 below |

5. **Your password.** In VS Code, open a terminal in the project and run:
   ```
   . .\dev.ps1; cd web; npx tsx scripts/password-hash.ts
   ```
   Type your new password twice (the typing is hidden). It prints two lines, `APP_PASSWORD_HASH=…` and
   `AUTH_SECRET=…`. Add each one to Vercel: the name is the part before `=`, the value is everything after it.
   The password itself is never saved anywhere; only its scrambled version is.
   **Put these two only in Vercel, not in `web\.env.local`.** In that file they would put a password on the app on
   this computer too, and the `.env` format can mangle the value.
6. **Deployments → Redeploy.** Vercel shows the app's address, for example `karina-proofread.vercel.app`.

## 3. Your documents online
Tell me when the app is up. I'll copy your current documents (every version), rules, AI rulebook, learning data and
AI usage from this computer into the online app, once. The copy on this computer stays as a backup.

## 4. On your phone
Open the address in Chrome (Android) or Safari (iPhone), sign in, then choose **Add to Home screen**. The app opens
full screen like any other app. Each device stays signed in for 30 days; **Settings → Sign out** ends it.

---

**Good to know**
- **Wrong passwords:** after 5 wrong tries within 15 minutes, sign-in waits 15 minutes for that connection.
- **Changing the password:** in the app, go to **Settings → Account → Change password** (your current password, then
  the new one twice). The device you're on stays signed in; every other device has to sign in again.
- **Forgot the password:** run step 5 again with a new password, replace `APP_PASSWORD_HASH` in Vercel with the new
  value, and **Redeploy**. The new password works straight away, and every device is signed out. Your documents are
  kept. Only someone who can sign in to your Vercel account can do this (and that account can be recovered through
  your email).
- **If the app shows "The app's setup isn't finished":** it names the Vercel settings that are missing. Add them,
  then redeploy.
- **Updates:** I commit changes on this computer, show you what changed, and push only when you say so. Each push
  updates the online app by itself.
- **On this computer:** the app also keeps working at http://localhost:3000, with its own local files.
