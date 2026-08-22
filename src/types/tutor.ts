import type { z } from "zod";
import type {
  ASSESSMENT_STATUSES,
  STUDENT_INTENTS,
  SUGGESTED_ACTIONS,
  TUTOR_MOVES,
  TUTOR_PHASES,
  conceptLearningRecordSchema,
  conversationTurnSchema,
  detectedQuestionSchema,
  planReviewSchema,
  questionAnalysisSchema,
  questionSelectionSchema,
  SOLUTION_MODES,
  TUTOR_LANGUAGES,
  tutorRequestSchema,
  tutorResponseSchema,
  tutorSessionStateSchema,
} from "@/lib/ai/schemas";

export type TutorPhase = (typeof TUTOR_PHASES)[number];
export type SolutionMode = (typeof SOLUTION_MODES)[number];
export type StudentIntent = (typeof STUDENT_INTENTS)[number];
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export type TutorMove = (typeof TUTOR_MOVES)[number];
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];
export type TutorLanguage = (typeof TUTOR_LANGUAGES)[number];
export type HintDepth = 0 | 1 | 2 | 3 | 4;

export type TutorSessionState = z.infer<typeof tutorSessionStateSchema>;
export type QuestionAnalysis = z.infer<typeof questionAnalysisSchema>;
export type PrivatePlan = QuestionAnalysis["privatePlan"];
export type QuestionOpening = QuestionAnalysis["opening"];
export type PlanReview = z.infer<typeof planReviewSchema>;
export type TutorResponse = z.infer<typeof tutorResponseSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export type ConceptLearningRecord = z.infer<typeof conceptLearningRecordSchema>;
export type DetectedQuestion = z.infer<typeof detectedQuestionSchema>;
export type QuestionSelection = z.infer<typeof questionSelectionSchema>;

/** Non-content diagnostics only: never carries prompts, images or replies. */
export interface ModelUsage {
  deployment: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface AnalyzeResult {
  kind: "analysis";
  analysis: QuestionAnalysis;
  reviewVerdict: PlanReview["verdict"];
  initialState: TutorSessionState;
  usage: ModelUsage[];
}

/** Several complete questions were found; the student picks before planning. */
export interface QuestionChoiceResult {
  kind: "choice";
  questions: DetectedQuestion[];
  usage: ModelUsage[];
}

export type AnalyzeResponse = AnalyzeResult | QuestionChoiceResult;

export type TutorRequestPayload = z.infer<typeof tutorRequestSchema>;

export interface TutorTurnResult {
  response: TutorResponse;
  state: TutorSessionState;
  /** True when a field's maths could not be rendered and is shown as plain text. */
  mathFallback: boolean;
  usage: ModelUsage[];
}

/** A tutor message as the UI holds it, after server-side validation. */
export interface TutorMessage {
  id: string;
  role: "tutor";
  displayMarkdown: string;
  speechText: string;
  move: TutorMove | "opening";
  suggestedActions: SuggestedAction[];
  carryForwardCue: string | null;
  /** Fields whose maths could not be rendered are shown as escaped text. */
  mathFallback: boolean;
}

export interface StudentMessage {
  id: string;
  role: "student";
  text: string;
  inputMode: "text" | "voice" | "action";
}

export type SessionMessage = TutorMessage | StudentMessage;

export interface StoredSession {
  version: number;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  question: {
    displayMarkdown: string;
    diagramDescription: string | null;
    chapter: string;
    primaryConceptId: string;
    primaryConceptName: string;
  };
  opening: QuestionOpening;
  privatePlan: PrivatePlan;
  state: TutorSessionState;
  messages: SessionMessage[];
  transferOffered: boolean;
}

export interface SpeechTokenPayload {
  token: string;
  region: string;
  recognitionLanguage: string;
  voiceName: string;
  expiresAt: string;
}

export type ApiErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "invalid_request"
  | "invalid_image"
  | "not_mathematics"
  | "multiple_questions"
  | "model_unavailable"
  | "model_incomplete"
  | "content_filtered"
  | "speech_unavailable"
  | "server_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Student-facing, calm, and free of technical detail. */
    message: string;
    retryable: boolean;
  };
}
