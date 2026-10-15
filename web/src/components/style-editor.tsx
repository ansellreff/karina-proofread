"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function StyleEditor() {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    fetch("/api/style")
      .then((r) => r.json())
      .then((d: { markdown: string }) => {
        setText(d.markdown);
        setSaved(d.markdown);
      });
  }, []);

  async function save() {
    const res = await fetch("/api/style", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown: text }) });
    const body = await res.json();
    if (res.ok) {
      setSaved(text ?? "");
      toast.success("Rulebook saved. The next proofread uses it.");
    } else toast.error(body.error ?? "The rulebook could not be saved.");
  }

  if (text === null) return <p className="text-muted-foreground">Loading…</p>;
  const changed = text !== saved;
  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck
        className="min-h-[65dvh] resize-y bg-card font-mono text-[13px] leading-relaxed"
        aria-label="Style rulebook"
      />
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!changed}>
          Save rulebook
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => setText(saved)}>
            Undo my changes
          </Button>
        )}
        <span className="text-xs text-muted-foreground">The previous version is kept as a backup each time you save.</span>
      </div>
    </div>
  );
}
