# Putting the app online: your steps

The app is ready for Microsoft sign-in and OneDrive. A few things can only be done with **your** accounts. Each part
below takes 5–15 minutes. After each part, tell me and I'll continue from there.

**Never paste a secret (client secret, API key) into the chat.** You type secrets yourself, only into the places
named below.

---

## Part 1: Register the sign-in (Microsoft)

Your Microsoft account is a personal one (outlook.com / hotmail.com / live.com). Microsoft only lets a personal
account register an app inside a free "directory". You get that directory by creating a free Azure account.

### 1a. Free Azure account (once)
1. Go to **https://azure.microsoft.com/free** and choose **Try Azure for free**. Sign in with your Microsoft account
   (the one whose OneDrive the app should use).
2. Microsoft asks for a phone number and a card. The card **only verifies your identity**:
   - nothing is charged on the free account;
   - the app registration costs nothing, then or later.
3. When it finishes, you have a "Default Directory". Nothing else to set up there.

### 1b. Register the app
1. Go to **https://entra.microsoft.com** (sign in with the same account).
2. Open **Applications → App registrations → New registration**.
   - **Name:** `Karina Proofread`
   - **Supported account types:** **Personal Microsoft accounts only**
   - **Redirect URI:** platform **Web**, address `http://localhost:3000/api/auth/callback`
   - Press **Register**.
3. On the page that opens (Overview), copy the **Application (client) ID**. You can send me this one: it is not
   secret.
4. Open **Certificates & secrets → Client secrets → New client secret**.
   - **Description:** `app`
   - **Expires:** 24 months
   - Press **Add**.

   Copy the **Value** right away (it is shown only once). This one **is secret**: keep it for step 1c, and don't
   send it to me.
5. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**. Tick these, then press
   **Add permissions**:
   - `Files.ReadWrite`
   - `offline_access`
   - `openid`
   - `profile`
   - `email`

   `User.Read` is already there.

### 1c. Put the values on this computer
Open the file `web\.env.local` in this project (with Notepad or VS Code). It already has your Anthropic key; leave
that line as it is. Add these two lines at the end:

```
MS_CLIENT_ID=<the Application (client) ID>
MS_CLIENT_SECRET=<the secret Value>
```

Save the file, then tell me. I'll add the other settings (the cookie key, your allowed account, the address).

## Part 2: Your project folder in OneDrive
1. In **https://onedrive.live.com**, create a folder for the app, for example `Karina Proofread`, wherever you like.
2. Leave it empty. When you first sign in to the app, you choose this folder. The app then creates three folders
   inside it:
   - **Inbox:** new student files; the app imports them from here.
   - **Done:** finished files (`DONE_…`).
   - **App data:** the app's own working files. Don't edit these by hand.

After that, **Settings → OneDrive** has a button that copies your current documents, rules and learning data from this
computer into OneDrive. You asked to do this only once the folder is set up, so it is one click, whenever you're
ready. The copy on this computer stays as a backup.

## Part 3: GitHub and Vercel (for the online address)
1. **GitHub:** create a free account at **https://github.com/signup**, then a **new repository**:
   - **Name:** `karina-proofread`
   - **Visibility:** **Private**
   - Don't add a README or anything else (it must be empty).

   Send me the repository's address (for example `https://github.com/<you>/karina-proofread`).
2. **Vercel:** sign up at **https://vercel.com/signup** with **Continue with GitHub**, on the free **Hobby** plan.

Then I:
1. check that no student names or keys are anywhere in the project's history;
2. push the code;
3. walk you through **Import project** on Vercel:
   - **Root directory:** `web`;
   - the **Environment variables**, which you type in yourself;
   - adding the online address to the app registration (step 1b, **Authentication → Add URI**).

## Part 4: On your phone
Open the online address in Chrome (Android) or Safari (iPhone), sign in, and choose **Add to Home screen**. The app then
opens full screen like any other app.
