import test from "node:test";
import assert from "node:assert/strict";
import { sortResultCandidates } from "../src/lib/voting/result-sort.mjs";

const candidates = [
  { id: "a", votes: 2 },
  { id: "b", votes: 8 },
  { id: "c", votes: 0 },
  { id: "d", votes: 8 },
  { id: "e", votes: 2 },
];

test("result sorting supports original, descending, and ascending vote totals", () => {
  assert.deepEqual(sortResultCandidates(candidates, "original").map(c => c.id),
    ["a", "b", "c", "d", "e"]);
  assert.deepEqual(sortResultCandidates(candidates, "votes-desc").map(c => c.id),
    ["b", "d", "a", "e", "c"]);
  assert.deepEqual(sortResultCandidates(candidates, "votes-asc").map(c => c.id),
    ["c", "a", "e", "b", "d"]);
});

test("sorting does not mutate the voting page's candidate order or data", () => {
  const before = structuredClone(candidates);
  const sorted = sortResultCandidates(candidates, "votes-desc");
  assert.notStrictEqual(sorted, candidates);
  assert.deepEqual(candidates, before);
});

test("sorting handles empty and tied results deterministically", () => {
  assert.deepEqual(sortResultCandidates([], "votes-desc"), []);
  const ties = [{ id: "z", votes: 0 }, { id: "y", votes: 0 }];
  assert.deepEqual(sortResultCandidates(ties, "votes-asc"), ties);
});
