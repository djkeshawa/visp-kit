import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  canonicalJsonV1,
  createWorkflowActionId,
  workflowActionIdentityDomain
} from "../../../src/integration/canonical-json.js";

describe("canonical-json-v1", () => {
  it("sorts object keys by UTF-16 code units regardless of insertion order", () => {
    const astral = "\u{10000}";
    const privateUse = "\uE000";
    const left = {
      nested: { [privateUse]: 4, [astral]: 3, a: 2, Z: 1 },
      2: "two",
      10: "ten"
    };
    const right = {
      10: "ten",
      2: "two",
      nested: { Z: 1, a: 2, [astral]: 3, [privateUse]: 4 }
    };
    const expected = `{"10":"ten","2":"two","nested":{"Z":1,"a":2,"${astral}":3,"${privateUse}":4}}`;

    expect(canonicalJsonV1(left)).toBe(expected);
    expect(canonicalJsonV1(right)).toBe(expected);
  });

  it("preserves array order and ECMAScript JSON primitive encoding", () => {
    const value = {
      values: [
        null,
        true,
        false,
        -0,
        1.5,
        1e21,
        'quote" slash/ backslash\\ line\n nul\u0000',
        "é",
        "e\u0301",
        "😀",
        "\uE000"
      ]
    };

    expect(canonicalJsonV1(value)).toBe(
      '{"values":[null,true,false,0,1.5,1e+21,"quote\\" slash/ backslash\\\\ line\\n nul\\u0000","é","é","😀",""]}'
    );
    expect(canonicalJsonV1(["z", "a"])).toBe('["z","a"]');
    expect(canonicalJsonV1("é")).not.toBe(canonicalJsonV1("e\u0301"));
    expect(Buffer.from(canonicalJsonV1({ value: "é😀" }), "utf8").toString("hex")).toBe(
      "7b2276616c7565223a22c3a9f09f9880227d"
    );
  });

  it("accepts repeated references and null-prototype JSON records", () => {
    const shared = { value: 1 };
    const record = Object.create(null) as Record<string, unknown>;
    record.b = shared;
    record.a = shared;

    expect(canonicalJsonV1(record)).toBe('{"a":{"value":1},"b":{"value":1}}');
  });

  it("rejects values outside the strict JSON data model", () => {
    const sparse = new Array(2);
    const directCycle: Record<string, unknown> = {};
    directCycle.self = directCycle;
    const indirectLeft: Record<string, unknown> = {};
    const indirectRight: Record<string, unknown> = { left: indirectLeft };
    indirectLeft.right = indirectRight;
    const symbolKeyed = { value: 1 };
    Object.defineProperty(symbolKeyed, Symbol("hidden"), { value: 2, enumerable: true });
    const accessor = {};
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    const nonEnumerable = { value: 1 };
    Object.defineProperty(nonEnumerable, "hidden", { value: 2, enumerable: false });
    const customArray = [1, 2] as number[] & { extra?: string };
    customArray.extra = "unsupported";
    const proxyArray = new Proxy([1, 2], {});
    const proxyRecord = new Proxy({ value: 1 }, {});
    class RecordLike {
      readonly value = 1;
    }

    const invalidValues: unknown[] = [
      undefined,
      { value: undefined },
      () => undefined,
      Symbol("value"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      sparse,
      directCycle,
      indirectLeft,
      symbolKeyed,
      accessor,
      nonEnumerable,
      customArray,
      proxyArray,
      proxyRecord,
      new Date("2026-01-01T00:00:00.000Z"),
      new Map([["value", 1]]),
      new Set([1]),
      new Number(1),
      new RecordLike()
    ];

    for (const invalid of invalidValues) {
      expect(() => canonicalJsonV1(invalid)).toThrowError(TypeError);
      expect(() => canonicalJsonV1(invalid)).toThrowError(/^canonical-json-v1:/u);
    }
  });

  it("uses the accepted domain separator and golden action identity", () => {
    const action = {
      canonicalVersion: "1.0",
      goal: "Pin notes",
      nextCommand: "pnpm test",
      phase: "implement",
      task: { id: "T001", title: "Implement pinning" },
      verdict: "ready"
    };

    expect(Buffer.from(workflowActionIdentityDomain, "utf8").toString("hex")).toBe(
      "766973702e776f726b666c6f772d616374696f6e0063616e6f6e6963616c2d312e3000"
    );
    expect(canonicalJsonV1(action)).toBe(
      '{"canonicalVersion":"1.0","goal":"Pin notes","nextCommand":"pnpm test","phase":"implement","task":{"id":"T001","title":"Implement pinning"},"verdict":"ready"}'
    );
    expect(createWorkflowActionId(action)).toBe(
      "sha256:6fc1742190e7f1bb41a13511e5f1b7f570e8e00fcf08885cfe4c1183ab496fe0"
    );
  });

  it("keeps wire selection and pretty formatting outside action identity", () => {
    const compact = '{"phase":"implement","taskId":"T001"}';
    const pretty = '{\n  "taskId": "T001",\n  "phase": "implement"\n}';
    const compactAction = JSON.parse(compact) as Record<string, unknown>;
    const prettyAction = JSON.parse(pretty) as Record<string, unknown>;

    const presentations = [
      { protocolVersion: "2.0", payload: compactAction },
      { protocolVersion: "3.0", payload: prettyAction }
    ];
    const identities = presentations.map(({ payload }) => createWorkflowActionId(payload));

    expect(createWorkflowActionId(prettyAction)).toBe(createWorkflowActionId(compactAction));
    expect(new Set(identities).size).toBe(1);
    expect(createWorkflowActionId({ ...compactAction, semanticChange: true })).not.toBe(
      createWorkflowActionId(compactAction)
    );
  });
});
