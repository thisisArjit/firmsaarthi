# Private GitHub source snapshot

Created/verified 26 October 2026 under the user's connected GitHub account.

- Repository: https://github.com/thisisArjit/logistrace
- Repository ID: 1434084501; visibility private; default branch main.
- Published source commit: cd6a7d4dea9b6348d2b476509f43f77045d4b8df.
- Source tree: a74b800a6597b98810389dae08aed409848ec0ea.
- Parent: the user's initial commit 823cdf0151dc80ac91b6a9d0a5a300fe36ed15ea. README heading/tagline retained.
- Snapshot derives from local/Sites release 26, commit 189b1071111ac744a9fc3044e2574ae47ef4982e.

250 files were uploaded through the authorized GitHub connection and every remote blob SHA was compared with the sanitized local snapshot before main was updated. Branch head and private visibility were verified afterward. The exported source passed 43 synthetic tests and TypeScript; the unchanged local app passed all 44 tests including its private data-specific reconciliation test.

## Boundaries

This is an initial clean snapshot, not a mirror of the local Git history. Do not push the whole historical Sites repository without a fresh privacy audit.

Excluded customer database/uploaded files, secrets, runtime/build outputs, MIGRATION_REPORT.md and the three one-off migration operator scripts. GitHub README/SETUP/PROGRESS are source-safe summaries. The one production-data-specific reconciliation test is omitted only in the export. Runtime app source is unchanged.

The existing live Sites app, customer data, deployment identity and parent Apps Script remain unchanged. GitHub is not an automatic deployment or synchronization pipeline. No GitHub CLI credentials or local GitHub remote were configured; writes currently use the connected GitHub tools. For future authorized syncs preserve remote user edits, review exclusions, verify hashes and use the current branch head as a lease. Never overwrite remote edits or upload ignored migration/runtime data.

Ignored preparation files: outputs/export-github-source.mjs, outputs/github-source-tree.json, outputs/github-source-manifest.json and outputs/github-snapshot/. These contain no authorization tokens. The export helper preserves the initial snapshot's README, so revise it before future sync rather than blindly reusing it.
