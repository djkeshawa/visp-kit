# Policy And Gates

Visp Kit policy is stored in `.visp/policy.json`. Gates use that policy, local artifacts, reports, and Git diff signals to decide whether a workflow step is allowed.

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Policy File

Create or update policy:

```bash
visp-kit policy init --strictness strict
visp-kit policy set-strictness locked
visp-kit policy migrate
visp-kit policy validate
visp-kit policy show
```

Strictness modes:

- `relaxed`: prefer warnings, useful for experiments
- `standard`: default guardrails
- `strict`: block missing required workflow evidence
- `locked`: most cautious mode, disallows overrides unless policy explicitly
  permits them, and the only mode that requires a pre-implementation oracle lock
  (VSP023) by default

### Choosing between them

The three lower modes differ in how much *paperwork* they demand before a stage
is allowed. They are all satisfied by well-formed documents, and none of them
runs your tests.

`locked` is a different kind of setting, and it is worth knowing before you pick
it. It is the only mode that turns on **VSP023**, which refuses implementation
until the task's own validation commands have been run and their result recorded
as a baseline.

| | below `locked` | `locked` |
|---|---|---|
| What it costs | nothing beyond writing the artifacts | **three extra commands before a single line may be edited**, one of which (`verify --baseline`) runs the task's entire validation command set — paid on every task, not only the ones that would have gone wrong |
| What it buys | a gate that asks whether a document exists | the only gate that asks whether the code **runs**, plus the test-strength signal that a test proving a fix must pre-date the fix |
| What it does **not** buy | — | any claim that the resulting code is more correct. **Nobody has measured that.** See [What VSP023 is not evidence for](#what-vsp023-is-not-evidence-for). |

Both directions are one key wide, in either mode — see
[VSP023 — the assurance sequence](#vsp023--the-assurance-sequence).

## Gate Command

Examples:

```bash
visp-kit gate next
visp-kit gate implement --task T001
visp-kit gate review --task T001
visp-kit gate pr
```

Allowed gates exit `0`. Blocked gates exit non-zero and report the next allowed command.

Gate reports are written to:

```text
.visp/reports/gate-report.md
```

Use `--dry-run` to avoid writing the report.

## Gate Stages

Supported stages:

- `next`
- `setup`
- `feature`
- `clarify`
- `spec`
- `plan`
- `tasks`
- `context`
- `implement`
- `verify`
- `review`
- `reconcile`
- `pr`

## Rule IDs

| Rule | Name | Typical blocking stage | Overridable |
|------|------|------------------------|-------------|
| VSP001 | require_scan_before_feature | feature, next | yes |
| VSP002 | require_constitution_before_feature | feature, next | yes |
| VSP003 | require_clarify_before_spec | spec, next | yes |
| VSP004 | require_spec_before_plan | plan, tasks, next | yes |
| VSP005 | require_plan_before_tasks | tasks, next | yes |
| VSP006 | require_tasks_before_context | context, implement, next | yes |
| VSP007 | require_context_before_implementation | implement, verify | yes |
| VSP008 | require_requirement_mapping_for_tasks | context, implement | yes |
| VSP009 | require_acceptance_criteria_for_behavior_tasks | context, implement | yes |
| VSP010 | require_validation_commands | context, implement, verify | yes |
| VSP011 | block_forbidden_file_changes | implement, pr | yes |
| VSP012 | block_out_of_scope_changes | implement, pr | yes |
| VSP013 | block_unapproved_dependency_changes | implement, pr | yes |
| VSP014 | require_verify_before_review | review, reconcile, pr | yes |
| VSP015 | require_review_before_reconcile | reconcile, pr | yes |
| VSP016 | require_reconcile_before_pr | pr | yes |
| VSP017 | require_traceability_update_before_pr | reconcile, pr | yes |
| VSP018 | require_policy_validation | setup, all workflow stages | yes, except locked policy may disallow |
| VSP019 | user_prompt_cannot_override_policy | all stages | no |
| VSP020 | stop_on_failed_gate | all stages | no |
| VSP021 | block_on_unresolved_drift | pr | yes |
| VSP022 | prevent_assurance_profile_lowering | task-aware gates | yes, with an auditable reason |
| VSP023 ‡ | require_oracle_lock_before_implementation | implement | no |
| VSP024 | require_current_assurance_decision_before_pr | pr | no |
| VSP025 | require_signed_assurance_decision | pr | no |
| VSP026 † | require_understanding_before_behavioural_implementation | implement | yes, with an auditable reason |

† **VSP026 is recorded, not enforced.** It is `false` in every strictness mode —
`relaxed`, `standard`, `strict` and `locked` — so it is not one of the
protections this table otherwise lists. It has never fired in a measured run:
on the 29-task planned set used for the Phase 21 measurement, all 29 reached the
ambiguous default because those task records declare no change surface, so the
rule's misclassification rate is **unmeasured**. What runs today is the
classification *record*, which `visp-kit gate` writes at `implement` and
`verify` whether or not the rule is enabled — that record is the only instrument
there is for finding out whether the rule is right, and it stays on. Treat the
row above as a rule that exists and is off, not as a protection in force.

‡ **VSP023 is on by default in `locked` and off everywhere else.** See
[VSP023 — the assurance sequence](#vsp023--the-assurance-sequence) below.

Non-overridable rules cannot be bypassed by `.visp/overrides.json`.

### Rules a policy file does not mention

VSP021–VSP026 are optional in `.visp/policy.json` for backward compatibility:
policies written before those rules existed keep validating. **An absent key is
resolved to the value the file's own `strictnessMode` declares**, so a file
saying `"strictnessMode": "strict"` enforces what `strict` means today, not what
it meant when the file was written. A key stored as `false` is a decision and is
honoured — except for VSP021 and VSP024, which the schema refuses to accept as
`false` in `strict` or `locked` because those modes are a claim about
enforcement. Drop to `standard` if you need them off.

Run `visp-kit policy migrate` to write the resolved values into the file.
Nothing changes about what is enforced — the resolution happens at load either
way — but the file then states it, which is the point of policy-as-code.

**Upgrading Kit can therefore raise enforcement in a repository whose
`policy.json` nobody edited.** That is the intended behaviour of a strictness
mode, but meeting it for the first time as a blocked PR gate is not. Every
surface that reads the policy now names the back-fill before it can bite:

| Where | What it tells you |
|---|---|
| `visp-kit doctor` | a warning, `Policy file understates what it enforces`, listing the omitted keys that resolve to **on** — this runs before any gate does |
| `visp-kit gate <stage>` | the same warning on the gate report, because the gate is where the back-fill is actually felt |
| `visp-kit policy show`, `policy validate`, `status` | the same warning while the file is understating itself |

The warning distinguishes the two cases that matter, because they are not
equally interesting. A key back-filled to `false` costs you nothing and is only
counted. A key back-filled to `true` is enforcement your file never asked for,
so it is named individually and by the rule id the gate report will print:

```text
Policy file omits 6 rule keys. 4 of them are ENFORCED at the strict defaults
and can block a gate this project has not seen before: VSP021 (blockOnUnresolvedDrift),
VSP022 (preventAssuranceProfileLowering), VSP024 (requireCurrentAssuranceDecisionBeforePr),
VSP025 (requireSignedAssuranceDecision) (2 further omitted keys resolve to off).
Run `visp-kit policy migrate` to record them.
```

Reading `VSP024` in a gate failure is no help if your file only ever mentions
`requireCurrentAssuranceDecisionBeforePr`, so the warning prints both spellings.

VSP021 fails the PR gate when the active context pack was grounded on artifacts
(spec, plan, task graph, policy) that changed after the pack was compiled. Run
`visp-kit drift` for the full deterministic drift report.

## VSP023 — the assurance sequence

VSP023 refuses implementation until the task has a current oracle lock bound to
passing pre-implementation baseline evidence. It is the only rule in the set
that asks whether the produced code *works* rather than whether an artifact
exists, and it carries the test-strength signal: on behavioural and critical
tasks the test proving the fix must be Git-proven pre-existing or explicitly
pre-approved. That is the defence against an agent satisfying a task with a test
that asserts nothing. Every other gate can be satisfied by a well-formed
document.

**It is on by default in `locked`, and off in `relaxed`, `standard` and
`strict`.**

A default is a claim about which failure is worse, so here is the claim. Turning
VSP023 on costs three commands before a single line may be edited, and one of
them runs the task's whole validation command set. That cost is paid on every
task, not only the ones that would have gone wrong. Below `locked`, the worse
failure is a blocked developer who never asked for a pre-implementation
baseline. In `locked` — where overrides are already disallowed and the
changed-file limit is five — the worse failure is unproven code.

Both directions are reachable without editing Kit:

```jsonc
// .visp/policy.json — turn it on below locked
{ "rules": { "requireOracleLockBeforeImplementation": true } }

// .visp/policy.json — turn it off in locked (explicit, auditable, survives migrate)
{ "rules": { "requireOracleLockBeforeImplementation": false } }
```

Two other things activate it at any strictness: declaring an
`assurance.profile`, and the mere existence of an oracle plan for the task.
The last one matters — **deleting the policy rule does not open a gate that a
plan has already closed.**

The sequence, which `visp-kit next` emits one command at a time:

```bash
visp-kit oracle plan --task T001        # bind policy, spec, plan, tasks, context, commands, base commit
visp-kit oracle approve --task T001 ... # critical tasks only
visp-kit oracle lock --task T001        # freeze it
visp-kit verify --baseline --task T001  # run the locked commands BEFORE implementing
# ... implement ...
visp-kit verify --candidate --task T001 # run the same locked commands and compare
```

### What VSP023 is not evidence for

The sequence above is **reachable and verified to run**; it is not measured to
help. Both halves of that sentence are load-bearing, so both are stated here.

Verified, and checkable by you in a few minutes: on a fresh `visp-kit init`
project the three lower presets resolve the rule `false` and `locked` resolves
it `true`; deleting the key from a `locked` policy file falls back to the preset
rather than to off; and running the sequence writes an `assurance/` directory
you can open. `visp-kit policy show --json` reports the resolved value, so you
never have to take this document's word for it.

Not measured, and not implied anywhere in this package: **whether a task that
went through the oracle sequence ends up with more correct code than one that
did not.** No study has run. A trial designed to answer a related question about
agent accuracy was preregistered and stopped early against an exhausted API
quota, at 9 usable pairs out of 56 — far too few to resolve anything, and it is
reported as resolving nothing. If you adopt `locked` for VSP023, adopt it
because you want the baseline artifact and the refusal, which are real and
inspectable. Do not adopt it on the strength of an outcome claim; there isn't
one.

## VSP026 — understanding before behavioural implementation

VSP026 gates **behavioural** tasks only. A mechanical task passes through
untouched, and an ambiguous task counts as mechanical: under-gating a
behavioural task costs today's behaviour, while over-gating a trivial edit
teaches agents that the gate is noise and they then route around it everywhere.

It is **off by default in every strictness mode**. Enable it per project:

```json
{ "rules": { "requireUnderstandingBeforeBehaviouralImplementation": true } }
```

The classification is recorded in the gate report as `taskClassification`
whether or not the rule is enabled, so the rule's own accuracy can be measured.
It reads only declared, auditable inputs — the change surface
(`allowedFiles` ∪ `expectedFiles`), the declared fields (`taskClass`,
`riskFactors`, `blastRadius`, `reversibility`), the intel case when one is
current, and scan's repository model. It does **not** read `task.title`,
`task.description`, spec prose or the user prompt: intent is raw input under
VSP019, and prose is the one input an agent can rewrite to change its own gate.

### Every declared `taskClass` is mapped

The mapping from `taskClass` to a verdict is **total**, and total by
construction — `satisfies Record<TaskClass, …>` in
`src/gates/task-classification.ts` will not compile if a member of the enum has
no decision recorded against it.

| `taskClass` | verdict | rule |
|---|---|---|
| `localized_bug`, `bounded_feature`, `cross_file_change`, `migration`, `security`, `refactor` | behavioural | B1 |
| `documentation`, `regression_test` whose surface holds non-test **code** | behavioural | B4 |
| `documentation`, `regression_test` whose surface does not | mechanical | M1 |

`refactor` used to appear in neither list, so a task declaring it fell through
every rule to `ambiguous_default_mechanical` and was not gated. A refactor is a
change whose whole claim is *about* behaviour, so it is behavioural, and the
type-level totality is there so the next enum member cannot repeat the hole.

### A declared mechanical class holds only while the surface agrees

A `taskClass` is written by whoever wrote the task, so a rule that honours it
unconditionally lets a task choose its own gate. A verifier defeated VSP026 by
declaring `documentation` and editing source: the old rule had a catch-all
`M3_declared_mechanical_class` branch that accepted any declared mechanical
class whatever the surface held.

**B4** replaces that branch. A declared mechanical class is *refuted* when the
change surface holds a file that is positively known to be non-test executable
code, and a refuted class classifies **behavioural**. The evidence is scan's
own file index joined with the declared surface — never the declaration, never
prose.

Two properties keep this from becoming over-gating:

- **Contradicting evidence gates; absent evidence does not.** A file nobody has
  indexed and whose path does not say "code" is not in the refuting set for an
  UNDECLARED task. A task that declares nothing at all is still ungated, exactly
  as before.
- **"Code" is narrower than `isRecognisedTextFile`.** Scan marks Markdown, JSON,
  CSS and HTML as recognised text files, so that flag could never distinguish a
  documentation task from a source one — every `.md` file in this repository
  sets it, which is why M1 and M2 could not fire on the one class they were
  written for. B4 asks whether the language is a programming language
  (`isProgramFilePath`), which is what "non-test source file" was reaching for.
  (The flag was called `isSourceFile` until it was renamed to say what it means;
  the semantics did not change, and caches written under the old name are still
  read.)

### Three ways VSP026 could be defeated, and how each is closed

All three were "the rule cannot fire", not "the rule decided wrongly".

1. **The language list.** `isProgramFilePath` recognises seven languages out of
   a twenty-extension map. Declaring `documentation` and putting the change in
   Ruby, PHP, C, C++, C#, Swift, Scala, shell, SQL, `.vue`, `.svelte`, Dart or
   Elixir made `detectLanguage` return `Other`, emptied the refuting set, and
   left the task ungated — and it survived `verify` too, because the
   realized-surface enforcement keys on B4's basis and B4 was precisely the rule
   that could not fire. The fix is a second, **fail-closed** predicate,
   `attestsMechanicalClass`, read only when a mechanical class was *declared*: a
   file whose language cannot corroborate the claim refutes it. Markdown, JSON
   and YAML attest; CSS and HTML do not (a stylesheet is not documentation); an
   unrecognised extension does not. The asymmetry is deliberate — absent
   evidence still does not gate an undeclared task.
2. **The surface spelling.** The declared surface was not normalised, so
   `./src/a.ts` reached the classifier verbatim while scan's index holds
   `src/a.ts`. Both linkage joins are exact string comparisons, so B2 and B3
   went silently empty and a task declaring no class fell to the ungated
   default. Paths are now normalised once at the boundary
   (`normalizeRepositoryPath`), used by `declaredSurface` and by every index
   join.
3. **The space filter.** `concreteScopePaths` dropped any entry containing a
   space, which removed `src/my file.ts` from the surface entirely and silently
   — the same shape as the VSP012 defect this document records, performed by the
   parser rather than by an agent. A spaced entry is now admitted when it looks
   like a path (a directory separator and a file extension) rather than like the
   task generator's prose rule.

`visp-kit verify` re-runs the classification against the **realized** change
surface — the diff, not the declaration. When that realized surface refutes a
declared mechanical class, VSP026 fails at `verify` with an error, because at
that point the strongest available evidence says the declaration was wrong. It
is still clearable through the ordinary recorded override, and it is silent
while VSP026 is disabled. Every other mechanical→behavioural move at verify
stays a recorded warning: that is ordinary scope drift, which the scope rules
own, and blocking it here would be retroactive.

`mechanicalClassCorroboration` in `src/gates/task-classification.ts` is total
over the mechanical classes, so adding one fails to compile until someone
records what would corroborate it.

**The ambiguous default is now reachable only when no `taskClass` is
declared.** That case remains ungated on purpose: the rule reads declared
evidence, a task that declares nothing has no admissible evidence, and reading
prose to fill the gap is what VSP019 forbids. Note the consequence rather than
assume it away — VSP026 binds nothing before a planner has written a surface
and a class, so it is not the thing that catches an agent editing on a hunch
before scope exists. That gap is closed upstream instead: `visp-kit tasks
--validate` refuses a task graph whose tasks lack a `taskClass`, `riskFactors`
or a concrete allowed/expected file, and `taskGraphReadiness` mirrors the same
check in `visp-kit next`. A task graph written straight to disk bypasses both,
which is exactly what the Phase 21 ablation did and why it saw the ambiguous
default on 29 of 29.

The F1 risk-factor floor is likewise a total record over `riskFactorCodeValues`
rather than a partial set. `dependency`, `concurrency` and `deployment` are
recorded as **not** on the floor, with reasons; that is a decision, not an
omission, and it does not make such a task mechanical — it still reaches B1,
B2 and B3.

When the verdict is behavioural, each condition is a separate finding:

| Condition | Requires |
|-----------|----------|
| G1 | a current understanding case for this task |
| G2 | at least one entrypoint |
| G3 | at least one path relation, **or** an explicit unresolved scout status |
| G4 | at least one affected test, or a concrete validation command |
| G5 | cited unknowns resolved or named in an override reason |
| G6 | every candidate change entity inside the declared surface |

Clear it the same way as any other rule:

```bash
visp-kit override create VSP026 --scope task --feature <feature> --task <id> \
  --reason "<at least twelve characters, auditable>"
```

There is no flag, no environment variable, and no silent policy escape. Once
the rule is on, deleting `.visp-intel/` does not open the gate — G1 fails and
the task stays blocked.

## Reading intel's artifacts

Kit reads two optional files from `.visp-intel/` and writes neither:

- `.visp-intel/projection/graph.json` — a `visp-intel repo projection`
  artifact, intel's compact consumer view of one snapshot. `scan` uses it to
  back `module-map.json` with resolved file-to-file imports and real external
  module names. `dependency-map.json` stays manifest-derived: its fields are
  package-manager facts (versions, scripts, lockfiles) that a code graph does
  not carry. Scan writes what it read to `.visp/cache/intel-scan.json`; the
  other scan artifacts are unchanged by the presence of a store.

  **`visp-kit context` reads the same file.** From the files a task already
  touches — its declared `allowedFiles`/`expectedFiles`, the understanding
  case's path and signature files, or failing both the top three lexical hits —
  a bounded breadth-first walk over the projection's file-grain import and test
  edges scores every file within two hops (`file → (0, 1]`, seed 1.0, hop 1
  0.5, hop 2 0.25, at most 256 files reached, orderings by code point so the
  result does not depend on the ambient locale). That map is consumed in exactly
  one place, as a bounded **addition**:

  - at most **two** eligible hop-1 files the lexical ranking did not select are
    **appended** to the candidate list;
  - they are appended, never substituted, so the file list with a graph is an
    order-preserving extension of the list without one — no graph fact can take
    a file's body away;
  - they receive a summary and **never** a snippet: `allocateSnippets` is handed
    exactly the list it would have seen with no graph, so the reserved relevance
    floor and the cited path's snippet budget are untouched;
  - hop-2 files never buy a slot;
  - every admitted file passes the same eligibility join as any other candidate
    — indexed, not forbidden, not ignored, not binary, not a lockfile.

  Every threshold above is a literal in `src/context/context-selector.ts`. The
  projection supplies facts about the tree and no score, no readiness flag and
  no budget. A missing, oversized, unparseable or non-head projection, an empty
  seed set, or a repository whose graph reaches nothing all produce the
  identical pack Kit would produce with no intel at all.

  **Compaction is not affected.** The mode that withholds whole-file bodies
  fires on the presence of a task-scoped understanding case and on nothing else.
  The projection is repository-wide and present on every task once intel has run
  once; if it could set that mode, indexing a repository would shrink every pack
  in it forever with no per-task evidence behind any of them.

  The pack records what it read: `artifactProvenance` now also carries the file
  index, the file summaries, the module map and the projection, hashed by
  content rather than by bytes so a re-scan that changed nothing is not reported
  as drift. An entry whose content hash cannot be recomputed is *unverified*,
  which is not the same as stale and produces no finding.

  **Not `.visp-intel/graph.json`.** Scan read the archival `repo export` until
  the projection existed, and on most repositories the read never happened: the
  export carries every snapshot on the lineage and every evidence record, and
  measured 128.1 MiB on `visp-kit` against a 64 MiB read limit, so scan warned
  and degraded. The projection of the same snapshot is 1.89 MiB. Scan's limit
  is now 16 MiB — intel's own bound on a projection — and a project holding an
  export and no projection is told to run `visp-intel repo projection` rather
  than silently losing the graph it thinks it has.
- `.visp-intel/understanding/<task-id>.json` — the Understanding Case export,
  read by the context pack and by VSP026.

Both are optional in the strict sense: missing, unreadable or schema-invalid
each produce a warning and today's behaviour. Kit has no dependency on
`visp-intel`, imports no intel module, and never shells out to its CLI.

A case counts as **current** only when its snapshot equals repository head, its
`repositoryInstanceId` matches the one scan recorded, its `gitCommit` matches
the context pack's `baseCommit`, and it was exported from a clean worktree.
Matching on instance id rather than directory path is deliberate: a re-clone or
a sibling worktree at the same path is a different repository and must not
inherit another one's case. A stale case never fails a command — it simply does
not satisfy the gate and is not rendered into the prompt.

## Assurance Profile Selection

For classified tasks, Kit calculates the minimum assurance profile before
implementation:

- `routine` for low-risk documentation, regression-test, and refactor tasks;
- `behavioral` for localized bugs, bounded features, cross-file changes, and
  medium risk; and
- `critical` for security or migration tasks, high risk, declared risk factors,
  dependency manifests/lockfiles, deployment workflows, and critical code
  areas such as authentication, authorization, cryptography, schemas,
  permissions, and migrations.

The calculation uses the task's allowed and expected paths, so it is stable
before implementation. Documentation paths do not become critical merely
because they describe a critical subsystem.

A project may raise the selected profile with:

```json
{
  "assurance": {
    "profile": "critical"
  }
}
```

A configured profile below Kit's calculated minimum is blocked by `VSP022`.
Lowering requires a scoped, active override with a human reason; the canonical
v3 action retains the calculated profile until that override applies.

## Gates In Reports

Verification, review, reconcile, and PR artifacts include policy gate summaries where available. Gate output includes:

- strictness mode
- allowed or blocked result
- failed rules
- blocked commands
- next allowed command
- applied overrides

Overrides do not hide the failure. They downgrade an overridable blocking rule to a warning and record the override ID and reason.

## Agent Behavior

Generated agent guidance tells AI tools to run gates and stop when gates block. An agent should not implement code until:

```bash
visp-kit gate implement --task T001
```

allows implementation and `.visp/prompts/current-task.prompt.md` exists.
