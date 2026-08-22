import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  mathRepairJsonSchema,
  mathRepairSchema,
  planReviewJsonSchema,
  planReviewSchema,
  questionAnalysisJsonSchema,
  questionAnalysisSchema,
  tutorResponseJsonSchema,
  tutorResponseSchema,
} from "@/lib/ai/schemas";
import { makeAnalysis } from "../helpers/factories";

type JsonSchema = Record<string, unknown>;

/** Keywords Azure's strict structured output mode does not accept. */
const UNSUPPORTED = [
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "default",
  "oneOf",
  "allOf",
  "not",
];

function walk(node: unknown, path: string, visit: (node: JsonSchema, path: string) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit));
    return;
  }

  const schema = node as JsonSchema;
  visit(schema, path);

  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" && value && typeof value === "object") {
      for (const [property, child] of Object.entries(value as JsonSchema)) {
        walk(child, `${path}.${property}`, visit);
      }
    } else if (key === "items" || key === "anyOf") {
      walk(value, `${path}.${key}`, visit);
    }
  }
}

const schemas: Array<[string, JsonSchema]> = [
  ["questionAnalysis", questionAnalysisJsonSchema],
  ["planReview", planReviewJsonSchema],
  ["tutorResponse", tutorResponseJsonSchema],
  ["mathRepair", mathRepairJsonSchema],
];

describe.each(schemas)("%s JSON Schema", (name, schema) => {
  it("has an object root", () => {
    expect(schema.type).toBe("object");
  });

  it("marks every property required and forbids extras", () => {
    walk(schema, name, (node, path) => {
      if (node.type !== "object") {
        return;
      }
      expect(node.additionalProperties, `${path}.additionalProperties`).toBe(false);

      const properties = Object.keys((node.properties ?? {}) as JsonSchema);
      expect(node.required, `${path}.required`).toEqual(properties);
    });
  });

  it("avoids keywords Azure strict mode rejects", () => {
    walk(schema, name, (node, path) => {
      for (const keyword of UNSUPPORTED) {
        expect(Object.hasOwn(node, keyword), `${path}.${keyword}`).toBe(false);
      }
    });
  });

  it("stays within five levels of nesting", () => {
    let deepest = 0;
    walk(schema, name, (_node, path) => {
      deepest = Math.max(deepest, path.split(".").length - 1);
    });
    expect(deepest).toBeLessThanOrEqual(5);
  });
});

function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
    return unwrap(schema.unwrap() as z.ZodType);
  }
  return schema;
}

/**
 * Azure enforces the JSON Schema and Zod enforces the runtime contract, so the
 * two must describe the same shape or a valid model reply could still be dropped.
 */
function expectSameShape(json: JsonSchema, schema: z.ZodType, path: string): void {
  const zodType = unwrap(schema);

  if (zodType instanceof z.ZodObject) {
    const jsonKeys = Object.keys((json.properties ?? {}) as JsonSchema).sort();
    const zodShape = zodType.shape as Record<string, z.ZodType>;
    expect(Object.keys(zodShape).sort(), path).toEqual(jsonKeys);

    for (const [key, child] of Object.entries(zodShape)) {
      const jsonChild = (json.properties as JsonSchema)[key] as JsonSchema;
      expectSameShape(jsonChild, child, `${path}.${key}`);
    }
    return;
  }

  if (zodType instanceof z.ZodArray) {
    const items = (json.items ?? extractArrayItems(json)) as JsonSchema | undefined;
    if (items) {
      expectSameShape(items, zodType.element as z.ZodType, `${path}[]`);
    }
    return;
  }

  // Anything else means the walk stopped early and the comparison proved nothing.
  if (json.type === "object") {
    throw new Error(`Shape comparison could not descend into ${path}`);
  }
}

function extractArrayItems(json: JsonSchema): JsonSchema | undefined {
  const anyOf = json.anyOf as JsonSchema[] | undefined;
  return anyOf?.find((entry) => entry.type === "array")?.items as JsonSchema | undefined;
}

