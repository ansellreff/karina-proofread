import { UpdateLog } from "@/components/update-log";
import { RELEASES, releaseOfCommit } from "@/lib/update-log";

export const metadata = { title: "Update log" };

/** Every version of the bot, newest first (lib/update-log.ts). */
export default function UpdatesPage() {
  // online, Vercel tells which commit this build is; locally there is none
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <UpdateLog releases={RELEASES} running={releaseOfCommit(sha)?.version ?? null} online={!!sha} />
    </main>
  );
}
