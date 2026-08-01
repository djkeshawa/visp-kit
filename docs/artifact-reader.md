# Artifact reader

Consumers that render or ingest Kit's `.visp/` artifacts should use the
side-effect-free package subpath:

```ts
import { createArtifactReader } from "visp-kit/artifacts";

const artifacts = createArtifactReader(process.cwd());
const status = await artifacts.projectStatus();

switch (status.state) {
  case "present":
    console.log(status.path, status.value.currentState);
    break;
  case "stale":
    console.log(status.path, status.reason);
    break;
  case "missing":
  case "unreadable":
    console.log(status.path, status.reason);
}
```

Accessors bind each Kit-owned artifact class to its canonical path and Zod
schema. Every result includes the source path. Valid content also includes its
filesystem modification time and typed value. Root-bound accessors reject any
symbolic link below the reader root, including a final-file link, before reading
bytes. Unsafe link traversal, including a dangling final or intermediate link,
is reported as `unreadable` with the `io` issue rather than `missing`;
consumer-facing readers therefore cannot expose a file outside the project or
confuse an unsafe directory entry with absence. Artifact paths must name regular
files and are opened non-blockingly where supported, so a FIFO, socket, device,
or directory becomes `unreadable/io` instead of waiting for a producer or
consuming a Cockpit worker. A bounded identity-acquisition
retry distinguishes a normal atomic replacement from unsafe traversal without
accepting a partially written file.

Feature consumers should normally call `featureIntent(featureKey)`. Kit's normal
feature workflow writes `intent.json`, and that accessor validates the complete
intent artifact. `feature(featureKey)` and `constitutionArtifact()` remain
available as additive legacy or canonical reads; neither is a substitute for the
normal intent path, and neither is removed by this surface.

Review artifacts have two granularities. Use `taskReview(featureKey, taskId)` for
`.visp/features/<feature>/review/<task>.review.json`, and
`featureReview(featureKey)` for the feature-level `review.json`.

## States

| State | Meaning |
|---|---|
| `present` | The file was read, parsed, and validated. |
| `missing` | No file exists at the expected path. |
| `stale` | The file is valid but older than the caller's explicit freshness boundary. |
| `unreadable` | I/O, JSON parsing, or schema validation failed. |

Readers decode UTF-8 strictly. Malformed byte sequences are never replaced with
`U+FFFD` and accepted as content: JSON reports `invalid_json`, while text
artifacts report `invalid_schema`.

Freshness has no implicit policy. Supply a valid `Date` only when the consumer
has an authoritative boundary:

```ts
const status = await artifacts.projectStatus({
  staleAfter: new Date("2026-08-01T12:00:00.000Z")
});
```

For a path and schema not covered by a root-bound accessor, use
`readArtifactState(path, schema, options)`. `readTextArtifactState` provides the
same states for Kit's text artifacts. These path-level primitives have no root
boundary; consumers reading project artifacts should prefer
`createArtifactReader`. `readContainedArtifactState` and
`readContainedTextArtifactState` are available when a custom schema still needs
the same root-containment guarantee. `artifactSchemas`, all individual schemas,
and all artifact path functions are exported from the same subpath.

Run events are JSON Lines rather than one JSON document. Locate the stream with
the public `runEventsPath(rootPath, runId)` helper and validate each line with
`runEventSchema`; there is deliberately no whole-file JSON accessor for
`events.jsonl`.

Dynamic feature keys, task IDs, and run IDs accepted by accessors are constrained
to one path segment. A malformed identifier or freshness boundary is a caller
error and is rejected before reading.

This package reads and validates. It does not calculate workflow permission,
evidence sufficiency, assurance, or PR readiness.
