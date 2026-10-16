# The online app: setup and updates

The app runs on **Vercel** (free Hobby plan), with your documents in a private **Neon** database connected
through Vercel. You open it from any PC or phone. You upload and download documents by hand, as before.

**The app itself has no password (your choice).** Anyone who has the app's address can open it and see the
documents, so keep the address to yourself. The password sign-in that was built is saved in the project history
(commit `c272e1c`). Ask Claude to bring it back any time.

**The AI has its own password**, because AI runs are paid with your Anthropic key. "Proofread with AI" and
"Re-check selection" ask for it once per device. With "Remember on this device" ticked, it lasts 30 days.
- **The password** is in `web/src/lib/ai/ai-password.ts` (now `991009`). To change it, edit the text between the
  quotes, save, and run `push.bat`. Every device then needs the new one.
- **Wrong tries:** after 5 wrong tries in 15 minutes from one connection, it waits 15 minutes.
- **Settings → AI password** shows whether this device is unlocked, and can lock it again.
- **As a backstop**, keep a monthly spend limit on your Anthropic workspace.

**Never paste an API key or database address into the chat.**

---

## 1. GitHub ✅ done
The code is at https://github.com/ansellreff/karina-proofread (private).

## 2. Vercel
1. Your project `karina-proofread` on https://vercel.com, with **Root Directory** `web`.
2. **Storage → Create Database → Neon**, region **Singapore**, connected to the project. This adds `DATABASE_URL`
   by itself.
3. **Settings → Environment Variables:**
   - `ANTHROPIC_API_KEY`: your Anthropic key, the same as in `web\.env.local` on this computer. Tick
     **Production** (and Preview), and switch on **Sensitive** if offered, so it can't be read back even in Vercel.
     Without it, the app says there is no API key and only rules-only proofreading works.
   - `APP_PASSWORD_HASH` and `AUTH_SECRET`: if you added them earlier, delete both. The app no longer uses them.
4. **Deployments → Redeploy.**

If a page says **"The app's setup isn't finished"**, it names what's missing (usually the Neon database). Fix that,
then Redeploy.

## 3. Your documents online
Tell Claude when the app opens. Claude copies your current documents (every version), rules, AI rulebook, learning
data and AI usage from this computer into the online app, once. The copy on this computer stays.

## 4. On your phone
Open the address in Chrome (Android) or Safari (iPhone) and choose **Add to Home screen**.

---

## Sending updates to the online app: `push.bat`
Double-click **`push.bat`** in the project folder (or ask Claude to run it). It:
1. shows what changed and asks for a few words describing it;
2. runs a **safety check**: if anything would publish a student's name, a student document or a key, it stops and
   pushes nothing;
3. saves the change and sends it to GitHub (the first time, approve the GitHub sign-in in your browser);
4. **waits for Vercel to update the online app** (Vercel redeploys by itself after every push). If the online app
   hasn't picked up the new version after 5 minutes, it shows a **reminder** with what to do on Vercel:
   **Deployments → Redeploy**, or what to look for if the deploy failed.

Changing anything in Vercel's **Settings → Environment Variables** also needs a **Redeploy** before it takes effect.
