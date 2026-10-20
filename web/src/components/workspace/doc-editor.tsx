"use client";

import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import "@superdoc/react/style.css";
import { forwardRef, useMemo } from "react";

export type Mode = "suggesting" | "editing" | "viewing";

export interface DocEditorProps {
  file: File;
  mode: Mode;
  userName: string;
  /** "markup" shows tracked changes; "final" the result with changes applied; "original" the text before changes. */
  viewMarkup?: "markup" | "final" | "original";
  toolbar?: boolean;
  /** Phone: reflow text to the screen width (Word's web layout) instead of showing whole pages. */
  reflow?: boolean;
  onReady?: (superdoc: unknown) => void;
  onUpdate?: () => void;
  onError?: (message: string) => void;
}

/** Pages follow the document column: smaller when it narrows, bigger (up to 200%) when Karina drags it wider. */
const ZOOM = { mode: "fit-width" as const, fitWidth: { max: 200, padding: 16 } };
const WEB_LAYOUT = { layout: "web" as const };

/** SuperDoc Word editor. Telemetry is off: nothing about the student's document leaves this app. */
const DocEditor = forwardRef<SuperDocRef, DocEditorProps>(function DocEditor(
  { file, mode, userName, viewMarkup = "markup", toolbar = true, reflow = false, onReady, onUpdate, onError },
  ref,
) {
  const user = useMemo(() => ({ name: userName, email: "" }), [userName]);
  const viewing = useMemo(() => ({ comments: true, trackedChanges: viewMarkup }), [viewMarkup]);
  // Toolbar fits its own column (extra controls go into its overflow menu); comment and change bubbles
  // move inline when the page column is narrow, so they never cover the review panel.
  const ui = useMemo(
    () => ({ toolbar: { responsiveTo: "container" as const, overflow: "menu" as const }, comments: { layout: "auto" as const } }),
    [],
  );
  return (
    <SuperDocEditor
      ref={ref}
      document={file}
      documentMode={mode}
      user={user}
      role="editor"
      telemetry={{ enabled: false }}
      viewing={viewing}
      ui={ui}
      {...(reflow ? { viewOptions: WEB_LAYOUT } : { zoom: ZOOM })}
      hideToolbar={!toolbar}
      contained
      style={{ height: "100%" }}
      onReady={(e) => onReady?.((e as { superdoc?: unknown }).superdoc)}
      onEditorUpdate={() => onUpdate?.()}
      onContentError={(e) => onError?.(String((e as { error?: { message?: string } })?.error?.message ?? "The document could not be opened."))}
      onException={(e) => onError?.(String((e as { error?: { message?: string } })?.error?.message ?? "Editor error"))}
    />
  );
});

export default DocEditor;
