import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MathContent } from "@/components/math-content";
import { KATEX_SHARED_OPTIONS } from "@/lib/math/katex-options";
import { validateMathMarkdown } from "@/lib/math/validate-math";

describe("MathContent", () => {
  it("renders inline maths with a MathML alternative for screen readers", () => {
    const { container } = render(<MathContent content="The condition is $D=0$." />);

    expect(container.querySelector(".katex")).not.toBeNull();
    const mathml = container.querySelector("math");
    expect(mathml).not.toBeNull();
    // The visual HTML must stay hidden from assistive tech to avoid double reading.
    expect(container.querySelector(".katex-html")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts displayed maths in a scrollable block so the page cannot scroll sideways", () => {
    const { container } = render(<MathContent content={"Set it to zero.\n\n$$b^2-4ac=0$$"} />);

    const block = container.querySelector(".formula-block");
    expect(block).not.toBeNull();
    expect(block?.querySelector(".katex-display")).not.toBeNull();
  });

  it("drops raw HTML rather than rendering it", () => {
    const { container } = render(
      <MathContent content={"<script>alert(1)</script><b>bold</b> text"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("neutralises links and images smuggled through Markdown", () => {
    const { container } = render(
      <MathContent content={"[click](https://evil.test) ![x](https://evil.test/x.png)"} />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("click")).toBeInTheDocument();
  });

  it("shows readable source text and a label when maths could not be formatted", () => {
    render(<MathContent content="$\\frac{a}{b$" fallback />);

    expect(screen.getByText("Formula could not be formatted.")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Formula could not be formatted. Showing the original text."),
    ).toBeInTheDocument();
  });

  it("uses the same restricted options as the server validator", () => {
    expect(KATEX_SHARED_OPTIONS.trust).toBe(false);
    expect(KATEX_SHARED_OPTIONS.macros).toEqual({});
    expect(KATEX_SHARED_OPTIONS.output).toBe("htmlAndMathml");
  });

  it("renders everything the server validator accepts, with no error colouring", () => {
    const accepted = [
      "$\\frac{a}{b}$",
      "$$\\int_0^1 x^2\\,dx$$",
      "$$\\begin{cases}1&x>0\\\\0&x\\le0\\end{cases}$$",
      "$$\\begin{aligned}D&=b^2-4ac\\\\&=0\\end{aligned}$$",
      "$\\vec{a}\\times\\vec{b}$",
    ];

    for (const sample of accepted) {
      expect(validateMathMarkdown(sample).ok, `validator: ${sample}`).toBe(true);

      const { container } = render(<MathContent content={sample} />);
      expect(container.querySelector(".katex"), `rendered: ${sample}`).not.toBeNull();
      // KaTeX signals a parse failure only by colour, which the design forbids
      // as a sole signal — so accepted maths must never reach that path.
      expect(container.innerHTML, `error colour: ${sample}`).not.toContain("#cc0000");
    }
  });

  it("routes maths the validator rejects to the labelled fallback, not to KaTeX", () => {
    const rejected = ["$\\badcommand$", "$\\frac{a}{b$"];

    for (const sample of rejected) {
      expect(validateMathMarkdown(sample).ok, `validator: ${sample}`).toBe(false);

      const { container } = render(<MathContent content={sample} fallback />);
      expect(container.querySelector(".katex")).toBeNull();
      expect(container.textContent).toContain("Formula could not be formatted.");
    }
  });

  it("renders \\href without emitting a link, because trust is off", () => {
    const { container } = render(<MathContent content="$\\href{https://evil.test}{click}$" />);
    expect(container.querySelector("a")).toBeNull();
  });
});
