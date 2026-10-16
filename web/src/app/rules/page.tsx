import { RulesEditor } from "@/components/rules/rules-editor";
import { RULE_TABS, type RuleTab } from "@/components/rules/tabs";

export const dynamic = "force-dynamic";

export default async function RulesPage(props: PageProps<"/rules">) {
  const { tab } = await props.searchParams;
  const initialTab = (RULE_TABS.find((t) => t.id === tab)?.id ?? "yours") as RuleTab;
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 sm:px-6 sm:pt-10">
      <h1 className="text-[1.75rem] leading-tight font-semibold">Review rules</h1>
      <p className="mt-1 mb-6 max-w-[70ch] text-muted-foreground">
        How the bot reviews in your style. These were learned from your reviewed documents; change them or add your own, then save. The next proofread follows them.
      </p>
      <RulesEditor initialTab={initialTab} />
      <div className="h-10" />
    </main>
  );
}
