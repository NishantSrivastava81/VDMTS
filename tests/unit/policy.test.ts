import { describe, expect, it } from "vitest";
import { WORD_BUDGETS, validateOpening, validateTutorResponse } from "@/lib/ai/policy";
import { makeAnalysis, makeState, makeTutorResponse } from "../helpers/factories";

const codes = (violations: { code: string }[]) => violations.map((violation) => violation.code);

describe("validateTutorResponse", () => {
  it("passes a well-formed teaching turn", () => {
    const result = validateTutorResponse(makeTutorResponse(), makeState(), "withheld");

    expect(result.violations).toHaveLength(0);
    expect(result.mustRetry).toBe(false);
  });

  it("rejects more than one substantive question", () => {
    const response = makeTutorResponse({
      teacher: {
        displayMarkdown: "What is $b$? And what is $c$?",
        questionCount: 2,
      },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("multiple_questions");
    expect(result.mustRetry).toBe(true);
  });

  it("does not count a question mark inside maths", () => {
    const response = makeTutorResponse({
      teacher: { displayMarkdown: "Try $x_?$ and tell me what changes.", questionCount: 0 },
    });

    expect(codes(validateTutorResponse(response, makeState(), "withheld").violations)).not.toContain(
      "multiple_questions",
    );
  });

  it("blocks a reveal while the solution is withheld", () => {
    const response = makeTutorResponse({
      teacher: { revealsFinalAnswer: true },
      stateUpdate: { phase: "coach" },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("premature_reveal");
    expect(result.mustRetry).toBe(true);
  });

  it("permits a reveal once the student has asked for the solution", () => {
    const response = makeTutorResponse({
      teacher: { move: "guided_solution_step", revealsFinalAnswer: true, questionCount: 0 },
      stateUpdate: { phase: "walkthrough" },
    });

    const result = validateTutorResponse(response, makeState({ phase: "coach" }), "guided");

    expect(codes(result.violations)).not.toContain("premature_reveal");
  });

  it("rejects Markdown or LaTeX in the spoken text", () => {
    const response = makeTutorResponse({
      teacher: { speechText: "Use $D=b^2-4ac$ and **check** the sign." },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("speech_contains_markup");
    expect(result.mustRetry).toBe(true);
  });

  it("rejects markup or links smuggled out of the question image", () => {
    const response = makeTutorResponse({
      teacher: { displayMarkdown: "See <b>this</b> and https://evil.test for the answer." },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("unsafe_markup");
  });

  it("flags malformed maths for repair rather than rejection", () => {
    const response = makeTutorResponse({
      teacher: { displayMarkdown: "Try $\\frac{a}{b$ next." },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("invalid_math_syntax");
    expect(result.mathFields).toContain("teacher.displayMarkdown");
    expect(result.mustRetry).toBe(false);
  });

  it("gives a fully requested solution room to be complete", () => {
    const response = makeTutorResponse({
      teacher: {
        move: "guided_solution_step",
        displayMarkdown: `${"step ".repeat(300)}.`,
        revealsFinalAnswer: true,
        questionCount: 0,
      },
      stateUpdate: { phase: "walkthrough" },
    });

    const result = validateTutorResponse(response, makeState({ phase: "coach" }), "fullyRequested");

    expect(codes(result.violations)).not.toContain("over_word_budget");
    expect(codes(result.violations)).not.toContain("premature_reveal");
  });

  it("still caps an over-long reply while coaching", () => {
    const response = makeTutorResponse({
      teacher: { displayMarkdown: `${"word ".repeat(WORD_BUDGETS.coach + 5)}?` },
    });

    const result = validateTutorResponse(response, makeState(), "withheld");

    expect(codes(result.violations)).toContain("over_word_budget");
    expect(result.mustRetry).toBe(false);
  });

  it("excludes displayed maths from the word budget", () => {
    const response = makeTutorResponse({
      teacher: {
        displayMarkdown: `Set it to zero.\n\n$$${"x+".repeat(200)}0$$\n\nWhat do you get?`,
      },
    });

    expect(codes(validateTutorResponse(response, makeState(), "withheld").violations)).not.toContain(
      "over_word_budget",
    );
  });

  it("flags a carry-forward cue offered outside reflection", () => {
    const response = makeTutorResponse({
      teacher: { carryForwardCue: "Remember D=0." },
      stateUpdate: { phase: "coach" },
    });

    expect(codes(validateTutorResponse(response, makeState(), "withheld").violations)).toContain(
      "cue_outside_reflection",
    );
  });
});

describe("validateOpening", () => {
  it("passes a well-formed opening", () => {
    expect(validateOpening(makeAnalysis()).violations).toHaveLength(0);
  });

  it("rejects an opening that gives the answer away", () => {
    const analysis = makeAnalysis();
    const leaking = makeAnalysis({
      opening: { ...analysis.opening, whyItApplies: "Both roots coincide, so $k=2$ follows." },
    });

    expect(codes(validateOpening(leaking).violations)).toContain("premature_reveal");
  });

  it("rejects an opening that asks two questions", () => {
    const analysis = makeAnalysis();
    const twoQuestions = makeAnalysis({
      opening: { ...analysis.opening, firstQuestion: "What is $a$? What is $b$?" },
    });

    expect(codes(validateOpening(twoQuestions).violations)).toContain("multiple_questions");
  });

  it("rejects spoken text containing LaTeX", () => {
    const analysis = makeAnalysis();
    const spoken = makeAnalysis({
      opening: { ...analysis.opening, speechText: "Use $b^2-4ac$." },
    });

    expect(codes(validateOpening(spoken).violations)).toContain("speech_contains_markup");
  });

  it("collects the maths fields that need repair", () => {
    const analysis = makeAnalysis();
    const broken = makeAnalysis({
      opening: { ...analysis.opening, formulaMarkdown: "$$\\frac{a}{b$$" },
    });

    expect(validateOpening(broken).mathFields).toContain("opening.formulaMarkdown");
  });
});
