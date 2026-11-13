import test from "node:test";
import assert from "node:assert/strict";
import { insertCandidates, stepCandidates } from "../src/lib/voting/candidate-order.mjs";

const order = ["a", "b", "c", "d", "e"];

test("single candidate can be dragged to both ends", () => {
  assert.deepEqual(insertCandidates(order, ["b"], 4), ["a", "c", "d", "e", "b"]);
  assert.deepEqual(insertCandidates(order, ["d"], 0), ["d", "a", "b", "c", "e"]);
});

test("multiple non-adjacent candidates move together in their original order", () => {
  assert.deepEqual(insertCandidates(order, ["d", "b"], 0), ["b", "d", "a", "c", "e"]);
  assert.deepEqual(insertCandidates(order, ["b", "d"], 3), ["a", "c", "e", "b", "d"]);
  assert.deepEqual(insertCandidates(order, ["missing"], 0), order);
  assert.deepEqual(insertCandidates(order, ["b"], 100), ["a", "c", "d", "e", "b"]);
});

test("arrow controls move selected candidates by one slot", () => {
  assert.deepEqual(stepCandidates(order, ["b", "d"], -1), ["b", "a", "d", "c", "e"]);
  assert.deepEqual(stepCandidates(order, ["b", "d"], 1), ["a", "c", "b", "e", "d"]);
  assert.deepEqual(stepCandidates(order, ["a", "b"], -1), order);
  assert.deepEqual(stepCandidates(order, ["d", "e"], 1), order);
});
