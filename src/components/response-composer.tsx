"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, SendHorizonal } from "lucide-react";

interface ResponseComposerProps {
  placeholder: string;
  disabled: boolean;
  onSend: (text: string) => void;
  onStartVoice: () => void;
  voiceEnabled: boolean;
}

export function ResponseComposer({
  placeholder,
  disabled,
  onSend,
  onStartVoice,
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
