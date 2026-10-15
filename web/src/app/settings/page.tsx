import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-[1.75rem] leading-tight font-semibold">Settings</h1>
      <p className="mt-1 mb-6 text-muted-foreground">How the bot proofreads, and what the AI costs you.</p>
      <SettingsForm />
    </main>
  );
}
