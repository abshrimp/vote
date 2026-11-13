// A deliberately tiny rich-text format for descriptions: bold, italic, underline,
// links, numbered and bulleted lists, and line breaks. Stored as a whitelisted HTML
// subset; everything else is dropped (its text is kept). Rendering builds React
// elements from the parsed tree, never raw HTML, so stored text cannot run code.
// Plain text written before rich text existed stays valid: newlines become breaks.

const INLINE = { b: "b", strong: "b", i: "i", em: "i", u: "u", a: "a" };
const BLOCK = { p: "p", div: "p", ol: "ol", ul: "ul", li: "li" };
const DROP_WITH_CONTENT = new Set(["script", "style", "template", "iframe", "object", "noscript", "head", "title"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, name) => {
  if (name[0] === "#") {
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  }
  return ENTITIES[name.toLowerCase()] ?? all;
});
const escapeText = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = text => escapeText(text).replace(/"/g, "&quot;");

/** In-page links to a section or a department/candidate ID, e.g. "#food". */
export const INTERNAL_LINK = /^#[A-Za-z0-9_-]{1,64}$/;

/** Web, mail and in-page (#ID) links only; anything else (javascript:, data:, ...) is rejected. */
export function safeHref(raw) {
  if (typeof raw !== "string") return null;
  let href = raw.trim();
  if (!href) return null;
  if (href.startsWith("#")) return INTERNAL_LINK.test(href) ? href : null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) href = "https://" + href.replace(/^\/+/, "");
  try {
    const url = new URL(href);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}

const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<!--[\s\S]*?-->/g;
const KNOWN = /<\s*\/?\s*(b|strong|i|em|u|a|p|div|ol|ul|li|br)\b[^>]*>/i;

/** Parses stored text into a tree of { t, c } nodes ("text" nodes carry v). */
export function parseRich(input) {
  const source = typeof input === "string" ? input : "";
  const root = { t: "root", c: [] };
  if (!KNOWN.test(source)) {
    // Legacy plain text.
    source.split("\n").forEach((line, i) => {
      if (i) root.c.push({ t: "br" });
      if (line) root.c.push({ t: "text", v: line });
    });
    return root.c;
  }
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const pushText = text => {
    const value = decode(text).replace(/[\r\n\t]+/g, " ");
    if (value) top().c.push({ t: "text", v: value });
  };
  let last = 0;
  let skipUntil = null;
  for (const match of source.matchAll(TAG)) {
    const [whole, closing, rawName = "", attrs = ""] = match;
    const name = rawName.toLowerCase();
    if (skipUntil) {
      if (closing && name === skipUntil) { skipUntil = null; last = match.index + whole.length; }
      continue;
    }
    pushText(source.slice(last, match.index));
    last = match.index + whole.length;
    if (!rawName) continue; // comment
    if (DROP_WITH_CONTENT.has(name)) { if (!closing && !/\/\s*$/.test(attrs)) skipUntil = name; continue; }
    if (name === "br") { top().c.push({ t: "br" }); continue; }
    const type = INLINE[name] ?? BLOCK[name];
    if (!type) continue; // unknown tag: keep its text, drop the tag
    if (closing) {
      const index = stack.map(n => n.t).lastIndexOf(type);
      if (index > 0) stack.length = index;
      continue;
    }
    const node = { t: type, c: [] };
    if (type === "a") {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      node.href = safeHref(decode(href?.[2] ?? href?.[3] ?? href?.[4] ?? ""));
    }
    // A list item outside a list becomes a plain line.
    if (type === "li" && !stack.some(n => n.t === "ol" || n.t === "ul")) node.t = "p";
    top().c.push(node);
    stack.push(node);
  }
  if (!skipUntil) pushText(source.slice(last));
  return prune(root.c);
}

function prune(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.t === "text" || node.t === "br") { out.push(node); continue; }
    node.c = prune(node.c);
    if (node.t === "a" && !node.href) { out.push(...node.c); continue; } // unsafe link: keep the text
    if (!node.c.length && node.t !== "p") continue;
    out.push(node);
  }
  return out;
}

/** Tree → the stored HTML subset. */
export function serializeRich(nodes) {
  return nodes.map(node => {
    if (node.t === "text") return escapeText(node.v);
    if (node.t === "br") return "<br>";
    const inner = serializeRich(node.c);
    const tag = node.t === "p" ? "div" : node.t;
    return node.t === "a" ? '<a href="' + escapeAttr(node.href) + '">' + inner + "</a>" : "<" + tag + ">" + inner + "</" + tag + ">";
  }).join("");
}

/** Cleans editor output for storage. Returns "" for an effectively empty field. */
export function sanitizeRich(input) {
  const nodes = parseRich(input);
  return plainText(nodes).trim() ? serializeRich(nodes) : "";
}

/** Text content (for length checks and plain-text summaries). */
export function plainText(nodes) {
  return nodes.map(node => node.t === "text" ? node.v : node.t === "br" ? "\n"
    : (node.t === "p" || node.t === "li" ? "\n" : "") + plainText(node.c)).join("");
}
