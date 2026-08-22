import type { ConceptLearningRecord } from "@/types/tutor";

/**
 * Concept identity is *learned*, not enumerated. The catalogue is whatever this
 * student has already met, grown one question at a time by the model.
 *
 * Nothing mathematical or pedagogical lives here: trigger cues, properties and
 * misconceptions are reasoned out per question by the analysis pass, because a
 * fixed list can neither cover JEE nor notice what makes *this* question tick.
 */
export interface ConceptSummary {
  id: string;
  name: string;
  /** How much help this concept needed last time, so the opening can start lighter. */
  lastHintDepth: number;
}

/** Lowercase dotted segments, e.g. `algebra.quadratic.repeated-root`. */
const CONCEPT_ID = /^[a-z0-9]+(?:[-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-][a-z0-9]+)*){1,4}$/;

export function isWellFormedConceptId(id: string): boolean {
  return CONCEPT_ID.test(id);
}

export function toConceptSummaries(records: readonly ConceptLearningRecord[]): ConceptSummary[] {
  const seen = new Map<string, ConceptSummary>();
  for (const record of records) {
    seen.set(record.conceptId, {
      id: record.conceptId,
      name: record.conceptName,
      lastHintDepth: record.maxHintDepth,
    });
  }
  return [...seen.values()];
}

export function findRecordForConcept(
  records: readonly ConceptLearningRecord[],
  conceptId: string,
): ConceptLearningRecord | null {
  return records.find((record) => record.conceptId === conceptId) ?? null;
}

export function formatKnownConcepts(summaries: readonly ConceptSummary[]): string {
  if (summaries.length === 0) {
    return "This student has no earlier concept records. Every concept you name is new.";
  }
  return summaries
    .map((summary) => `${summary.id} — ${summary.name} (help needed last time: ${summary.lastHintDepth})`)
    .join("\n");
}