describe("questionAnalysisSchema rejection path", () => {
  const rejected = {
    isExpectedSubject: false,
    containsMultipleQuestions: false,
    detectedQuestions: [],
    rejectionReason: "The image is a Physics question.",
    transcription: { displayMarkdown: "", diagramDescription: null, confidence: 0, ambiguities: [] },
    classification: {
      chapter: "",
      primaryConceptId: "",
      primaryConceptName: "",
      matchesKnownConceptId: null,
      prerequisiteConceptIds: [],
    },
    opening: {
      observation: "",
      intuition: "",
      formulaMarkdown: null,
      formulaExplanation: null,
      whyItApplies: "",
      firstQuestion: "",
      speechText: "",
    },
    privatePlan: {
      finalAnswerMarkdown: "",
      checkpoints: [],
      likelyMisconceptions: [],
      transferCue: "",
      transferQuestionMarkdown: "",
    },
    needsConfirmation: true,
  };

  it("accepts a rejection whose teaching fields are necessarily empty", () => {
    // Azure strict mode forces every field, so a correct refusal must still parse.
    expect(questionAnalysisSchema.safeParse(rejected).success).toBe(true);
  });

  it("requires a reason when the image is refused", () => {
    const silent = { ...rejected, rejectionReason: null };
    expect(questionAnalysisSchema.safeParse(silent).success).toBe(false);
  });

  it("still demands a complete plan when the question is tutorable", () => {
    const claimed = { ...rejected, isExpectedSubject: true, rejectionReason: null };
    const result = questionAnalysisSchema.safeParse(claimed);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("opening.firstQuestion");
      expect(paths).toContain("privatePlan.checkpoints");
    }
  });

  it("accepts a complete plan", () => {
    expect(questionAnalysisSchema.safeParse(makeAnalysis()).success).toBe(true);
  });
});

describe("questionAnalysisSchema question-choice path", () => {
  const twoQuestions = [
    { label: "132", previewText: "Let $S=\\{1,2,3,4,5,6\\}$...", isComplete: true },
    { label: "133", previewText: "Let $f^{-1}(x)=\\frac{3x+2}{2x+3}$...", isComplete: true },
  ];

  it("accepts a pending choice with no teaching plan yet", () => {
    // Planning is deliberately skipped until the student picks one.
    const pending = {
      ...makeAnalysis(),
      containsMultipleQuestions: true,
      detectedQuestions: twoQuestions,
      transcription: { displayMarkdown: "", diagramDescription: null, confidence: 0, ambiguities: [] },
      privatePlan: {
        finalAnswerMarkdown: "",
        checkpoints: [],
        likelyMisconceptions: [],
        transferCue: "",
        transferQuestionMarkdown: "",
      },
    };

    expect(questionAnalysisSchema.safeParse(pending).success).toBe(true);
  });

  it("rejects a claim of several questions without listing them", () => {
    const unlisted = { ...makeAnalysis(), containsMultipleQuestions: true, detectedQuestions: [] };
    const result = questionAnalysisSchema.safeParse(unlisted);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "detectedQuestions",
      );
    }
  });

  it("does not count cropped fragments towards a choice", () => {
    const oneRealPlusFragment = {
      ...makeAnalysis(),
      containsMultipleQuestions: true,
      detectedQuestions: [twoQuestions[0]!, { label: "", previewText: "3x+2", isComplete: false }],
    };

    expect(questionAnalysisSchema.safeParse(oneRealPlusFragment).success).toBe(false);
  });

  it("still allows a single question to list nothing", () => {
    expect(questionAnalysisSchema.safeParse(makeAnalysis()).success).toBe(true);
  });
});

describe("Zod and JSON Schema agreement", () => {
  it.each([
    ["questionAnalysis", questionAnalysisJsonSchema, questionAnalysisSchema],
    ["planReview", planReviewJsonSchema, planReviewSchema],
    ["tutorResponse", tutorResponseJsonSchema, tutorResponseSchema],
    ["mathRepair", mathRepairJsonSchema, mathRepairSchema],
  ] as Array<[string, JsonSchema, z.ZodType]>)("%s describes the same fields", (name, json, zod) => {
    expectSameShape(json, zod, name);
  });
});
