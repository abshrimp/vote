import test from "node:test";
import assert from "node:assert/strict";
import { cleanSettings, readSettings, SETTING_RULES } from "../src/lib/voting/settings.mjs";

test("form settings accept only known keys and valid colours", async () => {
  assert.deepEqual(cleanSettings([{ key: "themeColor", value: "#A8742F" }, { key: "x", value: "y" }]), { themeColor: "#a8742f" });
  assert.deepEqual(cleanSettings([{ key: "themeColor", value: "red" }]), {});
  assert.equal(SETTING_RULES.themeColor("#4a743d"), true);
  assert.deepEqual(cleanSettings([{ key: "accentColor", value: "#D0A266" }, { key: "logo", value: "data:image/svg+xml;base64,PHN2Zy8+" }]),
    { accentColor: "#d0a266", logo: "data:image/svg+xml;base64,PHN2Zy8+" });
  assert.equal(SETTING_RULES.logo("data:text/html;base64,PHNjcmlwdD4="), false);
  assert.equal(SETTING_RULES.logo("javascript:alert(1)"), false);
  assert.equal(SETTING_RULES.logo(""), true);
  assert.deepEqual(cleanSettings([{ key: "logo", value: "" }]), {});
  assert.deepEqual(cleanSettings([{ key: "headingFont", value: "zen-maru" }, { key: "bodyFont", value: "comic-sans" }]), { headingFont: "zen-maru" });
  assert.equal(SETTING_RULES.organizerName("イベント実行委員会"), true);
  assert.equal(SETTING_RULES.organizerName("x".repeat(121)), false);
  assert.equal(SETTING_RULES.organizerName("bad\nname"), false);
  assert.equal(SETTING_RULES.officialUrl("https://example.org/"), true);
  assert.equal(SETTING_RULES.officialUrl("javascript:alert(1)"), false);
  assert.equal(SETTING_RULES.officialUrl("https://user:pass@example.org"), false);
  assert.equal(SETTING_RULES.officialUrl("https://example.org/\n"), false);
  assert.equal(SETTING_RULES.contactEmail("staff@example.org"), true);
  assert.equal(SETTING_RULES.contactEmail("invalid"), false);
  assert.deepEqual(cleanSettings([
    { key: "organizerName", value: "例示イベント運営者" },
    { key: "officialUrl", value: "https://Example.org/official" },
    { key: "contactEmail", value: "Staff@Example.org" },
  ]), {
    organizerName: "例示イベント運営者",
    officialUrl: "https://Example.org/official",
    contactEmail: "Staff@Example.org",
  });
  assert.deepEqual(cleanSettings([{ key: "contactEmail", value: "invalid" }]), {});
  await assert.rejects(() => readSettings(async () => { throw Error("no such table: form_settings"); }), /no such table/);
});

test("reset clears results and duplicate-vote data but keeps the form", async () => {
  const { resetStatements, RESET_PHRASE } = await import("../src/lib/voting/reset.mjs");
  const tables = resetStatements().map(s => s.sql.replace("DELETE FROM ", ""));
  assert.deepEqual(tables.sort(), ["action_claims", "action_totals", "candidate_totals", "vote_request_limits", "votes"]);
  assert.ok(!tables.includes("polls") && !tables.includes("candidates") && !tables.includes("form_settings"));
  assert.equal(RESET_PHRASE, "リセット");
});

test("font choices map to one Google Fonts request and nothing for the default", async () => {
  const { fontStylesheet, FONTS } = await import("../src/lib/voting/fonts.mjs");
  assert.equal(fontStylesheet(["system"]), null);
  assert.equal(fontStylesheet(["zen-maru", "zen-maru", "noto-serif"]),
    "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&family=Noto+Serif+JP:wght@400;500;700&display=swap");
  assert.ok(Object.values(FONTS).every(font => font.family === null || /^"[^"<>]+"$/.test(font.family)));
});
