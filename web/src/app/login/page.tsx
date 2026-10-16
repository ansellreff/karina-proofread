import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth/config";
import { joinSession, unseal } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  private: "This app is private. Sign in with Karina’s Microsoft account.",
  cancelled: "Sign-in was cancelled.",
  expired: "The sign-in took too long. Try again.",
  failed: "Microsoft didn’t complete the sign-in. Try again.",
};

export default async function LoginPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cfg = authConfig();
  if (!cfg) redirect("/");
  const sp = await props.searchParams;
  const jar = await cookies();
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  if (await unseal(joinSession((n) => jar.get(n)?.value), cfg.secret)) redirect(next);
  const error = typeof sp.error === "string" ? MESSAGES[sp.error] : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <span aria-hidden className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary font-serif text-2xl text-primary-foreground">K</span>
      <h1 className="font-serif text-[1.75rem] leading-tight font-semibold">Karina Proofread</h1>
      <p className="mt-2 text-muted-foreground">{sp.signedOut ? "You are signed out." : "Sign in with your Microsoft account. Your documents stay in your OneDrive."}</p>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <a
        href={`/api/auth/login?next=${encodeURIComponent(next)}`}
        className="mt-6 inline-flex h-10 items-center justify-center gap-2.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {/* Microsoft's logo keeps its own brand colours (the one exception to the theme tokens) */}
        <svg aria-hidden viewBox="0 0 21 21" className="size-4">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        Sign in with Microsoft
      </a>
    </main>
  );
}
