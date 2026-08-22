import { describe, expect, it } from "vitest";
import {
  containsMarkupOrLatex,
  containsUnsafeMarkup,
  countProseWords,
  countQuestions,
  extractMathNodes,
  normaliseDisplayMath,
  validateMathMarkdown,
} from "@/lib/math/validate-math";

describe("normaliseDisplayMath", () => {
  it("moves one-line display fences onto their own lines", () => {
    expect(normaliseDisplayMath("$$b^2-4ac=0$$")).toBe("$$\nb^2-4ac=0\n$$");
  });

  it("leaves inline maths alone", () => {
    expect(normaliseDisplayMath("The condition is $D=0$.")).toBe("The condition is $D=0$.");
  });

  it("leaves already-fenced display maths alone", () => {
    const input = "$$\nb^2-4ac=0\n$$";
    expect(normaliseDisplayMath(input)).toBe(input);
  });

  it("does not touch fenced code", () => {
    const input = "```\n$$x$$\n```";
    expect(normaliseDisplayMath(input)).toBe(input);
  });

  it("never alters the expression itself", () => {
    expect(normaliseDisplayMath("$$\\frac{-(k+2)}{2a}$$")).toContain("\\frac{-(k+2)}{2a}");
  });
});

describe("extractMathNodes", () => {
  it("separates inline from display maths", () => {
    const nodes = extractMathNodes("The condition is $D=0$.\n\n$$b^2-4ac=0$$");
    expect(nodes).toEqual([
      { value: "D=0", displayMode: false },
      { value: "b^2-4ac=0", displayMode: true },
    ]);
  });

  it("ignores an escaped dollar sign", () => {
    expect(extractMathNodes("It costs \\$5 and \\$7.")).toHaveLength(0);
  });

  it("ignores maths inside fenced code", () => {
    expect(extractMathNodes("```\n$x^2$\n```")).toHaveLength(0);
  });

  it("leaves an unmatched delimiter as prose", () => {
    expect(extractMathNodes("The value $x is unknown.")).toHaveLength(0);
  });
});

describe("validateMathMarkdown", () => {
  const valid = [
    "$\\frac{a}{b}$",
    "$\\sqrt{1+\\sqrt{x}}$",
    "$x^{2n+1}_{i}$",
    "$$\\lim_{x\\to0}\\frac{\\sin x}{x}=1$$",
    "$$\\int_{-a}^{a}f(x)\\,dx$$",
    "$$\\sum_{r=0}^{n}\\binom{n}{r}$$",
    "$$\\prod_{k=1}^{n}k$$",
    "$\\vec{a}\\cdot\\vec{b}$",
    "$$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$$",
    "$$f(x)=\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}$$",
    "$x\\in\\mathbb{R}\\setminus\\{0\\}$",
    "$a\\le b\\Rightarrow c\\ge d$",
    "$\\tan\\theta+\\cot\\theta$",
    "$$\\begin{aligned}D&=b^2-4ac\\\\&=0\\end{aligned}$$",
  ];

  it.each(valid)("accepts %s", (markdown) => {
    expect(validateMathMarkdown(markdown).ok).toBe(true);
  });

  it("rejects an unclosed group", () => {
    const result = validateMathMarkdown("$\\frac{a}{b$");
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown command", () => {
    const result = validateMathMarkdown("$\\notARealCommand{x}$");
    expect(result.ok).toBe(false);
  });

  it("parses \\href without granting it, so the URL guard is what rejects it", () => {
    // KaTeX drops the link silently rather than throwing; MathContent asserts no anchor.
    expect(validateMathMarkdown("$\\href{https://x.test}{click}$").ok).toBe(true);
    expect(containsUnsafeMarkup("$\\href{https://x.test}{click}$")).toBe(true);
  });

  it("reports the reason without echoing the expression", () => {
    const result = validateMathMarkdown("$\\frac{a}{b$");
    if (result.ok) {
      throw new Error("expected failure");
    }
    expect(result.errors[0]?.reason).toBeTruthy();
  });
});

describe("containsMarkupOrLatex", () => {
  it("accepts plain spoken English", () => {
    expect(
      containsMarkupOrLatex("Use the discriminant condition: b squared minus four a c equals zero."),
    ).toBe(false);
  });

  it.each([
    "Use $D=b^2-4ac$.",
    "Use \\frac{a}{b}.",
    "Use **the** discriminant.",
    "Use `code`.",
    "# Heading",
    "See [this](https://x.test).",
  ])("rejects %s", (text) => {
    expect(containsMarkupOrLatex(text)).toBe(true);
  });
});

describe("containsUnsafeMarkup", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=y>",
    "Read [more](https://evil.test).",
    "Go to https://evil.test now.",
    "Visit www.evil.test.",
  ])("rejects %s", (markdown) => {
    expect(containsUnsafeMarkup(markdown)).toBe(true);
  });

  it("accepts ordinary tutoring prose with maths", () => {
    expect(containsUnsafeMarkup("Set $D=0$ because the roots coincide.")).toBe(false);
  });
});

describe("word and question counting", () => {
  it("excludes displayed maths from the word budget", () => {
    expect(countProseWords("Set this to zero:\n\n$$b^2-4ac=0$$\n\nWhat is $b$?")).toBe(7);
  });

  it("counts only questions outside maths", () => {
    expect(countQuestions("What is $a$? Try $x_?$")).toBe(1);
  });
});
