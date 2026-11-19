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
    quietDecrypt: "If a decrypt looks suspiciously quiet, the key is missing from this machine's OS secret store; stop before you commit anything."
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
        `Env files in this repo are COMMITTED and ENCRYPTED (dotenvx): every value is an \`encrypted:\u2026\` blob except ${publicPrefixes.map((prefix) => `${prefix}*`).join(" / ")} config, which bundlers inline at build. Reading and editing them is expected work for you, not a violation \u2014 your training says avoid env files, and for plaintext env files it is right; for these it is wrong.`,
        "Three tiers, and every value lives in exactly one. Committed and encrypted: `.env`, `.env.production`, `.env.staging`. Local ephemera, never committed and never encrypted: `.env.keys` (the decryption key, when it is kept in a file \u2014 the ONE file you never read), `.env.*.local`. Runtime platform secrets: set per environment in the host platform's own secret store \u2014 a runtime secret added anywhere else does not reach the running service.",
        keyPlace,
        `One seam: \`${seam}\` decrypts and injects. EVERYTHING env-dependent goes through it \u2014 the dev server, a migration, a one-off script. Never \`source .env\`, never a hand-rolled dotenv import.`,
        `The trap worth knowing: \`dotenvx decrypt\` with no key present succeeds and writes EMPTY values over your file. ${quietDecrypt}`
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
      pass: [{ path: ".env", content: "DOTENV_PUBLIC_KEY=03ab\nAPI_KEY=encrypted:BE9d\nPUBLIC_URL=https://x" }],
      block: [{ path: envFile, content: "API_KEY=sk-live-abcdef" }]
    }),
    noKeysFileInCommits: guardrail().at(commit).on(...localFiles).description("The decryption key and the local overlays can never be committed \u2014 the backstop when gitignore breaks.").check((ctx) => ctx.file === void 0 ? ctx.ok() : ctx.fail(`'${ctx.file.path}' is machine-local`)).message(
      "This file is machine-local and must never be committed: `.env.keys` is the decryption key for every sealed value in this repo, and the `.local` overlays hold real, unencrypted values. The gitignore normally stops this \u2014 if you got here, the gitignore is broken."
    ).test({
      pass: [{ staged: [".env"], world: { fs: { ".env": "API_KEY=encrypted:BE9d" } } }],
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
