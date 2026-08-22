import { describe, expect, it } from "vitest";
import { buildTutorInstructions, languageDirective } from "@/lib/ai/prompts";
import { SUGGESTED_ACTIONS } from "@/lib/ai/schemas";
import { makeState } from "../helpers/factories";

describe("languageDirective", () => {
  it("keeps English the default voice of the tutor", () => {
    expect(languageDirective("english")).toMatch(/English only/);
  });

  it("asks for Roman-script Hinglish, never Devanagari", () => {
    const directive = languageDirective("hinglish");

    expect(directive).toMatch(/Roman script/i);
    expect(directive).toMatch(/Never use Devanagari/i);
  });

  it("keeps mathematical vocabulary in English so it transfers to the exam", () => {
    const directive = languageDirective("hinglish");

    expect(directive).toMatch(/mathematical terms/i);
    expect(directive).toMatch(/LaTeX/);
  });

  it("reaches the tutor instructions, not just the user input", () => {
    // The instructions outrank the input, so the directive has to live here.
    const hinglish = buildTutorInstructions(makeState(), "hinglish");
    const english = buildTutorInstructions(makeState(), "english");

    expect(hinglish).toMatch(/Hinglish/);
    expect(english).not.toMatch(/Hinglish/);
  });
});

describe("solution policy in the instructions", () => {
  it("caps length while help is still being withheld", () => {
    const instructions = buildTutorInstructions(makeState({ solutionMode: "withheld" }), "english");

    expect(instructions).toMatch(/Keep the reply under \d+ words/);
  });

  it("lifts the cap once the student has asked for the whole solution", () => {
    // The coaching budget would otherwise truncate the worked answer.
    const instructions = buildTutorInstructions(
      makeState({ solutionMode: "fullyRequested" }),
      "english",
    );

    expect(instructions).not.toMatch(/Keep the reply under \d+ words/);
    expect(instructions).toMatch(/Show every step/i);
    expect(instructions).toMatch(/state the answer plainly/i);
  });
});

describe("always-available actions", () => {
  it("offers a way to ask how the steps connect", () => {
    expect(SUGGESTED_ACTIONS).toContain("How does this fit together?");
  });

  it("asks for the argument's skeleton, not the algebra again", () => {
    const instructions = buildTutorInstructions(makeState(), "english");

    expect(instructions).toMatch(/connect_steps/);
    expect(instructions).toMatch(/shape of the argument/i);
    expect(instructions).toMatch(/Do not restate the arithmetic/i);
  });

  it("offers a simpler-words action", () => {
    expect(SUGGESTED_ACTIONS).toContain("Explain in simpler words");
  });

  it("keeps the full solution in the allowed set, so it is never locked away", () => {
    expect(SUGGESTED_ACTIONS).toContain("Show the full solution");
  });

  it("explains what simpler words means, so it is not a reworded repeat", () => {
    expect(buildTutorInstructions(makeState(), "english")).toMatch(/lower the language register/i);
  });
});
