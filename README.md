# Next Thought

A mobile-first JEE Mathematics reasoning tutor. The student photographs one
question; the app helps them notice the clue, name the concept, and take the
next step themselves.

It is not an answer generator. Every decision is tested against one question:

> Does this help the student recognise and reason through a similar problem more
> independently next time?

Full product, learning and technical design: [PRODUCT_TECHNICAL_DESIGN.md](PRODUCT_TECHNICAL_DESIGN.md).

## Requirements

- Node 20.9 or newer
- An Azure AI Foundry resource with a `gpt-5.6-terra` deployment
- An Azure AI Speech resource in the same region as `AZURE_SPEECH_ENDPOINT`

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the two keys
npm run dev
```

Every Azure value is server-only. Nothing is prefixed `NEXT_PUBLIC_`, and lint
fails the build if that is attempted, so the browser can never call the paid
deployment directly.

### Running without Azure

```bash
NEXT_THOUGHT_USE_FIXTURES=true npm run dev
```

Serves one scripted question and scripted tutoring, so the interaction, layout
and accessibility can be exercised without spending a model call.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit and AI-contract tests |
| `npm run test:e2e` | Playwright, in fixture mode |

## How a session runs

1. **Capture** — the image is compressed on the device: EXIF orientation applied,
   long edge bounded to 1600px, flattened onto white (screenshots carry alpha,
   and JPEG has none), then stepped down in quality to a byte budget.
2. **Detect** — one Azure call reads the image. A page holding several complete
   questions returns a list to choose from and stops there, so the expensive
   planning and review calls only ever run on the question the student wants.
3. **Plan and review** — the chosen question is transcribed, solved privately and
   turned into a teaching plan, then checked by a second, independent call.
4. **Confirm** — if notation is uncertain, the student confirms before teaching
   starts. The app never invents missing notation.
5. **Teach** — one clue, one concept, at most one formula, one question per turn.
6. **Reflect and transfer** — the student states the cue in their own words, and
   may try a surface-different question using the same idea.

## Architecture notes

- **The model does the mathematics; the app enforces the pedagogy.** A
  deterministic state machine owns phase, hint depth and solution mode. The model
  proposes a state update and the server folds it in under policy: checkpoints
  never jump or move backwards, help deepens by at most one level per turn, and a
  final answer cannot be revealed unless the student has asked for it.
- **No hardcoded concept catalogue.** Trigger cues, properties and misconceptions
  are reasoned out per question. Concept *identity* is a learned, on-device
  registry: the browser sends the concepts this student has already met, and the
  model decides whether this question is one of them. Application code validates
  the id but never renames what the model found.
- **No database.** The current session and a capped concept memory live in the
  browser. The session expires after a day; the image and audio are never stored.
- **Maths rendering.** One `MathContent` component, `remark-math` plus
  `rehype-katex` with `trust: false`, raw HTML dropped, links and images
  neutralised. The server validates every maths node with the same KaTeX options
  the browser uses, attempts one constrained repair, then falls back to labelled
  plain text so a malformed formula never breaks the whole reply.
- **Voice is optional.** The Speech SDK is loaded on demand and the browser only
  ever receives a nine-minute authorization token. Any failure returns focus to
  the text composer.

## Deployment

Set the same variables from `.env.example` in the Vercel project (all
environments), then deploy. `APP_ACCESS_CODE` and a 32-character
`COOKIE_SIGNING_SECRET` gate the paid routes behind a signed, HTTP-only cookie.
That gate protects the Azure subscription only — it is never a parental lock and
never affects the student's access to a solution.

Vercel Hobby is appropriate only while this stays personal and non-commercial.
