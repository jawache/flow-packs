// packs/docs.ts — two documentation audiences, one folder, nothing replicated.

import { breadcrumb, canonicalFiles, commit, definePack, guardrail, fileChange } from "@jawache/flow";

/** The two facts about a repo's docs folder the pack cannot know: where it is, and what may sit loose in it. */
export interface Doors {
  /**
   * The documentation folder, as a path from the repo root. Defaults to `docs`.
   *
   * Its guardrail and both breadcrumbs are scoped to it, so a repo whose pages live in
   * `documentation/` names that here and keeps every rule.
   */
  readonly root?: string;

  /**
   * Filenames allowed to sit LOOSE at the top of that folder, beside the two doors. Defaults to
   * none — every file belongs behind `user/` or `agent/`.
   *
   * A repo that keeps a `README.md` at the top of its docs folder names it here.
   */
  readonly allow?: readonly string[];
}

/**
 * Two documentation audiences, one folder, nothing replicated.
 *
 * Every repo documents for exactly two readers who want opposite things: the end user wants the
 * least possible cognitive load, and the agent wants almost nothing in context. So `docs/` has
 * exactly two doors and everything inside follows its door's rules.
 *
 * @setup A `docs/` folder holding exactly `user/` and `agent/`, each with its own index — an index
 * file under `docs/user/` for people and `docs/agent/README.md` as a list of pointers. The user
 * pages are markdown, and each one is one of the four kinds of the Diátaxis method
 * (https://diataxis.fr): a tutorial, a how-to guide, a reference or an explanation, in the folder
 * its kind names, `tutorials/`, `how-to/`, `reference/` or `explanation/`. The breadcrumbs say so as
 * guidance and refuse nothing. The guardrail below refuses anything else at the top of the folder, so a repo
 * with a different shape either moves its pages or does not bind this pack.
 */
export const docs = definePack("docs", (repo: Doors = {}) => {
  const root = repo.root ?? "docs";
  const allow = repo.allow ?? [];
  return {
    /**
     * Without it, an agent writing under `docs/` has no way to know there are two audiences. User
     * pages fill with rationale nobody asked for, and agent pages fill with copies of what the code
     * already says, which go stale silently while still reading as true.
     */
    docs: breadcrumb()
      .at(fileChange)
      .on(`${root}/**`)
      .description(`The two folders: ${root}/user is the spec and a change starts there, ${root}/agent is archival context.`)
      .text(
        [
          `Purpose. \`${root}/\` has two folders with opposite rules. \`${root}/user/\` is for people and is the spec: it states what the product does, and the code is made true to it. Each page is one Diátaxis kind, and its folder names the kind: \`tutorials/\`, \`how-to/\`, \`reference/\` and \`explanation/\`. \`${root}/agent/\` is archival context for agents, in Markdown, entered through README.md as an index of pointers.`,
          "## Rules",
          `- \`DCS-R1\` Start a change in behaviour as a change to the pages under \`${root}/user/\`, before any code.`,
          "- `DCS-R2` If the code does not do what a page says, fix the code. Do not change the page.",
          "- `DCS-R3` Put a new page in the folder of its kind, and give it a line in the index.",
          "- `DCS-R4` Use a picture wherever it explains better than a sentence.",
          `- \`DCS-R5\` Put in \`${root}/agent/\` only what a fresh agent could not derive from the code, the config or the guard layer.`,
          "  why: Derivable content goes stale silently while still reading as true.",
          "- `DCS-R6` Point outward from an agent doc. Never copy inward.",
          "- `DCS-R7` State current facts in the present tense. Write no history and no rationale essay.",
        ].join("\n"),
      ),

    // It sits BESIDE `docs`, not inside it, because the two breadcrumbs answer different questions
    // at different moments: `docs` fires anywhere under docs/ and says which door you are behind;
    // this one fires only behind the user door and says how a page there is written.
    /**
     * Without it, every user page is written in whatever style that session had, and the docs read
     * as ten authors. Its rules are the writing rules of the work skill, with nothing in them that is
     * one repo's taste.
     */
    userDocsStyle: breadcrumb()
      .at(fileChange)
      .on(`${root}/user/**`)
      .description(`How a page under ${root}/user is written — one kind a page, the sentence rules, examples copied from a real run.`)
      .text(
        [
          "Purpose. A user page is read by a person at work, and by the builder who makes the code true to it. A tutorial is one path, step by step, for learning by doing. A how-to is the steps to one goal, titled with the task. A reference page is for looking up: commands, keys, fields, states, errors. An explanation discusses a concept: what it is and why.",
          "## Rules",
          "- `UDS-R1` Write each page as one kind, never a mix.",
          "- `UDS-R2` Put the headline first, in every page and section.",
          "- `UDS-R3` Write one fact in each sentence, in under 25 words.",
          "- `UDS-R4` Write in the present tense, with \"you\" for the reader. Never write \"will\".",
          "- `UDS-R5` Say what happens, never what does not.",
          "- `UDS-R6` Describe the mechanism: what is called, with what, and what is returned. Do not use a metaphor.",
          "- `UDS-R7` Use exact names and numbers, and one name for each thing.",
          "- `UDS-R8` Define a term where it first appears.",
          "- `UDS-R9` Use numbered lists for steps, tables for items that share fields, and code blocks for anything typed or printed.",
          "- `UDS-R10` Add words in proportion to the change: a flag is a row, a new command is a section.",
          "- `UDS-R11` Cut every word that carries nothing.",
          "- `UDS-R12` Say each thing once, in one place, and link to it elsewhere.",
          "- `UDS-R13` Copy an example or printed output from a real run. Never type it from memory.",
        ].join("\n"),
      ),

    /**
     * Without it, `docs/` grows a third folder nobody chose — notes, scratch, drafts — and the two
     * doors stop being a rule. A folder with no declared audience is how a docs folder becomes a
     * drawer, and neither audience's rules can be applied to what is in it.
     */
    docsShape: guardrail()
      .at(commit)
      .on(`${root}/**`)
      .description("docs/ holds exactly user/ and agent/ — the folder allowlist.")
      // Nothing may sit loose at the top of docs/ — every file belongs to one of the two doors.
      .check(canonicalFiles({ root, allow, folders: ["user", "agent"] }))
      .message(
        "docs/ holds exactly two folders: `user/` (for people) and `agent/` (archival context, for agents). A third folder or a loose file at the top is documentation with no declared audience, which is how a docs folder becomes a drawer.",
      )
      .test({
        pass: [{ path: `${root}/user/index.md`, content: "" }],
        block: [{ path: `${root}/notes/scratch.md`, content: "" }],
      }),
  };
});
