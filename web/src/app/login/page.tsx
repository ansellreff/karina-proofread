import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth/config";
import { currentSession } from "@/lib/auth/current";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cfg = authConfig();
  if (!cfg) redirect("/");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  if (await currentSession(cfg)) redirect(next);
  const error =
    sp.error === "wrong" ? "That password isn’t right." :
    sp.error === "locked" ? `Too many wrong tries. Try again in ${Number(sp.wait) || 15} minute${Number(sp.wait) === 1 ? "" : "s"}.` :
    null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <span aria-hidden className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary font-serif text-2xl text-primary-foreground">K</span>
      <h1 className="font-serif text-[1.75rem] leading-tight font-semibold">Karina Proofread</h1>
      <p className="mt-2 text-muted-foreground">{sp.signedOut ? "You are signed out." : "Enter your password to open the app."}</p>
      <form method="post" action="/api/auth/login" className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={!!error}
          aria-describedby={error ? "login-error" : undefined}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {error && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LockKeyhole className="size-4" /> Sign in
        </button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">This device stays signed in for 30 days.</p>
    </main>
  );
}
