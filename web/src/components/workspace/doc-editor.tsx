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
  /**
   * Word-style balloons: every change and comment as a card in a column beside the page (the page makes room).
   * Off: a change's card opens when it is clicked. Fixed when the editor opens (SuperDoc has no runtime switch).
   */
  balloons?: boolean;
  onReady?: (superdoc: unknown) => void;
  onUpdate?: () => void;
  onError?: (message: string) => void;
}

/** Pages follow the document column: smaller when it narrows, bigger (up to 200%) when Karina drags it wider. */
const ZOOM = { mode: "fit-width" as const, fitWidth: { max: 200, padding: 16 } };
const WEB_LAYOUT = { layout: "web" as const };
/** Below this editor width the balloons column leaves too little page (e.g. side by side): balloons open on click. */
export const BALLOON_MIN_WIDTH = 860;

/** SuperDoc Word editor. Telemetry is off: nothing about the student's document leaves this app. */
const DocEditor = forwardRef<SuperDocRef, DocEditorProps>(function DocEditor(
  { file, mode, userName, viewMarkup = "markup", toolbar = true, reflow = false, balloons = false, onReady, onUpdate, onError },
  ref,
) {
  const user = useMemo(() => ({ name: userName, email: "" }), [userName]);
  const viewing = useMemo(() => ({ comments: true, trackedChanges: viewMarkup }), [viewMarkup]);
  // Toolbar fits its own column (extra controls go into its overflow menu). Balloons on: a column beside the page
  // while the editor is at least BALLOON_MIN_WIDTH wide, otherwise (side by side, a wide panel) a card on click —
  // SuperDoc switches by itself as the width changes. Off: always a card on click. The phone picks by width.
  const comments = useMemo(
    () =>
      reflow
        ? { layout: "auto" as const }
        : balloons
          ? { layout: "auto" as const, responsive: { breakpoint: BALLOON_MIN_WIDTH } }
          : { layout: "inline" as const },
    [reflow, balloons],
  );
  const ui = useMemo(() => ({ toolbar: { responsiveTo: "container" as const, overflow: "menu" as const }, comments }), [comments]);
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
