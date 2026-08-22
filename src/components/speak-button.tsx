"use client";

import { Loader2, Volume2, VolumeX } from "lucide-react";

interface SpeakButtonProps {
  onSpeak: () => void;
  onStop: () => void;
  state: "idle" | "loading" | "playing";
  label?: string;
}

/** Reads the tutor's plain speechText. Off by default, one tap away. */
export function SpeakButton({ onSpeak, onStop, state, label = "this reply" }: SpeakButtonProps) {
  const playing = state === "playing";
  const Icon = state === "loading" ? Loader2 : playing ? VolumeX : Volume2;

  return (
    <button
      type="button"
      onClick={playing ? onStop : onSpeak}
      aria-label={playing ? `Stop reading ${label}` : `Read ${label} aloud`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-faint hover:text-action"
    >
      <Icon
        aria-hidden="true"
        className={`h-5 w-5 ${state === "loading" ? "animate-spin" : ""}`}
      />
    </button>
  );
}
