"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPES, formatReminder, GRAMMAR_KINDS, type BuiltInRules, type FormatStandard, type GrammarUse, type RuleConfig } from "@/lib/rules/config";
import type { DocType } from "@/lib/rules/types";
import { DocTypeChips, Field, NativeSelect, Section, Segmented } from "./bits";
import { NOTE_RULES, TEXT_FIXES } from "./info";

type Set<T> = (v: T) => void;

function Row({ on, onToggle, label, children }: { on: boolean; onToggle: Set<boolean>; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Switch checked={on} onCheckedChange={onToggle} aria-label={label} className="mt-0.5" />
      <div className={on ? "min-w-0 flex-1" : "min-w-0 flex-1 opacity-60"}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function BuiltInChecks({ b, onChange }: { b: BuiltInRules; onChange: Set<BuiltInRules> }) {
  const set = <K extends keyof BuiltInRules>(k: K, v: Partial<BuiltInRules[K]>) => onChange({ ...b, [k]: { ...b[k], ...v } });
  return (
    <div className="space-y-5">
      <Section title="Text fixes" hint="Small corrections the bot makes directly in the student’s text, as your tracked changes.">
        <div className="divide-y">
          {TEXT_FIXES.map((f) => (
            <Row key={f.id} on={b[f.id].enabled} onToggle={(enabled) => set(f.id, { enabled })} label={f.label}>
              <p className="font-medium leading-snug">{f.label}</p>
              <p className="text-sm text-muted-foreground">{f.example}</p>
            </Row>
          ))}
        </div>
      </Section>

      <Section title="Notes in the text" hint="Your notes in parentheses, added right after the passage they are about.">
        <div className="divide-y">
          {NOTE_RULES.map((n) => (
            <Row key={n.id} on={b[n.id].enabled} onToggle={(enabled) => set(n.id, { enabled })} label={n.label}>
              <p className="font-medium leading-snug">{n.label}</p>
              <p className="mb-2 text-sm text-muted-foreground">{n.when}</p>
              <Textarea value={b[n.id].note} onChange={(e) => set(n.id, { note: e.target.value })} rows={2} aria-label={`Note for: ${n.label}`} />
              {n.placeholders && <p className="mt-1 text-xs text-muted-foreground">{n.placeholders}</p>}
              {n.id === "longParagraph" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  When a paragraph has at least
                  <Input type="number" min={3} value={b.longParagraph.maxSentences} onChange={(e) => set("longParagraph", { maxSentences: Number(e.target.value) })} className="w-20 tabular-nums" />
                  sentences
                </label>
              )}
            </Row>
          ))}
        </div>
      </Section>

      <Section title="Header block" hint="Title, applicant’s name, program and university at the top of narrative documents. Missing lines are added; unknown values become “????” prompts.">
        <Row on={b.headerBlock.enabled} onToggle={(enabled) => set("headerBlock", { enabled })} label="Header block">
          <p className="mb-2 font-medium">Add missing header lines</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["Study Plan", "Autobiography", "Personal Statement", "Statement of Purpose", "Essay"] as DocType[]).map((t) => (
              <label key={t} className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Title for {t}</span>
                <Input value={b.headerBlock.titles[t] ?? ""} onChange={(e) => set("headerBlock", { titles: { ...b.headerBlock.titles, [t]: e.target.value } })} />
              </label>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="End Note block" hint="The “Note:” list at the end of the document. Your own end-note lines live under Your rules.">
        <Row on={b.endNote.enabled} onToggle={(enabled) => set("endNote", { enabled })} label="End Note block">
          <Field label="Heading">
            <Input value={b.endNote.heading} onChange={(e) => set("endNote", { heading: e.target.value })} className="max-w-[12rem]" />
          </Field>
        </Row>
        <div className="divide-y border-t pt-3">
          <Row on={b.lengthCheck.enabled} onToggle={(enabled) => set("lengthCheck", { enabled })} label="Length check">
            <p className="font-medium">Length check</p>
            <p className="mb-2 text-sm text-muted-foreground">When the body is longer than the limit, this line is added. You can use {"{words}"} and {"{pages}"}.</p>
            <div className="space-y-3">
              {b.lengthCheck.limits.map((l, i) => (
                <div key={i} className="grid gap-2 rounded-md bg-muted/50 p-2.5 sm:grid-cols-[11rem_8.5rem_1fr]">
                  <NativeSelect
                    ariaLabel="Document type"
                    value={l.docType}
                    onChange={(docType) => set("lengthCheck", { limits: b.lengthCheck.limits.map((x, j) => (j === i ? { ...x, docType } : x)) })}
                    options={DOC_TYPES.map((t) => ({ value: t, label: t }))}
                  />
                  <label className="flex items-center gap-1.5 text-sm">
                    <Input type="number" min={1} value={l.maxWords} onChange={(e) => set("lengthCheck", { limits: b.lengthCheck.limits.map((x, j) => (j === i ? { ...x, maxWords: Number(e.target.value) } : x)) })} className="w-24 tabular-nums" aria-label="Word limit" />
                    words
                  </label>
                  <div className="flex gap-1.5 sm:col-span-1">
                    <Textarea value={l.message} onChange={(e) => set("lengthCheck", { limits: b.lengthCheck.limits.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)) })} rows={2} aria-label={`Message for ${l.docType}`} />
                    <Button size="icon-sm" variant="ghost" onClick={() => set("lengthCheck", { limits: b.lengthCheck.limits.filter((_, j) => j !== i) })} aria-label="Remove limit">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set("lengthCheck", { limits: [...b.lengthCheck.limits, { docType: "Study Plan", maxWords: 1000, message: "" }] })}>
                <Plus /> Add a limit
              </Button>
              <Field label="When within the limit">
                <Textarea value={b.lengthCheck.withinMessage} onChange={(e) => set("lengthCheck", { withinMessage: e.target.value })} rows={2} />
              </Field>
            </div>
          </Row>
          <Row on={b.essayLimit.enabled} onToggle={(enabled) => set("essayLimit", { enabled })} label="Essay word limit">
            <p className="font-medium">Essay over its word limit</p>
            <p className="mb-2 text-sm text-muted-foreground">For essay prompts that say “(500 words max)”. Placeholders: {"{ordinal}"}, {"{limit}"}, {"{words}"}.</p>
            <Textarea value={b.essayLimit.message} onChange={(e) => set("essayLimit", { message: e.target.value })} rows={2} />
          </Row>
          <Row on={b.paragraphBalance.enabled} onToggle={(enabled) => set("paragraphBalance", { enabled })} label="Paragraph balance">
            <p className="font-medium">Unbalanced paragraphs</p>
            <p className="mb-2 text-sm text-muted-foreground">Some paragraphs have 7+ sentences while others have only 1–2.</p>
            <Textarea value={b.paragraphBalance.message} onChange={(e) => set("paragraphBalance", { message: e.target.value })} rows={2} />
          </Row>
          <Row on={b.listsAndTables.enabled} onToggle={(enabled) => set("listsAndTables", { enabled })} label="Lists and tables">
            <p className="font-medium">Bullet points or tables instead of paragraphs</p>
            <p className="mb-2 text-sm text-muted-foreground">A table, or 5 or more list lines (not in essays).</p>
            <Textarea value={b.listsAndTables.message} onChange={(e) => set("listsAndTables", { message: e.target.value })} rows={2} />
          </Row>
          <Row on={b.tooManySections.enabled} onToggle={(enabled) => set("tooManySections", { enabled })} label="Too many sections">
            <p className="font-medium">Too many numbered sections</p>
            <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              At least
              <Input type="number" min={2} value={b.tooManySections.minSections} onChange={(e) => set("tooManySections", { minSections: Number(e.target.value) })} className="w-16 tabular-nums" />
              numbered headings. Placeholder: {"{sections}"}.
            </label>
            <Textarea value={b.tooManySections.message} onChange={(e) => set("tooManySections", { message: e.target.value })} rows={2} />
          </Row>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function FormattingStandard({ f, onChange }: { f: FormatStandard; onChange: Set<FormatStandard> }) {
  const set = (p: Partial<FormatStandard>) => onChange({ ...f, ...p });
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <Section title="Formatting standard" hint="The bot fixes body text to this standard as tracked formatting changes, and adds the reminder to the end Note when the document was off.">
        <Field label="Font" htmlFor="fmt-font">
          <Input id="fmt-font" value={f.font} onChange={(e) => set({ font: e.target.value })} className="max-w-xs" />
        </Field>
        <Field label="Body size" htmlFor="fmt-size">
          <span className="flex items-center gap-2 text-sm">
            <Input id="fmt-size" type="number" step="0.5" value={Number.isNaN(f.sizePt) ? "" : f.sizePt} onChange={(e) => set({ sizePt: num(e.target.value) })} className="w-20 tabular-nums" /> pt
          </span>
        </Field>
        <Field label="Title size note" hint="Shown after the size in the reminder." htmlFor="fmt-title">
          <Input id="fmt-title" value={f.titleNote} onChange={(e) => set({ titleNote: e.target.value })} />
        </Field>
        <Field label="Alignment">
          <Segmented ariaLabel="Alignment" value={f.alignment} onChange={(alignment) => set({ alignment })} options={[{ value: "justified", label: "Justified" }, { value: "left", label: "Left" }]} />
        </Field>
        <Field label="Line spacing" hint="Spacing tighter than the minimum is changed to the standard.">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              Standard
              <Input type="number" step="0.05" value={Number.isNaN(f.lineSpacing) ? "" : f.lineSpacing} onChange={(e) => set({ lineSpacing: num(e.target.value) })} className="w-20 tabular-nums" />
            </label>
            <label className="flex items-center gap-1.5">
              Accept from
              <Input type="number" step="0.05" value={Number.isNaN(f.minLineSpacing) ? "" : f.minLineSpacing} onChange={(e) => set({ minLineSpacing: num(e.target.value) })} className="w-20 tabular-nums" />
            </label>
          </div>
        </Field>
        <Field label="Margins" htmlFor="fmt-margins">
          <Input id="fmt-margins" value={f.margins} onChange={(e) => set({ margins: e.target.value })} />
        </Field>
        <Field label="Page number" htmlFor="fmt-page">
          <Input id="fmt-page" value={f.pageNumber} onChange={(e) => set({ pageNumber: e.target.value })} />
        </Field>
        <Field label="Fix automatically in" hint="Other types keep their own format (CVs, letters, scripts); the score still checks them.">
          <DocTypeChips value={f.autoFix} onChange={(autoFix) => set({ autoFix })} allowAll={false} />
        </Field>
        <Field label="Reminder heading" htmlFor="fmt-rem">
          <Input id="fmt-rem" value={f.reminderTitle} onChange={(e) => set({ reminderTitle: e.target.value })} />
        </Field>
      </Section>
      <aside className="h-fit rounded-lg border bg-card p-4 text-sm lg:sticky lg:top-4">
        <p className="mb-2 font-medium">The reminder students see</p>
        <ul className="space-y-0.5 font-serif text-[0.95rem] leading-snug">
          {formatReminder(f).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function GrammarChecker({ g, onChange }: { g: Record<string, GrammarUse>; onChange: Set<Record<string, GrammarUse>> }) {
  return (
    <Section
      title="Grammar checker"
      hint="An offline checker (free, no AI). “Your style” changes look like your normal edits. “Beyond your style” changes are also made, but flagged privately in the app so you can reject them quickly."
    >
      <ul className="divide-y">
        {GRAMMAR_KINDS.map((k) => (
          <li key={k.kind} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium leading-snug">{k.label}</p>
              <p className="text-sm text-muted-foreground">{k.example}</p>
            </div>
            <Segmented
              ariaLabel={k.label}
              value={g[k.kind] ?? "off"}
              onChange={(v) => onChange({ ...g, [k.kind]: v })}
              options={[{ value: "off", label: "Off" }, { value: "style", label: "Your style" }, { value: "extra", label: "Beyond your style" }]}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function ListTable<T>({ rows, onChange, columns, blank, addLabel }: {
  rows: T[];
  onChange: Set<T[]>;
  columns: { label: string; get: (r: T) => string; set: (r: T, v: string) => T; className?: string }[];
  blank: T;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid" style={{ gridTemplateColumns: `${columns.map((c) => c.className ?? "1fr").join(" ")} 2rem` }}>
        {columns.map((c) => (
          <span key={c.label}>{c.label}</span>
        ))}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_2rem] gap-2 max-sm:border-b max-sm:pb-2 sm:[grid-template-columns:var(--cols)]" style={{ ["--cols" as string]: `${columns.map((c) => c.className ?? "1fr").join(" ")} 2rem` }}>
            <div className="contents max-sm:flex max-sm:flex-col max-sm:gap-1">
              {columns.map((c) => (
                <Input key={c.label} value={c.get(r)} onChange={(e) => onChange(rows.map((x, j) => (j === i ? c.set(x, e.target.value) : x)))} aria-label={c.label} />
              ))}
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove row" className="mt-0.5">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" onClick={() => onChange([...rows, blank])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

const splitNames = (v: string) => v.split(";").map((s) => s.trimStart());

export function NameLists({ lists, onChange }: { lists: RuleConfig["lists"]; onChange: Set<RuleConfig["lists"]> }) {
  const set = <K extends keyof RuleConfig["lists"]>(k: K, v: RuleConfig["lists"][K]) => onChange({ ...lists, [k]: v });
  return (
    <div className="space-y-5">
      <Section title="Indonesian university names" hint="English names students write, and the official Indonesian name you want instead (first mention). Separate several English names with “;”.">
        <ListTable
          rows={lists.indonesianUniversities}
          onChange={(v) => set("indonesianUniversities", v)}
          blank={{ names: [""], official: "" }}
          addLabel="Add a university"
          columns={[
            { label: "English name(s)", get: (r) => r.names.join("; "), set: (r, v) => ({ ...r, names: splitNames(v) }) },
            { label: "Official name", get: (r) => r.official, set: (r, v) => ({ ...r, official: v }) },
          ]}
        />
      </Section>
      <Section title="Indonesian university acronyms" hint="Written out at first mention: “IPB” → “Institut Pertanian Bogor (IPB)”.">
        <ListTable
          rows={lists.universityAcronyms}
          onChange={(v) => set("universityAcronyms", v)}
          blank={{ acronym: "", full: "" }}
          addLabel="Add an acronym"
          columns={[
            { label: "Acronym", get: (r) => r.acronym, set: (r, v) => ({ ...r, acronym: v }), className: "8rem" },
            { label: "Full name", get: (r) => r.full, set: (r, v) => ({ ...r, full: v }) },
          ]}
        />
      </Section>
      <Section title="Other Indonesian acronyms" hint="Explained in brackets at first mention: “BUMN (Badan Usaha Milik Negara)”.">
        <ListTable
          rows={lists.indonesianAcronyms}
          onChange={(v) => set("indonesianAcronyms", v)}
          blank={{ acronym: "", full: "" }}
          addLabel="Add an acronym"
          columns={[
            { label: "Acronym", get: (r) => r.acronym, set: (r, v) => ({ ...r, acronym: v }), className: "8rem" },
            { label: "Meaning", get: (r) => r.full, set: (r, v) => ({ ...r, full: v }) },
          ]}
        />
      </Section>
      <Section title="Universities in Taiwan" hint="Used to fill in “University applied for” in the header. Separate several short names with “;”.">
        <ListTable
          rows={lists.taiwanUniversities}
          onChange={(v) => set("taiwanUniversities", v)}
          blank={{ name: "", short: [] }}
          addLabel="Add a university"
          columns={[
            { label: "Name", get: (r) => r.name, set: (r, v) => ({ ...r, name: v }) },
            { label: "Short names", get: (r) => r.short.join("; "), set: (r, v) => ({ ...r, short: v.trim() ? splitNames(v) : [] }), className: "12rem" },
          ]}
        />
      </Section>
    </div>
  );
}
