"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

interface QuestionPreviewProps {
  imageUrl: string;
  /** Collapsed inside the session, expanded while the transcription is checked. */
  variant?: "inline" | "banner";
  label?: string;
}

export function QuestionPreview({
  imageUrl,
  variant = "inline",
  label = "The question you uploaded",
}: QuestionPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (expanded && !dialog.open) {
      dialog.showModal();
    } else if (!expanded && dialog.open) {
      dialog.close();
    }
  }, [expanded]);

  return (
    <>
      {variant === "inline" ? (
        <figure className="overflow-hidden rounded-md border border-rule bg-surface">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never a remote asset */}
            <img
              src={imageUrl}
              alt={label}
              className="max-h-72 w-full bg-canvas object-contain"
            />
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand the question image"
              className="absolute right-2 bottom-2 flex h-11 w-11 items-center justify-center rounded-md border border-rule bg-surface/95 text-ink"
            >
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </figure>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-h-11 w-full items-center gap-3 border-b border-rule bg-surface px-4 py-2 text-left"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never a remote asset */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            className="h-9 w-12 rounded-sm border border-rule object-cover"
          />
          <span className="flex-1 text-sm text-ink-soft">Question</span>
          <span className="text-sm font-medium text-action">Open</span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setExpanded(false)}
        aria-label="Question image"
        className="m-auto max-h-[90dvh] w-[92vw] max-w-3xl rounded-md bg-surface p-0 backdrop:bg-ink/70"
      >
        <div className="flex items-center justify-between border-b border-rule px-3 py-2">
          <span className="text-sm text-ink-soft">{label}</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close the question image"
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never a remote asset */}
        <img src={imageUrl} alt={label} className="max-h-[76dvh] w-full object-contain p-2" />
      </dialog>
    </>
  );
}
