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
    expect(block?.className).toContain("math-display");
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

  it("accepts in the browser exactly what the server validator accepts", () => {
    const samples = [
      "$\\frac{a}{b}$",
      "$$\\int_0^1 x^2\\,dx$$",
      "$$\\begin{cases}1&x>0\\\\0&x\\le0\\end{cases}$$",
      "$\\href{https://x.test}{y}$",
      "$\\badcommand$",
    ];

    for (const sample of samples) {
      const serverAccepts = validateMathMarkdown(sample).ok;
      const { container } = render(<MathContent content={sample} />);
      // rehype-katex marks anything it could not parse with the error colour class.
      const browserRejected = container.querySelector(".katex-error") !== null;
      expect(browserRejected).toBe(!serverAccepts);
    }
  });
});
