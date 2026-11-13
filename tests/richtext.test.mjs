import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRich, parseRich, safeHref, plainText } from "../src/lib/voting/richtext.mjs";

test("keeps the six supported formats", () => {
  const html = '<div><b>太字</b>と<i>斜体</i>と<u>下線</u></div><div><a href="https://matsufes.info">公式</a></div>' +
    "<ol><li>一</li><li>二</li></ol><ul><li>A</li></ul>";
  assert.equal(sanitizeRich(html), html.replace("https://matsufes.info", "https://matsufes.info/"));
  assert.equal(sanitizeRich("<strong>a</strong><em>b</em>"), "<b>a</b><i>b</i>");
});

test("drops anything that could run code", () => {
  assert.equal(sanitizeRich('<b onclick="x()">a</b>'), "<b>a</b>");
  assert.equal(sanitizeRich('<script>alert(1)</script><b>ok</b>'), "<b>ok</b>");
  assert.equal(sanitizeRich('<img src=x onerror=alert(1)><b>ok</b>'), "<b>ok</b>");
  assert.equal(sanitizeRich('<a href="javascript:alert(1)">x</a><br>'), "x<br>");
  assert.equal(sanitizeRich('<a href="data:text/html,hi">x</a><br>'), "x<br>");
  assert.equal(sanitizeRich('<span style="color:red">赤</span><br>'), "赤<br>");
  assert.equal(sanitizeRich('<b>&lt;script&gt;</b>'), "<b>&lt;script&gt;</b>");
  assert.equal(sanitizeRich('<a href="https://x.example/?a=1&amp;b=&quot;2">q</a>'), '<a href="https://x.example/?a=1&amp;b=%222">q</a>');
});

test("plain text keeps its line breaks", () => {
  assert.deepEqual(parseRich("1行目\n2行目"), [{ t: "text", v: "1行目" }, { t: "br" }, { t: "text", v: "2行目" }]);
  assert.equal(sanitizeRich("a < b\nc"), "a &lt; b<br>c");
  assert.equal(sanitizeRich("<div><br></div>"), "");
  assert.equal(plainText(parseRich("<ul><li>A</li><li>B</li></ul>")).trim(), "A\nB");
});

test("links accept web and mail addresses only", () => {
  assert.equal(safeHref("matsufes.info"), "https://matsufes.info/");
  assert.equal(safeHref("mailto:a@example.com"), "mailto:a@example.com");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("vbscript:x"), null);
  // In-page links to sections or IDs.
  assert.equal(safeHref("#block_abc-1"), "#block_abc-1");
  assert.equal(safeHref("#a b"), null);
  assert.equal(safeHref("#<x>"), null);
  assert.equal(sanitizeRich('<a href="#food">模擬店へ</a>'), '<a href="#food">模擬店へ</a>');
});
