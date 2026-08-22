import type { Subject } from "@/lib/ai/schemas";

/**
 * Everything that differs between subjects lives here. The teaching loop, hint
 * ladder, validators and state machine are deliberately subject-neutral, so a
 * new subject is a profile rather than a parallel implementation.
 */
export interface SubjectProfile {
  id: Subject;
  /** Shown to the student. */
  label: string;
  teacherTitle: string;
  /** Used in "continue teaching the ___". */
  contentNoun: string;
  languageStyle: string;
  formatting: string;
  conceptGuidance: string;
  analysisGuidance: string;
}

const MATHEMATICS: SubjectProfile = {
  id: "mathematics",
  label: "Mathematics",
  teacherTitle: "IIT-JEE Mathematics teacher",
  contentNoun: "the mathematics",
  languageStyle: "mathematical language",
  formatting: `Mathematics formatting: inline maths in $...$, displayed maths in $$...$$ on its
own lines. Use only LaTeX that KaTeX supports. Never emit HTML, links, images,
\\href, \\htmlClass, \\includegraphics or custom macros. Prefer several short
display blocks over one long line, and break at =, \\Rightarrow or \\leq.`,
  conceptGuidance: `The operative concept is the specific idea inside the chapter that this question
turns on, not the chapter itself: "Repeated-root condition" rather than
"Quadratic Equations". The trigger is usually in the wording, the limits, the
symmetry or the algebraic structure.`,
  analysisGuidance: `Watch for the structural clue: a phrase fixing the number of roots, limits that
are symmetric about zero, a tangency condition, a constraint that forces a
substitution.`,
};

const PHYSICS: SubjectProfile = {
  id: "physics",
  label: "Physics",
  teacherTitle: "IIT-JEE Physics teacher",
  contentNoun: "the physics",
  languageStyle: "physical language, including units and sign conventions",
  formatting: `Formatting: inline maths in $...$, displayed maths in $$...$$ on its own lines.
Use only LaTeX that KaTeX supports. Never emit HTML, links, images, \\href,
\\htmlClass, \\includegraphics or custom macros.

Carry units through the working and give the final quantity its unit. Write
vectors as $\\vec{v}$. State the sign convention and the reference frame whenever
either could be ambiguous.`,
  conceptGuidance: `In Physics the operative concept is a principle together with a modelling
decision. Name both: which law applies (Newton's second law, conservation of
energy, Gauss's law, Kirchhoff's rules), and how the student must model the
situation to use it — where the system boundary is drawn, which frame is chosen,
what is neglected, and which quantity is conserved.

Naming only the law is not enough. "Use conservation of energy" is a chapter
label; "treat the block and wedge as one system, because the normal force
between them is internal and does no net work" is the operative idea.`,
  analysisGuidance: `The trigger clue is usually in the physical setup rather than the wording:
frictionless or rough, massless string or pulley, "released from rest", "constant
velocity", a closed circuit, an isolated system, a collision that is elastic or
not.

Where a diagram would help, describe in one line what the student should draw:
which forces on which body, or which loop to take. Do not attempt to draw it.

Dimensional consistency is a legitimate check, and a fast one in an exam. Use it
when a result can be sanity-checked that way.`,
};

const PROFILES: Record<Subject, SubjectProfile> = {
  mathematics: MATHEMATICS,
  physics: PHYSICS,
};

export function subjectProfile(subject: Subject): SubjectProfile {
  return PROFILES[subject];
}

export const SUBJECT_LABELS: ReadonlyArray<{ id: Subject; label: string }> = [
  { id: "mathematics", label: "Maths" },
  { id: "physics", label: "Physics" },
];
