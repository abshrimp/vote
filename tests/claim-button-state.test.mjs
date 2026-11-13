import test from "node:test";
import assert from "node:assert/strict";
import { claimButtonState } from "../src/lib/voting/claim-button-state.mjs";

const ready = {
  eligible: true, hasToken: true, isSaving: false, siteKey: true,
  verificationError: false, claimLabel: "引き換える", lockedLabel: "条件未達成",
};

test("eligible claim displays loading until Turnstile returns a token", () => {
  assert.deepEqual(claimButtonState({ ...ready, hasToken: false }),
    { label: "本人確認中…", busy: true });
  assert.deepEqual(claimButtonState(ready),
    { label: "引き換える", busy: false });
});

test("unmet conditions do not display a verification spinner", () => {
  assert.deepEqual(claimButtonState({ ...ready, eligible: false, hasToken: false }),
    { label: "条件未達成", busy: false });
});

test("verification failure and missing configuration are not endless loading", () => {
  assert.deepEqual(claimButtonState({ ...ready, hasToken: false, verificationError: true }),
    { label: "本人確認を再試行してください", busy: false });
  assert.deepEqual(claimButtonState({ ...ready, hasToken: false, siteKey: false }),
    { label: "本人確認を利用できません", busy: false });
});

test("in-flight redemption takes precedence over verification status", () => {
  assert.deepEqual(claimButtonState({ ...ready, hasToken: false, isSaving: true }),
    { label: "処理中…", busy: true });
});
