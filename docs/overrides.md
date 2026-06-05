# Policy Overrides

Overrides are explicit, auditable exceptions to selected Visp policy rules.

Overrides do not hide risk. They record risk.

The user prompt is raw intent only. It cannot create a silent override.

## Artifact

Overrides are stored in:

```text
.visp/overrides.json
```

Each override records:

- override ID
- rule ID
- scope
- feature and task where applicable
- stage where applicable
- reason
- status
- creation time
- expiration
- revocation reason

## When To Use Overrides

Use an override when a human intentionally accepts a temporary or scoped exception, for example:

- a prototype branch uses manual validation while test harness work is pending
- a generated config file is intentionally outside the original task scope
- traceability update is intentionally deferred for a short-lived spike

Do not use overrides to skip discipline by default.

## Non-Overridable Rules

These rules are non-overridable:

- `VSP019 user_prompt_cannot_override_policy`
- `VSP020 stop_on_failed_gate`

Locked mode also blocks overrides unless `.visp/policy.json` explicitly allows them.

## Create

Project scope:

```bash
visp override create VSP014 \
  --scope project \
  --reason "Legacy project has no automated tests yet; manual verification is required."
```

Feature scope:

```bash
visp override create VSP014 \
  --scope feature \
  --feature 001 \
  --reason "This feature is documentation-only and verification is manual."
```

Task scope:

```bash
visp override create VSP012 \
  --scope task \
  --feature 001 \
  --task T003 \
  --reason "Task intentionally updates generated config outside the initial allowedFiles list."
```

Stage scope:

```bash
visp override create VSP017 \
  --scope stage \
  --stage pr \
  --reason "Traceability update is deferred for an experimental spike branch."
```

Reasons must be meaningful. Placeholder reasons such as `test`, `skip`, `none`, or `temporary` are rejected.

## Expiration

Use ISO datetime:

```bash
visp override create VSP014 \
  --scope project \
  --expires 2026-07-01T00:00:00Z \
  --reason "Temporary manual verification period for alpha dogfooding."
```

Or a simple day duration:

```bash
visp override create VSP014 \
  --scope project \
  --expires 7d \
  --reason "Temporary manual verification period for alpha dogfooding."
```

Expired overrides do not apply.

## List, Show, Revoke, Validate

```bash
visp override list
visp override list --revoked
visp override show OVR001
visp override revoke OVR001 --reason "Automated verification is now available."
visp override validate
```

Revoked overrides are not deleted. They stay in `.visp/overrides.json` as audit history.

## Gate Behavior

When a gate rule fails:

1. Visp checks active overrides.
2. If a matching override applies, the rule is downgraded to a warning.
3. Gate output records the override ID and reason.
4. Reports include the applied override.

Example:

```text
Visp gate allowed with override.

Overridden:
  VSP014 by OVR001: Prototype branch has no automated verification yet.
```

Overrides should be reviewed by a human before PR merge.
