import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { KATEX_SHARED_OPTIONS } from "@/lib/math/katex-options";
import { normaliseDisplayMath } from "@/lib/math/validate-math";

/**
 * The only place in the app that renders model-authored Markdown or maths.
 * Raw HTML is dropped, links and images are neutralised, and KaTeX runs with
 * `trust: false`, so nothing printed inside a question image can become markup.
 */
const components: Components = {
  a: ({ children }) => <span>{children}</span>,
  img: () => null,
  // rehype-katex replaces the whole block with KaTeX's own `span.katex-display`,
  // so that is what gets the scrollable container.
  span: ({ className, children, ...rest }) => {
    const isDisplayMath =
      typeof className === "string" && className.split(" ").includes("katex-display");

    const element = (
      <span {...rest} className={className}>
        {children}
      </span>
    );

    return isDisplayMath ? <div className="formula-block">{element}</div> : element;
  },
};

const disallowedElements = ["script", "style", "iframe", "object", "embed", "form", "input"];

export interface MathContentProps {
  content: string;
  className?: string;
  /**
   * Set when the server could not validate this field's LaTeX. The source text
   * is shown verbatim instead of a broken or silently altered formula.
   */
  fallback?: boolean;
}

export function MathContent({ content, className, fallback = false }: MathContentProps) {
  if (fallback) {
    return (
      <div className={className}>
        <p
          className="whitespace-pre-wrap font-mono text-[0.95rem] leading-relaxed text-ink"
          aria-label="Formula could not be formatted. Showing the original text."
        >
          {content}
        </p>
        <p className="mt-1 text-xs text-error">Formula could not be formatted.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        disallowedElements={disallowedElements}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, KATEX_SHARED_OPTIONS]]}
        components={components}
      >
        {normaliseDisplayMath(content)}
      </ReactMarkdown>
    </div>
  );
}
