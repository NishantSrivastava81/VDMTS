"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccessGate } from "@/components/access-gate";
import { AppHeader } from "@/components/app-header";
import { CaptureQuestion } from "@/components/capture-question";
import { ConceptOpening } from "@/components/concept-opening";
import { QuestionPreview } from "@/components/question-preview";
import { ReflectionStep } from "@/components/reflection-step";
import { ResponseComposer } from "@/components/response-composer";
import { TranscriptionCheck } from "@/components/transcription-check";
import { TutorThread } from "@/components/tutor-thread";
import { VoiceRecorder } from "@/components/voice-recorder";
import { compressQuestionImage } from "@/lib/image/compress";
import {
  clearConceptMemory,
  clearSession,
  findConceptMemory,
  loadConceptSummaries,
  loadPreferences,
  loadSession,
  newSessionId,
  rememberConcept,
  savePreferences,
  saveSession,
} from "@/lib/session/local-store";
import { buildLearningRecord } from "@/lib/session/machine";
import { speak, stopSpeaking } from "@/lib/speech/client";
import type {
  AnalyzeResult,
  ApiErrorBody,
  ConversationTurn,
  SessionMessage,
  StoredSession,
  SuggestedAction,
  TutorMessage,
  TutorTurnResult,
} from "@/types/tutor";

type Stage = "capture" | "analysing" | "confirm" | "session" | "reflect";
type SpeechState = "idle" | "loading" | "playing";

const ANALYSIS_STAGES = ["Reading the notation", "Checking the key idea"] as const;

