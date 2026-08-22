"use client";

import { useRef } from "react";
import { Camera, ImageIcon } from "lucide-react";
import { SUBJECT_LABELS } from "@/lib/ai/subjects";
import type { Subject } from "@/types/tutor";

interface CaptureQuestionProps {
  onSelect: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
  subject: Subject;
  onSubjectChange: (subject: Subject) => void;
}

export function CaptureQuestion({
  onSelect,
  disabled = false,
  error,
  subject,
  onSubjectChange,
}: CaptureQuestionProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file twice still fires a change event.
    event.target.value = "";
    if (file) {
      onSelect(file);
    }
  };

  return (
    <section className="px-4 pt-6 sm:px-6" aria-labelledby="capture-heading">
      <h1 id="capture-heading" className="font-serif text-2xl leading-snug text-ink">
        Bring in one question
      </h1>

      <div
        role="radiogroup"
        aria-label="Subject"
        className="mt-4 flex gap-2 rounded-md border border-rule bg-surface p-1"
      >
        {SUBJECT_LABELS.map((option) => {
          const active = option.id === subject;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSubjectChange(option.id)}
              className={`min-h-11 flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-action text-white" : "text-ink-soft"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-sm text-ink-soft">
        A photo of the page, or a screenshot. One question at a time works best.
      </p>

      <div className="mt-6 flex aspect-4/3 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-rule bg-surface text-ink-faint">
        <Camera aria-hidden="true" className="h-9 w-9" strokeWidth={1.4} />
        <span className="text-sm">Photo or screenshot</span>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-sm bg-error-soft px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraInput.current?.click()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-action px-4 py-3 text-base font-medium text-white transition-opacity disabled:opacity-50"
        >
          <Camera aria-hidden="true" className="h-5 w-5" />
          Take a photo
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => libraryInput.current?.click()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-rule bg-surface px-4 py-3 text-base font-medium text-ink transition-opacity disabled:opacity-50"
        >
          <ImageIcon aria-hidden="true" className="h-5 w-5" />
          Choose an image
        </button>
      </div>

      <p className="mt-6 pb-8 text-xs leading-relaxed text-ink-faint">
        The image is used for this session and is not saved in the cloud.
      </p>

      <input
        ref={cameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </section>
  );
}
