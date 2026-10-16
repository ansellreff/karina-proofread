/**
 * Make APP_PASSWORD_HASH (and a fresh AUTH_SECRET) for the online app. Type the password when asked (it is not
 * shown, not saved anywhere); paste both printed values into Vercel → Settings → Environment Variables.
 *
 *   npx tsx scripts/password-hash.ts
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "../src/lib/auth/password";

function ask(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const pw = await ask("New password for the online app (typing is hidden): ");
  if (pw.length < 10) {
    console.error("Use at least 10 characters (a short sentence is easy to remember and hard to guess).");
    process.exit(1);
  }
  const again = await ask("Type it again: ");
  if (again !== pw) {
    console.error("The two passwords are different. Nothing was made.");
    process.exit(1);
  }
  console.log(`\nAPP_PASSWORD_HASH=${await hashPassword(pw)}`);
  console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}\n`);
  console.log("In Vercel → Settings → Environment Variables, add both: the name before = and the part after = as the value.");
}

main();
