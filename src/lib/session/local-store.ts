import { z } from "zod";
import {
  conceptLearningRecordSchema,
  questionAnalysisShape,
  tutorSessionStateSchema,
} from "@/lib/ai/schemas";
import { toConceptSummaries, type ConceptSummary } from "@/lib/concepts/registry";
import type { ConceptLearningRecord, StoredSession } from "@/types/tutor";

/**
 * Everything the product remembers lives here, on the device. No account, no
 * database, no cloud history: section 13.4. Images and audio are never stored.
 */
const SESSION_KEY = "nextThought.session.v1";
const CONCEPTS_KEY = "nextThought.concepts.v1";
const PREFS_KEY = "nextThought.prefs.v1";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCEPT_RECORDS = 50;

const storedMessageSchema = z.union([
  z.object({
    id: z.string(),
    role: z.literal("tutor"),
    displayMarkdown: z.string(),
    speechText: z.string(),
    move: z.string(),
    suggestedActions: z.array(z.string()),
    carryForwardCue: z.string().nullable(),
    mathFallback: z.boolean(),
  }),
  z.object({
    id: z.string(),
    role: z.literal("student"),
    text: z.string(),
    inputMode: z.enum(["text", "voice", "action"]),
  }),
]);

const storedSessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  question: z.object({
    displayMarkdown: z.string(),
    diagramDescription: z.string().nullable(),
    chapter: z.string(),
    primaryConceptId: z.string(),
    primaryConceptName: z.string(),
  }),
  privatePlan: questionAnalysisShape.privatePlan,
  opening: questionAnalysisShape.opening,
  state: tutorSessionStateSchema,
  messages: z.array(storedMessageSchema),
  transferOffered: z.boolean(),
});

const prefsSchema = z.object({
  autoReadAloud: z.boolean().default(false),
});

export type Preferences = z.infer<typeof prefsSchema>;

function storage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    // Private mode or a blocked origin: the session simply will not survive a refresh.
    return null;
  }
}

function readJson<T>(key: string, schema: z.ZodType<T>): T | null {
  const store = storage();
  if (!store) {
    return null;
  }

  const raw = store.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      store.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    store.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota must never break the lesson in progress.
  }
}

export function loadSession(): StoredSession | null {
  const session = readJson(SESSION_KEY, storedSessionSchema);
  if (!session) {
    return null;
  }

  if (Date.parse(session.expiresAt) <= Date.now()) {
    clearSession();
    return null;
  }

  return session as StoredSession;
}

export function saveSession(session: Omit<StoredSession, "version" | "expiresAt">): void {
  writeJson(SESSION_KEY, {
    ...session,
    version: 1,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
}

export function clearSession(): void {
  storage()?.removeItem(SESSION_KEY);
}

export function loadConceptMemory(): ConceptLearningRecord[] {
  return readJson(CONCEPTS_KEY, z.array(conceptLearningRecordSchema)) ?? [];
}

export function findConceptMemory(conceptId: string): ConceptLearningRecord | null {
  return loadConceptMemory().find((record) => record.conceptId === conceptId) ?? null;
}

/** The vocabulary this device has learned, sent so the model can match concepts. */
export function loadConceptSummaries(): ConceptSummary[] {
  return toConceptSummaries(loadConceptMemory());
}

export function rememberConcept(record: ConceptLearningRecord): void {
  const existing = loadConceptMemory().filter((entry) => entry.conceptId !== record.conceptId);
  const next = [...existing, record].slice(-MAX_CONCEPT_RECORDS);
  writeJson(CONCEPTS_KEY, next);
}

export function clearConceptMemory(): void {
  storage()?.removeItem(CONCEPTS_KEY);
}

export function loadPreferences(): Preferences {
  return readJson(PREFS_KEY, prefsSchema) ?? { autoReadAloud: false };
}

export function savePreferences(preferences: Preferences): void {
  writeJson(PREFS_KEY, preferences);
}

export function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
