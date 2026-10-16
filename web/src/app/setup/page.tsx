import { redirect } from "next/navigation";
import { SetupFolder } from "@/components/setup-folder";
import { authConfig } from "@/lib/auth/config";
import { requireSession } from "@/lib/auth/current";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your project folder" };

/** First visit online: choose the OneDrive folder Karina made for this project. */
export default async function SetupPage() {
  if (!authConfig()) redirect("/");
  const { session } = await requireSession();
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-[1.75rem] leading-tight font-semibold">Choose your project folder</h1>
      <p className="mt-2 mb-6 max-w-[62ch] text-muted-foreground">
        Hello {session.name.split(" ")[0]}. Pick the OneDrive folder you made for this project. The app creates three folders inside it: Inbox for new files, Done for finished ones,
        and App data for its own files.
      </p>
      <SetupFolder />
    </main>
  );
}
