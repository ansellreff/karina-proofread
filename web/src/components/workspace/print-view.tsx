"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const DocEditor = dynamic(() => import("./doc-editor"), { ssr: false });

export function PrintView({ jobId, version, fileName, title, markup }: { jobId: string; version: number; fileName: string; title: string; markup: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = title; // becomes the suggested PDF file name
    fetch(`/api/jobs/${jobId}/file?v=${version}&view=editor`)
      .then((r) => r.blob())
      .then((b) => setFile(new File([b], fileName)));
  }, [jobId, version, fileName, title]);

  // Printing is always on white: switch this tab to light mode while it is open (restored when leaving).
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    const keepLight = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark");
    };
    keepLight();
    html.style.colorScheme = "light";
    const watch = new MutationObserver(keepLight);
    watch.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => {
      watch.disconnect();
      html.style.colorScheme = "";
      if (wasDark) html.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <div className="force-light flex h-[calc(100dvh-3.5rem)] flex-col print:h-auto">
      <div className="no-print flex items-center gap-3 border-b bg-card px-4 py-2 text-sm">
        <p className="flex-1 text-muted-foreground">
          {ready ? "In the print dialog, choose “Save as PDF”." : "Preparing the document…"} {markup ? "With tracked changes shown." : "Clean, with all changes applied."}
        </p>
        <Button size="sm" onClick={() => window.print()} disabled={!ready}>
          Print or save as PDF
        </Button>
      </div>
      <div className="min-h-0 flex-1 print:overflow-visible">
        {file && (
          <DocEditor file={file} mode="viewing" userName="" viewMarkup={markup ? "markup" : "final"} toolbar={false} onReady={() => setReady(true)} />
        )}
      </div>
    </div>
  );
}