export function TutorSession() {
  const [stage, setStage] = useState<Stage>("capture");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState(0);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<AnalyzeResult | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [carryForwardCue, setCarryForwardCue] = useState<string | null>(null);

  const [autoReadAloud, setAutoReadAloud] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(true);
  const [speaking, setSpeaking] = useState<{ id: string; state: SpeechState } | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Reading localStorage must happen after hydration, or the server and client
    // would render different markup.
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore from an external store */
    setAutoReadAloud(loadPreferences().autoReadAloud);
    const restored = loadSession();
    if (restored) {
      setSession(restored);
      setStage(restored.state.phase === "reflect" ? "reflect" : "session");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (stage !== "analysing") {
      return;
    }
    const timer = setTimeout(() => setAnalysisStage(1), 4000);
    return () => clearTimeout(timer);
  }, [stage]);

  const persist = useCallback((next: StoredSession) => {
    setSession(next);
    saveSession(next);
  }, []);

  const handleApiError = useCallback(async (response: Response): Promise<string> => {
    if (response.status === 401) {
      setLocked(true);
      return "";
    }
    try {
      const body = (await response.json()) as ApiErrorBody;
      return body.error.message;
    } catch {
      return "Something went wrong at my end. Your work is still here; try again.";
    }
  }, []);

  const startSession = useCallback(
    (result: AnalyzeResult, confirmedMarkdown: string) => {
      const { analysis: plan, initialState } = result;
      persist({
        version: 1,
        sessionId: newSessionId(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        question: {
          displayMarkdown: confirmedMarkdown,
          diagramDescription: plan.transcription.diagramDescription,
          chapter: plan.classification.chapter,
          primaryConceptId: plan.classification.primaryConceptId,
          primaryConceptName: plan.classification.primaryConceptName,
        },
        opening: plan.opening,
        privatePlan: plan.privatePlan,
        state: { ...initialState, phase: "orient" },
        messages: [],
        transferOffered: false,
      });
      setStage("session");
    },
    [persist],
  );

  const analyse = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setAnalysisStage(0);
      setStage("analysing");

      try {
        const compressed = await compressQuestionImage(file);

        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }
        const url = URL.createObjectURL(compressed.blob);
        imageUrlRef.current = url;
        setImageUrl(url);

        const form = new FormData();
        form.append("image", compressed.blob, "question.jpg");
        form.append("sessionId", newSessionId());
        form.append("knownConcepts", JSON.stringify(loadConceptSummaries()));

        const response = await fetch("/api/question/analyze", { method: "POST", body: form });
        if (!response.ok) {
          setError(await handleApiError(response));
          setStage("capture");
          return;
        }

        const result = (await response.json()) as AnalyzeResult;
        setPendingResult(result);

        if (result.analysis.needsConfirmation) {
          setStage("confirm");
          return;
        }
        startSession(result, result.analysis.transcription.displayMarkdown);
      } catch {
        setError("I could not read that image. Try a clearer photo or a screenshot.");
        setStage("capture");
      } finally {
        setBusy(false);
      }
    },
    [handleApiError, startSession],
  );

  const readAloud = useCallback(async (id: string, speechText: string) => {
    setSpeaking({ id, state: "loading" });
    try {
      setSpeaking({ id, state: "playing" });
      await speak(speechText);
    } catch {
      setVoiceAvailable(false);
    } finally {
      setSpeaking(null);
    }
  }, []);

  const stopReading = useCallback(() => {
    void stopSpeaking();
    setSpeaking(null);
  }, []);

  const sendToTutor = useCallback(
    async (text: string, inputMode: "text" | "voice" | "action") => {
      if (!session) {
        return;
      }

      const studentMessage: SessionMessage = {
        id: newSessionId(),
        role: "student",
        text,
        inputMode,
      };

      const withStudent: StoredSession = {
        ...session,
        messages: [...session.messages, studentMessage],
      };
      persist(withStudent);
      setBusy(true);
      setError(null);
      void stopSpeaking();

      try {
        const response = await fetch("/api/tutor/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: withStudent.sessionId,
            question: withStudent.question,
            privatePlan: withStudent.privatePlan,
            state: withStudent.state,
            recentTurns: toRecentTurns(withStudent.messages),
            learningNotes: findConceptMemory(withStudent.question.primaryConceptId),
            studentMessage: text,
            inputMode,
          }),
        });

        if (!response.ok) {
          setError(await handleApiError(response));
          return;
        }

        const result = (await response.json()) as TutorTurnResult;
        const tutorMessage: TutorMessage = {
          id: newSessionId(),
          role: "tutor",
          displayMarkdown: result.response.teacher.displayMarkdown,
          speechText: result.response.teacher.speechText,
          move: result.response.teacher.move,
          suggestedActions: result.response.suggestedActions,
          carryForwardCue: result.response.teacher.carryForwardCue,
          mathFallback: result.mathFallback,
        };

        persist({
          ...withStudent,
          state: result.state,
          messages: [...withStudent.messages, tutorMessage],
        });

        if (result.response.teacher.carryForwardCue) {
          setCarryForwardCue(result.response.teacher.carryForwardCue);
        }
        if (result.state.phase === "reflect" || result.state.phase === "transfer") {
          setStage("reflect");
        }
        if (autoReadAloud) {
          void readAloud(tutorMessage.id, tutorMessage.speechText);
        }
      } catch {
        setError("I could not reach the tutor just now. Your work is still here; try again.");
      } finally {
        setBusy(false);
      }
    },
    [session, persist, handleApiError, autoReadAloud, readAloud],
  );

  const finish = useCallback(
    (transferOutcome: "notTried" | "neededHelp" | "independent") => {
      if (session) {
        rememberConcept(
          buildLearningRecord(
            {
              conceptId: session.question.primaryConceptId,
              conceptName: session.question.primaryConceptName,
              triggerCue: session.privatePlan.transferCue,
            },
            session.state,
            transferOutcome,
          ),
        );
      }

      clearSession();
      setSession(null);
      setPendingResult(null);
      setCarryForwardCue(null);
      setStage("capture");
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
      setImageUrl(null);
    },
    [session],
  );

  const startNewQuestion = useCallback(() => {
    if (session && !window.confirm("Start a new question? This clears the current one.")) {
      return;
    }
    finish("notTried");
  }, [session, finish]);

  if (locked) {
    return <AccessGate onUnlocked={() => setLocked(false)} />;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col">
      <AppHeader
        autoReadAloud={autoReadAloud}
        onToggleReadAloud={() => {
          const next = !autoReadAloud;
          setAutoReadAloud(next);
          savePreferences({ autoReadAloud: next });
          if (!next) {
            stopReading();
          }
        }}
        onNewQuestion={startNewQuestion}
        onClearMemory={() => {
          clearConceptMemory();
          setError("Learning memory cleared.");
        }}
        onShowPrivacy={() => setShowPrivacy(true)}
      />

      {session && imageUrl ? <QuestionPreview imageUrl={imageUrl} variant="banner" /> : null}

      <main className="flex-1">
        {stage === "capture" ? (
          <CaptureQuestion onSelect={analyse} disabled={busy} error={error} />
        ) : null}

        {stage === "analysing" ? (
          <section className="px-4 pt-10 sm:px-6" aria-live="polite">
            <p className="text-sm text-ink-soft">{ANALYSIS_STAGES[analysisStage]}</p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-rule">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-action" />
            </div>
          </section>
        ) : null}

        {stage === "confirm" && pendingResult && imageUrl ? (
          <TranscriptionCheck
            imageUrl={imageUrl}
            analysis={pendingResult.analysis}
            onBack={() => setStage("capture")}
            onConfirm={(corrected) => startSession(pendingResult, corrected)}
          />
        ) : null}

        {stage === "session" && session ? (
          <>
            <ConceptOpening
              opening={session.opening}
              speechState={speaking?.id === "opening" ? speaking.state : "idle"}
              onSpeak={() => readAloud("opening", session.opening.speechText)}
              onStopSpeaking={stopReading}
              onExplainAgain={() => sendToTutor("Explain another way", "action")}
              canExplainAgain={session.messages.length === 0 && !busy}
            />
            <TutorThread
              messages={session.messages}
              thinking={busy}
              speakingMessageId={speaking?.id ?? null}
              speechState={speaking?.state ?? "idle"}
              onSpeak={readAloud}
              onStopSpeaking={stopReading}
              onSuggestedAction={(action: SuggestedAction) => sendToTutor(action, "action")}
              actionsDisabled={busy}
            />
          </>
        ) : null}

        {stage === "reflect" && session ? (
          <ReflectionStep
            prompt={
              lastTutorMessage(session.messages)?.displayMarkdown ??
              "What clue in this question would tell you to use this idea next time?"
            }
            carryForwardCue={carryForwardCue}
            busy={busy}
            voiceEnabled={voiceAvailable}
            onSubmit={(text) => sendToTutor(text, "text")}
            onStartVoice={() => setVoiceOpen(true)}
            onTryTransfer={() => {
              setCarryForwardCue(null);
              setStage("session");
              void sendToTutor("Try one related question", "action");
            }}
            onDone={() => finish(session.transferOffered ? "neededHelp" : "notTried")}
          />
        ) : null}

        {error && stage !== "capture" ? (
          <p role="alert" className="mx-4 mt-4 rounded-sm bg-error-soft px-3 py-2 text-sm text-error sm:mx-6">
            {error}
          </p>
        ) : null}
      </main>

      {stage === "session" && session ? (
        <ResponseComposer
          placeholder="Type your thought..."
          disabled={busy}
          voiceEnabled={voiceAvailable}
          onSend={(text) => sendToTutor(text, "text")}
          onStartVoice={() => setVoiceOpen(true)}
        />
      ) : null}

      {voiceOpen ? (
        <VoiceRecorder
          onCancel={() => setVoiceOpen(false)}
          onAccept={(transcript) => {
            setVoiceOpen(false);
            void sendToTutor(transcript, "voice");
          }}
          onUnavailable={(message) => {
            setVoiceOpen(false);
            setVoiceAvailable(false);
            setError(message);
          }}
        />
      ) : null}

      {showPrivacy ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy"
          className="fixed inset-0 z-30 flex items-end bg-ink/60"
          onClick={() => setShowPrivacy(false)}
        >
          <div className="pb-composer w-full rounded-t-md bg-surface px-4 pt-5">
            <h2 className="font-serif text-lg text-ink">Privacy</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li>The question image is used for this session and is not saved in the cloud.</li>
              <li>Voice audio goes from this device straight to the speech service.</li>
              <li>The current question and a short concept memory stay in this browser.</li>
              <li>The session clears itself after a day, and you can clear memory any time.</li>
            </ul>
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="mt-5 min-h-11 w-full rounded-md bg-action px-4 py-3 font-medium text-white"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Bounded context: the model gets the recent exchange, not the whole history. */
function toRecentTurns(messages: SessionMessage[]): ConversationTurn[] {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    text: message.role === "student" ? message.text : message.displayMarkdown,
  }));
}

function lastTutorMessage(messages: SessionMessage[]): TutorMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "tutor") {
      return message;
    }
  }
  return null;
}
