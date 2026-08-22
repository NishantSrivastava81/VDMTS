"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, SendHorizonal } from "lucide-react";

type AlwaysAction =
  | "Explain in simpler words"
  | "How does this fit together?"
  | "Show the full solution";

interface ResponseComposerProps {
  placeholder: string;
  disabled: boolean;
  onSend: (text: string) => void;
  onStartVoice: () => void;
  onAlwaysAction: (action: AlwaysAction) => void;
  voiceEnabled: boolean;
}

export function ResponseComposer({
  placeholder,
  disabled,
  onSend,
  onStartVoice,
  onAlwaysAction,
  voiceEnabled,
}: ResponseComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    setValue("");
    onSend(trimmed);
  };

  return (
    <form
      className="pb-composer sticky bottom-0 border-t border-rule bg-canvas/95 px-3 pt-2 backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Always reachable, never inviting: no lock, but not the loudest control either. */}
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAlwaysAction("Explain in simpler words")}
          className="min-h-9 text-sm text-action underline underline-offset-4 disabled:opacity-40"
        >
          Simpler words
        </button>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAlwaysAction("How does this fit together?")}
          className="min-h-9 text-sm text-action underline underline-offset-4 disabled:opacity-40"
        >
          How it fits together
        </button>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAlwaysAction("Show the full solution")}
          className="min-h-9 text-sm text-ink-soft underline underline-offset-4 disabled:opacity-40"
        >
          Full answer
        </button>
      </div>

      <div className="flex items-end gap-2">
        {voiceEnabled ? (
          <button
            type="button"
            onClick={onStartVoice}
            disabled={disabled}
            aria-label="Answer by speaking"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-rule bg-surface text-ink disabled:opacity-50"
          >
            <Mic aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}

        <label htmlFor="student-response" className="sr-only">
          Your next step
        </label>
        <textarea
          id="student-response"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-36 min-h-11 flex-1 resize-none rounded-md border border-rule bg-surface px-3 py-2.5 leading-relaxed text-ink placeholder:text-ink-faint disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send your answer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-action text-white disabled:opacity-40"
        >
          <SendHorizonal aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1 text-center text-[11px] text-ink-faint">
        Plain words are fine. You never need to type LaTeX.
      </p>
    </form>
  );
}
