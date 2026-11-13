import test from "node:test";
import assert from "node:assert/strict";
import { customGoogleFont, validFont, fontStylesheet } from "../src/lib/voting/fonts.mjs";
import { SETTING_RULES, cleanSettings } from "../src/lib/voting/settings.mjs";

test("custom Google Fonts use safe family names and Google Stylesheets", () => {
  assert.equal(validFont("noto-sans"), true);
  assert.equal(validFont("google:Roboto"), true);
  assert.equal(validFont("google:Noto Sans JP"), true);
  assert.equal(customGoogleFont("google:"), false);
  for (const invalid of ["google:../../bad", "google:Roboto&text=bad", "google:Roboto;script", "google:Roboto ", "evil"]) {
    assert.equal(customGoogleFont(invalid), false);
  }
  assert.match(fontStylesheet(["google:Roboto"]), /family=Roboto/);
  assert.match(fontStylesheet(["google:Noto Sans JP"]), /family=Noto\+Sans\+JP/);
  assert.equal(fontStylesheet(["system"]), null);
});

test("only ICO and JPEG data URLs are accepted as site assets", () => {
  assert.equal(SETTING_RULES.favicon("data:image/x-icon;base64,AA=="), true);
  assert.equal(SETTING_RULES.favicon("data:image/png;base64,AA=="), false);
  assert.equal(SETTING_RULES.ogp("data:image/jpeg;base64,AA=="), true);
  assert.equal(SETTING_RULES.ogp("https://example.com/image.jpg"), false);
  assert.equal(SETTING_RULES.ogp("data:image/svg+xml;base64,AA=="), false);
  assert.deepEqual(cleanSettings([
    { key: "favicon", value: "data:image/x-icon;base64,AA==" },
    { key: "ogp", value: "data:image/jpeg;base64,AA==" },
  ]), {
    favicon: "data:image/x-icon;base64,AA==",
    ogp: "data:image/jpeg;base64,AA==",
  });
});
