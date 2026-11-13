import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_CACHE_MAX_AGE_MS, readPersonalCache, writePersonalCache, clearPersonalCache,
} from "../src/lib/voting/personal-cache.mjs";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}
const personal = {
  selections: [{ poll_id: "p1", candidate_id: "c1", is_official: 1 }],
  actions: [{ id: "a1", title: "特典", description: "説明", kind: "claim", eligible: true,
    status: null, config: { claimLabel: "引き換える" } }],
};

test("saved personal state is reusable on repeat visits without a DB read", () => {
  const s = storage();
  writePersonalCache(s, "session-one", personal, 1000);
  assert.deepEqual(readPersonalCache(s, "session-one", 2000), personal);
});

test("cookie/session changes never reuse a previous visitor's local cache", () => {
  const s = storage();
  writePersonalCache(s, "session-one", personal, 1000);
  assert.equal(readPersonalCache(s, "session-two", 2000), null);
});

test("expired and future caches require a fresh personal read", () => {
  const s = storage();
  writePersonalCache(s, "session-one", personal, 1000);
  assert.equal(readPersonalCache(s, "session-one", 1000 + PERSONAL_CACHE_MAX_AGE_MS), null);
  assert.equal(readPersonalCache(s, "session-one", 999), null);
});

test("post-vote changes and claim updates overwrite the saved snapshot", () => {
  const s = storage();
  writePersonalCache(s, "session-one", personal, 1000);
  const next = { selections: [
    ...personal.selections, { poll_id: "p2", candidate_id: "c3", is_official: 0 },
  ], actions: [{ ...personal.actions[0], status: "used" }] };
  writePersonalCache(s, "session-one", next, 2000);
  assert.deepEqual(readPersonalCache(s, "session-one", 3000), next);
  clearPersonalCache(s);
  assert.equal(readPersonalCache(s, "session-one", 3000), null);
});

test("missing or malformed storage does not prevent voting", () => {
  const s = storage();
  assert.equal(readPersonalCache(s, "session-one"), null);
  writePersonalCache(s, "session-one", { selections: "bad", actions: [] });
  assert.equal(readPersonalCache(s, "session-one"), null);
  const broken = { getItem: () => { throw Error("denied"); },
    setItem: () => { throw Error("denied"); },
    removeItem: () => { throw Error("denied"); } };
  assert.equal(readPersonalCache(broken, "session-one"), null);
  assert.doesNotThrow(() => writePersonalCache(broken, "session-one", personal));
  assert.doesNotThrow(() => clearPersonalCache(broken));
});
