import { StyleEditor } from "@/components/style-editor";

export const dynamic = "force-dynamic";

export default function StylePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-[1.75rem] leading-tight font-semibold">Style rulebook</h1>
      <p className="mt-1 mb-6 max-w-[70ch] text-muted-foreground">
        This is what the AI follows when it proofreads in your style. It was learned from your reviewed documents. Change anything that isn&apos;t quite you; the next proofread uses it.
      </p>
      <StyleEditor />
    </main>
  );
}
