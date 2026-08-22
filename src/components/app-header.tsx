"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MoreVertical } from "lucide-react";

interface AppHeaderProps {
  autoReadAloud: boolean;
  hinglish: boolean;
  onToggleReadAloud: () => void;
  onToggleLanguage: () => void;
  onNewQuestion: () => void;
  onClearMemory: () => void;
  onShowPrivacy: () => void;
}

/** Section 6: the whole overflow menu, and nothing more. */
export function AppHeader({
  autoReadAloud,
  hinglish,
  onToggleReadAloud,
  onToggleLanguage,
  onNewQuestion,
  onClearMemory,
  onShowPrivacy,
}: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-canvas/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2 sm:px-6">
        <div>
          <p className="font-serif text-lg leading-tight text-ink">Next Thought</p>
          <p className="text-xs text-ink-faint">JEE Mathematics</p>
        </div>

        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="More options"
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink"
          >
            <MoreVertical aria-hidden="true" className="h-5 w-5" />
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-md border border-rule bg-surface shadow-lg"
            >
              <MenuItem onClick={run(onNewQuestion)}>Start a new question</MenuItem>
              <MenuItem onClick={run(onToggleLanguage)}>
                <span className="flex flex-1 items-center justify-between">
                  Talk in Hinglish
                  {hinglish ? <Check aria-hidden="true" className="h-4 w-4 text-action" /> : null}
                </span>
                <span className="sr-only">{hinglish ? "on" : "off"}</span>
              </MenuItem>
              <MenuItem onClick={run(onToggleReadAloud)}>
                <span className="flex flex-1 items-center justify-between">
                  Read replies aloud
                  {autoReadAloud ? <Check aria-hidden="true" className="h-4 w-4 text-action" /> : null}
                </span>
                <span className="sr-only">{autoReadAloud ? "on" : "off"}</span>
              </MenuItem>
              <MenuItem onClick={run(onClearMemory)}>Clear learning memory</MenuItem>
              <MenuItem onClick={run(onShowPrivacy)}>Privacy</MenuItem>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center px-4 py-3 text-left text-sm text-ink hover:bg-action-soft"
    >
      {children}
    </button>
  );
}
