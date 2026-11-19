// .versionrc.mjs — what `just release` computes, and over which files.
//
// commit-and-tag-version reads the conventional commits since the last `v*` tag, computes the next
// version, writes CHANGELOG.md, stamps the version files and makes a `chore(release): x.y.z` commit.
// `just release` adds a second commit above it that holds dist/, and tags that one. Nothing pushes.
// Below 1.0.0 every bump is demoted one level: a breaking change is a minor, a feature a patch.

export default {
  packageFiles: ["package.json"],
  bumpFiles: ["package.json", "package-lock.json"],
};
