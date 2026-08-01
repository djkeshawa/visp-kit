# ADR 0006: Atomic Writes and One Public Artifact Reader

- **Status:** Accepted
- **Date:** 2026-08-01
- **Accepted:** 2026-08-01
- **Workspace decision:** D-104, Phase 9 P9-01 and P9-02

## Context

Kit wrote artifacts by truncating their destination and then filling it again.
That preserved the eventual bytes but not the observable file: a concurrent
reader could see an empty or partial JSON document and mistake an ordinary write
for corruption. Phase 9 adds the first live artifact consumer, so this hidden
defect becomes user-visible.

Kit already had a validated JSON reader, but it was internal and returned a
`Result`. A missing artifact and an artifact that could not be read were both
errors, while consumers of a read-only surface need those states to remain
distinct. The package root is the CLI entry point and executes immediately, so
it is not a safe library import.

## Decision

### Writes

`writeTextFile` writes to a uniquely named temporary file beside the resolved
destination, flushes and closes it, then renames it over the destination. Every
existing text and JSON writer continues through that function and keeps its
`Result<string, VispError>` contract.

The temporary file is removed on every pre-commit failure. Once rename succeeds,
the write is committed and returns success. Directory sync is a best-effort
durability hint because filesystem support varies; its failure must not produce
a false error after the target has already changed.

Existing destination permissions are retained. If the destination is a symbolic
link, Kit follows the complete link chain to its existing or missing leaf and
atomically replaces or creates that target in the target's directory instead of
replacing any link in the chain. This preserves the previous `writeFile`
behavior while maintaining the same-directory rename guarantee for the file
whose bytes change.

Content-addressed review decisions also retain their create-exclusive,
immutable behavior. Kit flushes a unique sibling first and then creates the
final directory entry with an atomic hard link. A concurrent reader therefore
cannot observe a partial decision, while a pre-existing decision still fails
with `EEXIST` and is checked for idempotent content.

Publishing a decision history entry and its current pointer is serialized by
the pointer lock. Kit builds a nonempty lock directory with a unique owner entry
and atomically renames it into place. Cleanup checks the acquired directory's
device and inode and removes only that acquisition's unguessable owner name; it
cannot remove a successor lock that acquired the same pathname. The
compare-and-swap check, immutable history create, and pointer rename all occur
while that lock is held. If pointer publication fails, Kit removes the history
entry only when this operation created it and the directory entry still has the
same device and inode identity. A losing concurrent writer therefore cannot
delete history owned by the winner.

A process crash intentionally leaves a visible lock instead of guessing that an
unresponsive publisher is dead. The next command reports the exact lock path. An
operator may remove only that entry after confirming that no review-decision or
repair process is running, then retry. There is no automatic timeout that could
split a legitimate long-running publication into two concurrent writers.
Diff identity ignores only the exact generated owner path shapes for published
and not-yet-published lock directories, so a concurrent review does not mistake
lock bookkeeping for code while arbitrary assurance-directory files remain
material.

A crash after the hard-link commit but before sibling cleanup can leave the
complete inode under both its canonical history name and the exact internal
temporary name. History enumeration ignores only that strict generated name
shape; every other unexpected entry still fails closed. The canonical history
file remains immutable and authoritative, and the residue contributes no
second decision.

### Reads

The side-effect-free package subpath `visp-kit/artifacts` exports:

- all Kit artifact path functions and schemas;
- `readArtifactState` for validated JSON and `readTextArtifactState` for
  schema-validated text;
- `createArtifactReader(rootPath)`, whose typed accessors bind Kit-owned artifact
  classes to their path and schema; and
- `artifactSchemas`, the shared schema registry for consumers such as the local
  Cockpit and a future ingest implementation.

Every state-aware read returns exactly one discriminated state:

- `present`: schema-valid content plus source path and modification time;
- `missing`: no directory entry at the expected path;
- `stale`: schema-valid content older than an explicit caller-supplied
  `staleAfter` boundary; or
- `unreadable`: I/O failure, invalid JSON, or schema-invalid content, identified
  by an issue code and reason.

JSON and text are decoded as strict UTF-8 before parsing or validation. Invalid
byte sequences are classified as `invalid_json` for JSON and `invalid_schema`
for text instead of being replacement-decoded into apparently valid content.

Kit does not invent a time-to-live or a per-artifact freshness policy. The
reader only applies an explicit valid `Date` supplied by the consumer. The
reported path is absolute because reads are rooted at a resolved project path;
presentation layers may render it project-relative without changing identity.

The existing `readArtifact` function delegates to this state-aware core and maps
the outcome back to its established `Result` contract. Existing Kit callers do
not change, and there is one validation implementation rather than a parallel
reader.

Dynamic identifiers used by root-bound accessors must be one safe path segment.
Review decision hashes must be prefixed lowercase SHA-256 digests. Invalid input
is rejected before filesystem access, so an accessor cannot escape its project
root lexically. Root-bound accessors also reject final or intermediate symbolic
links below the root before reading bytes, and recheck the opened file identity.
This prevents a read-only consumer from disclosing an external file through a
crafted `.visp/` link. A dangling final or intermediate link remains
`unreadable`; it is not collapsed into `missing`, because its directory entry
does exist. Artifact paths must name regular files and are opened non-blockingly
where supported, so FIFOs and other special files fail visibly rather than
blocking the local server. Because a legitimate atomic replacement changes the file identity
between those checks, acquisition retries that identity-only race a bounded
number of times; path, containment, and symbolic-link failures remain immediate
failures. The generic path-level readers remain available for callers that
intentionally manage their own filesystem boundary.

The public reader covers Kit-owned artifacts only. It does not validate Hyper
state, establish wire trust, read a private Control Plane store, compute a
verdict, or decide whether evidence is sufficient.

## Consequences

- Concurrent readers observe the previous complete artifact or the new complete
  artifact, never an in-place partial write.
- Missing, stale, and unreadable are stable data states rather than UI guesses.
- Schema validation and source metadata travel together through one public
  package surface with no CLI side effect.
- The exact `./artifacts` export is paired with a compatibility wildcard so the
  package metadata, versioned schemas, CLI build, and other previously shipped
  package-relative paths remain reachable. No artifact schema, WorkflowAction
  protocol, schema hash, or command behavior changes in this unit.
- A process killed before rename can leave an unreferenced temporary file. The
  live target remains complete; normal error paths clean their temporary file.
