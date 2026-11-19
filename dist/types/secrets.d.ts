/**
 * What this pack cannot know: how this repo spells the env files it commits, and the two commands
 * that seal them and run against them.
 *
 * The two command names default to dotenvx's own, which is the honest floor — a repo that has
 * wrapped them in recipes (`just dx`, `just env-encrypt`) hands those over instead, and every
 * sentence a stuck reader meets then names a command that repo really has.
 */
export interface Seam {
    /**
     * The value prefixes that stay plaintext in a committed env file. Defaults to `["PUBLIC_"]`.
     *
     * A public value is one a bundler inlines at build time, so sealing it would break the build for
     * nothing. `DOTENV_PUBLIC_KEY` is always allowed beside these — it is dotenvx's own header, not a
     * repo's choice.
     */
    readonly publicPrefixes?: readonly string[];
    /**
     * The files that must never be committed. Defaults to `[".env.keys", ".env.*.local",
     * ".dev.vars"]`.
     *
     * These are also what `envEncrypted` ignores: a file nobody commits cannot carry a committed
     * plaintext value, and the two lists being one is what stops them drifting apart.
     */
    readonly localFiles?: readonly string[];
    /** The committed env files, as a glob. Defaults to `.env*`. */
    readonly envFiles?: string;
    /**
     * Extra credential shapes to scan staged content for, added to the six this pack ships (Stripe
     * live keys, AWS access keys, private key headers, GitHub and Slack tokens). Defaults to none.
     *
     * One regular expression per shape. A vendor whose token this pack has never heard of is a fact
     * only the repo has.
     */
    readonly extraSecretShapes?: readonly string[];
    /**
     * The repo's wrapper around dotenvx's runner, called as `<dx> <env> <cmd>` — it decrypts and
     * injects, and every env-dependent command goes through it. Defaults to dotenvx itself, spelled
     * `dotenvx run -f .env.<env> --`, which takes the env file rather than an environment name.
     *
     * A wrapper is worth having and this pack cannot guess its name: `just dx` is one fleet's
     * spelling, and written in here it would send every reader of a refusal to a command their repo
     * does not have, in the one sentence they read at the moment they are stuck.
     */
    readonly dx?: string;
    /**
     * Seals every env file in place, leaving the public prefixes plaintext. Defaults to dotenvx's
     * own `dotenvx encrypt`, excluding the prefixes above by name, and passing `--no-native` when
     * `custody` is `"file"`.
     */
    readonly encrypt?: string;
    /**
     * Where the private key that decrypts the env files is kept. Defaults to `"native"`.
     *
     * `"native"` is the OS secret store: the macOS Keychain, Windows Credential Manager or Linux
     * Secret Service. dotenvx 2.25 and later write the key there by default, and no file in the repo
     * holds it. A machine without the key in its store decrypts nothing.
     *
     * `"file"` is `.env.keys`, beside the env files and never committed. You copy it by hand to every
     * machine that runs the code. dotenvx writes it only when `dotenvx encrypt` is passed
     * `--no-native`.
     *
     * The orientation tells the agent which of the two this repo uses, and where to look when a
     * decrypt comes back empty.
     */
    readonly custody?: "native" | "file";
}
/**
 * Env files committed encrypted, decrypted through one seam, and the local-only files kept out of
 * git.
 *
 * The orientation is at SESSION, and that is the whole design. Models arrive with a trained
 * aversion to env files — usually correct, and reinforced by permission denials — which is exactly
 * wrong for the dotenvx model, where the committed files are encrypted and reading them is the
 * expected way to work. A file-change breadcrumb cannot fix that: the sessions where an agent silently
 * avoids env work are the sessions it never fires in. So it is said up front, every time.
 *
 * Three tiers, and every value lives in exactly one: committed-and-encrypted (`.env*`), local
 * ephemera that must never be committed (`.env.keys`, `.dev.vars`, `.env.*.local`), and runtime
 * secrets set per environment on the platform.
 *
 * The private key that decrypts the committed files is kept in one of two places, named by
 * `custody`: the OS secret store, which is dotenvx's default, or a `.env.keys` file copied by hand
 * to every machine.
 *
 * @install dotenvx 2.25 or later — https://dotenvx.com. It is what encrypts the committed files
 * and what runs a command with them decrypted, and with nothing else in place every sentence below
 * names it directly. 2.25 is the first release that keeps the key in the OS secret store by
 * default. The two command parameters are for a repo that has wrapped it in recipes of its own.
 * @setup `.env.keys`, `.dev.vars` and `.env.*.local` in `.gitignore` — the rules below refuse them
 * in a commit, and an ignore entry is what stops anyone reaching that refusal.
 *
 * Nothing else is required: unbound, the sentences name dotenvx itself. THIS PACK SHIPS NO FILE
 * and nothing is copied into a repo. What a repo gains by wrapping the tool is one place to say
 * which env file each environment means — REFERENCE below, not a file to match: it is a seam that
 * works as written, to copy and then spell your own way. The environments are the repo's own fact,
 * and so is the file list the sealing loop walks.
 *
 * ```just
 * [doc("Run any command with this environment's secrets injected — the ONE env seam. Usage: just dx dev npm run build")]
 * dx env +cmd:
 *     dotenvx run {{ if env == "prod" { "-f .env.production -f .env" } else { "-f .env.development.local -f .env" } }} -- {{cmd}}
 *
 * [doc("Seal every env file in place — everything encrypted except PUBLIC_* (bundlers inline those at build).")]
 * env-encrypt:
 *     #!/usr/bin/env bash
 *     set -euo pipefail
 *     for f in .env .env.development.local .env.production; do
 *       if [ -f "$f" ]; then dotenvx encrypt -f "$f" -ek 'PUBLIC_*'; fi
 *     done
 *
 * [doc("List the variable NAMES in an env file — no values, nothing decrypted. Usage: just env-names .env")]
 * env-names file=".env":
 *     grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' {{file}} | tr -d '=' | sort
 * ```
 *
 * Bound, that repo hands over `dx: "just dx"` and `encrypt: "just env-encrypt"`. The third job is
 * nobody's parameter — no sentence in this pack names it — and it is here because an env seam
 * wants it.
 *
 * These recipes leave the key's place to dotenvx. Run with no terminal attached, as an agent runs
 * them, it writes a new key to the OS secret store; in a terminal it asks. A repo bound with
 * `custody: "file"` adds `--no-native` to the `dotenvx encrypt` line, so dotenvx writes the key to
 * `.env.keys`. The switch matters only the first time a file is sealed, when its key is created.
 * `dotenvx run` needs no switch in either case: it reads `.env.keys` before it looks in the OS
 * secret store.
 * @adopt A repo with no `.env*` at all binds this for `noSecretsInCommits` alone, which is worth
 * having in a repo that has never held a secret, and turns `envEncrypted` off BY NAME in its
 * config with the reason on the record — an entry sitting dead is not the same as one opted out of.
 */
export declare const secrets: import("@jawache/flow").Pack<{
    /**
     * Without it, an agent avoids the env files on instinct — the trained reflex is right nearly
     * everywhere else — and either works around the seam or asks a human for values that are
     * committed, encrypted, three feet away.
     */
    orientation: import("@jawache/flow").BreadcrumbSentence<"at" | "description" | "text", "session">;
    /**
     * Without it, one plaintext value lands in a committed `.env` and the whole model is gone: the
     * files are committed on the promise that everything in them is sealed.
     */
    envEncrypted: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
    noKeysFileInCommits: import("@jawache/flow").GuardrailSentence<"at" | "on" | "check" | "message" | "test" | "description", "commit">;
    noSecretsInCommits: import("@jawache/flow").GuardrailSentence<"at" | "on" | "ignore" | "check" | "message" | "test" | "description", "commit">;
}, Seam | undefined>;
