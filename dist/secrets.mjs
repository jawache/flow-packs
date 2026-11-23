// packs/secrets.ts
import { breadcrumb, commit, definePack, guardrail, session, textBan } from "@jawache/flow";

// packs/sample.ts
function sample(glob) {
  return glob.replace(/\{([^,}]*)[^}]*\}/g, "$1").replace(/(^|\/)\*\*\//g, "$1").replace(/\/\*\*$/, "/a").replace(/^\*\*$/, "a").replace(/[*?]/g, "a");
}

// packs/secrets.ts
var LOCAL_ONLY = [".env.keys", ".env.*.local"];
var AWS_KEY_SHAPE = ["AKIA", "IOSFODNN", "7EXAMPLE"].join("");
var secrets = definePack("secrets", (repo = {}) => {
  const publicPrefixes = repo.publicPrefixes ?? ["PUBLIC_"];
  const localFiles = repo.localFiles ?? [...LOCAL_ONLY, ".dev.vars"];
  const envFiles = repo.envFiles ?? ".env*";
  const envFile = sample(envFiles);
  const keysFile = sample(localFiles[0] ?? ".env.keys");
  const extraShapes = repo.extraSecretShapes ?? [];
  const custody = repo.custody ?? "native";
  const encrypt = repo.encrypt ?? `dotenvx encrypt ${custody === "file" ? "--no-native " : ""}${publicPrefixes.map((prefix) => `-ek '${prefix}*'`).join(" ")}`;
  const { keyPlace, quietDecrypt } = custody === "file" ? {
    keyPlace: `\`.env.keys\` holds the decryption key: \`${encrypt}\` writes it, and it is copied by hand to every machine that runs the code; it is never in git.`,
    quietDecrypt: "If a decrypt looks suspiciously quiet, check `.env.keys` exists before you commit anything."
  } : {
    keyPlace: "The decryption key is in this machine's OS secret store, where dotenvx put it; no file in this repo holds it.",
    quietDecrypt: "If a decrypt looks suspiciously quiet, stop before you commit anything.\n  why: The key is missing from this machine's OS secret store."
  };
  const seam = repo.dx === void 0 ? "dotenvx run -f .env.<env> -- <cmd>" : `${repo.dx} <env> <cmd>`;
  const plaintextValue = `^(?!\\s*#)${publicPrefixes.map((prefix) => `(?!${prefix})`).join("")}(?!DOTENV_PUBLIC_KEY)[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*(?!["']?encrypted:)(?!["']?\\s*$).+`;
  return {
    /**
     * Without it, an agent avoids the env files on instinct — the trained reflex is right nearly
     * everywhere else — and either works around the seam or asks a human for values that are
     * committed, encrypted, three feet away.
     */
    orientation: breadcrumb().at(session).description("How secrets work here \u2014 the three tiers, the one seam, and what you may read.").text(
      [
        `Purpose. Env files in this repo are committed and encrypted (dotenvx): every value is an \`encrypted:\u2026\` blob except ${publicPrefixes.map((prefix) => `${prefix}*`).join(" / ")} config, which bundlers inline at build. Every value lives in exactly one of three tiers. Committed and encrypted: \`.env\`, \`.env.production\`, \`.env.staging\`. Local, never committed and never encrypted: \`.env.keys\` (the decryption key, when it is kept in a file) and \`.env.*.local\`. Runtime platform secrets: set per environment in the host platform's own secret store. ${keyPlace} One seam: \`${seam}\` decrypts and injects. \`dotenvx decrypt\` with no key present succeeds and writes empty values over your file.`,
        "## Rules",
        "- `ENV-R1` Read and edit the env files as expected work.",
        "  why: Your training says avoid env files. For plaintext env files it is right, and for these it is wrong.",
        "- `ENV-R2` Never read `.env.keys`.",
        "- `ENV-R3` Add a runtime secret only in the host platform's secret store.",
        "  why: A runtime secret added anywhere else does not reach the running service.",
        "- `ENV-R4` Run everything that depends on env through the seam: the dev server, a migration, a one-off script.",
        "- `ENV-R5` Never `source .env`, and never hand-roll a dotenv import.",
        `- \`ENV-R6\` ${quietDecrypt}`
      ].join("\n")
    ),
    // The sealed-file rule, and it needs a repo that HAS env files. A repo with none turns it off by
    // name in flow.config.ts, with the reason on the record, rather than leaving it sitting dead.
    /**
     * Without it, one plaintext value lands in a committed `.env` and the whole model is gone: the
     * files are committed on the promise that everything in them is sealed.
     */
    envEncrypted: guardrail().at(commit).on(envFiles).ignore(...localFiles).description(`A committed env file carries no plaintext value \u2014 everything but ${publicPrefixes.join(" / ")} is sealed.`).check(
      textBan({
        // A KEY=VALUE line whose value is neither an `encrypted:` blob nor empty, and whose key is
        // none of the declared public prefixes. Stated here rather than hidden in a script: which
        // keys a secret-leak rule waves through is the one fact its reader most needs.
        ban: [plaintextValue]
      })
    ).message(
      `A plaintext value in a committed env file \u2014 this is the leak the whole model exists to prevent, and git keeps it forever. Seal it with \`${encrypt}\` (${publicPrefixes.map((prefix) => `${prefix}*`).join(", ")} and the DOTENV_PUBLIC_KEY header stay plaintext by design).`
    ).test({
      pass: [{ path: envFile, content: "DOTENV_PUBLIC_KEY=03ab\nAPI_KEY=encrypted:BE9d\nPUBLIC_URL=https://x" }],
      block: [{ path: envFile, content: "API_KEY=sk-live-abcdef" }]
    }),
    noKeysFileInCommits: guardrail().at(commit).on(...localFiles).description("The decryption key and the local overlays can never be committed \u2014 the backstop when gitignore breaks.").check((ctx) => ctx.fail(`'${ctx.file?.path}' is machine-local`)).message(
      "This file is machine-local and must never be committed: `.env.keys` is the decryption key for every sealed value in this repo, and the `.local` overlays hold real, unencrypted values. The gitignore normally stops this \u2014 if you got here, the gitignore is broken."
    ).test({
      pass: [{ staged: [], deleted: [keysFile] }],
      block: [{ staged: [keysFile], world: { fs: { [keysFile]: "k" } } }]
    }),
    noSecretsInCommits: guardrail().at(commit).on("**").ignore("**/*.test.*", "**/*.spec.*").description("Staged content is scanned for live-key shapes \u2014 the leak that arrives outside an env file.").check(
      textBan({
        ban: [
          "sk_live_[0-9a-zA-Z]{16,}",
          "rk_live_[0-9a-zA-Z]{16,}",
          "AKIA[0-9A-Z]{16}",
          "-----BEGIN [A-Z ]*PRIVATE KEY-----",
          "ghp_[0-9A-Za-z]{30,}",
          "xox[baprs]-[0-9A-Za-z-]{10,}",
          ...extraShapes
        ]
      })
    ).message(
      `A live credential shape in staged content. Secrets belong in an encrypted env file (\`${encrypt}\`) or in the platform's runtime secret store \u2014 never in source, a fixture or a doc. If this is a real key, rotate it: staging it is already most of the way to publishing it.`
    ).test({
      pass: [{ staged: ["src/a.ts"], world: { fs: { "src/a.ts": "const key = process.env.KEY;" } } }],
      // ASSEMBLED, and the rule is why: written whole, the block case IS a live-key shape in
      // staged content, so this entry refuses the commit that adds it. Found the honest way —
      // it blocked the crossing's own commit at `guards/secrets.ts:87`.
      block: [{ staged: ["src/a.ts"], world: { fs: { "src/a.ts": `const k = '${AWS_KEY_SHAPE}';` } } }]
    })
  };
});
export {
  secrets
};
