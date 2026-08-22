import katex from "katex";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { KATEX_VALIDATION_OPTIONS } from "./katex-options";

export interface MathNode {
  value: string;
  displayMode: boolean;
}

export interface MathSyntaxError {
  displayMode: boolean;
  /** KaTeX's message only. The expression itself is never logged. */
  reason: string;
}

export type MathValidation =
  | { ok: true }
  | { ok: false; errors: MathSyntaxError[] };

const parser = unified().use(remarkParse).use(remarkMath);

/**
 * Finds maths through the Markdown AST rather than ad hoc regular expressions,
 * so escaped dollars and fenced code are handled the same way the renderer does.
 */
export function extractMathNodes(markdown: string): MathNode[] {
  const tree = parser.parse(markdown) as Root;
  const nodes: MathNode[] = [];

  visit(tree, (node) => {
    if (node.type === "inlineMath") {
      nodes.push({ value: (node as { value: string }).value, displayMode: false });
    } else if (node.type === "math") {
      nodes.push({ value: (node as { value: string }).value, displayMode: true });
    }
  });

  return nodes;
}

/**
 * Checks syntax and supported commands only. A formula that renders is not
 * therefore mathematically correct; that is the reviewer's job.
 */
export function validateMathMarkdown(markdown: string): MathValidation {
  const errors: MathSyntaxError[] = [];

  for (const node of extractMathNodes(markdown)) {
    try {
      katex.renderToString(node.value, {
        ...KATEX_VALIDATION_OPTIONS,
        displayMode: node.displayMode,
      });
    } catch (error) {
      errors.push({
        displayMode: node.displayMode,
        reason: error instanceof Error ? error.message : "Unknown KaTeX failure",
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

const LATEX_COMMAND = /\\[a-zA-Z]+|\\[\\{}$&#_^%]/;
const MARKDOWN_ARTEFACT = /(\$\$?)|(^|\s)[*_]{1,2}\S|`|^\s{0,3}#{1,6}\s|\[[^\]]*\]\([^)]*\)/m;

/**
 * `speechText` is handed straight to the Speech service, so it must not contain
 * anything a synthesiser would read out as punctuation soup.
 */
export function containsMarkupOrLatex(text: string): boolean {
  return LATEX_COMMAND.test(text) || MARKDOWN_ARTEFACT.test(text);
}

/** Word budgets in the design exclude displayed mathematics. */
export function countProseWords(markdown: string): number {
  const withoutMath = markdown
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/`[^`]*`/g, " ");

  const words = withoutMath.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Counts substantive questions. Question marks inside maths or inside a quoted
 * restatement of the student's words are not the tutor asking something new.
 */
export function countQuestions(markdown: string): number {
  const withoutMath = markdown
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ");

  return (withoutMath.match(/\?/g) ?? []).length;
}

const RAW_HTML = /<\/?[a-zA-Z][^>]*>/;
const MARKDOWN_LINK = /\[[^\]]*\]\((?!#)[^)]*\)/;
const BARE_URL = /\b(?:https?:\/\/|www\.)\S+/i;

/** Model output must not smuggle markup or links from the uploaded image. */
export function containsUnsafeMarkup(markdown: string): boolean {
  return RAW_HTML.test(markdown) || MARKDOWN_LINK.test(markdown) || BARE_URL.test(markdown);
}
