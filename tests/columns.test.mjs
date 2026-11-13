import test from "node:test";
import assert from "node:assert/strict";
import { validColumns, validCells, validFontSize, parseColumns, parseCells, serializeColumns, parseNameStyle, validStyle } from "../src/lib/voting/columns.mjs";
test("candidate custom columns validate keys, sizes, and cells", () => {
  const cols = [{ key: "group", label: "所属", fontSize: 14 }];
  assert.equal(validColumns(cols), true);
  assert.equal(validColumns([...cols, ...cols]), false);
  assert.equal(validColumns([{ key: "name", label: "重複", fontSize: 14 }]), false);
  assert.equal(validColumns([{ key: "x", label: "X", fontSize: 99 }]), false);
  assert.equal(validFontSize(16), true);
  assert.equal(validFontSize(9), false);
  assert.equal(validCells({ group: "展示室A" }, cols), true);
  assert.equal(validCells({ unknown: "A" }, cols), false);
  assert.deepEqual(parseColumns(JSON.stringify(cols)), cols);
  assert.deepEqual(parseCells('{"group":"展示室A","unused":"discard"}', cols), { group: "展示室A" });
});

test("published poll grouping carries configured columns and per-row values", async () => {
  const { groupPolls } = await import("../src/lib/voting/logic.mjs");
  const rows = [{
    poll_id:"p", poll_public_id:null, title:"投票", description:"",
    max_votes:1, name_font_size:20,
    columns_json:JSON.stringify([{key:"group",label:"所属",fontSize:12}]),
    candidate_id:"a", candidate_public_id:null, candidate_name:"候補A",
    candidate_extra_json:JSON.stringify({group:"展示室A"})
  }];
  const [poll] = groupPolls(rows);
  assert.equal(poll.nameFontSize,20);
  assert.equal(poll.columns[0].label,"所属");
  assert.equal(poll.candidates[0].extra.group,"展示室A");
});

test("text styles and the stored name style round-trip through columns_json", () => {
  const cols = [{ key: "place", label: "場所", fontSize: 14, color: "#4A743D", bold: true, hideLabel: true }];
  assert.equal(validColumns(cols), true);
  assert.equal(validColumns([{ ...cols[0], color: "red" }]), false);
  assert.equal(validColumns([{ ...cols[0], italic: "yes" }]), false);
  assert.equal(validStyle({ underline: true }), true);
  const raw = serializeColumns(cols, { color: "#60473E", italic: true, junk: 1 });
  assert.deepEqual(parseColumns(raw), [{ key: "place", label: "場所", fontSize: 14, color: "#4a743d", bold: true, hideLabel: true }]);
  assert.deepEqual(parseNameStyle(raw), { color: "#60473e", italic: true });
  assert.deepEqual(parseNameStyle(serializeColumns(cols)), {});
  assert.deepEqual(parseColumns(serializeColumns([], { bold: true })), []);
  // Legacy arrays without a name entry keep working.
  assert.deepEqual(parseColumns('[{"key":"g","label":"所属","fontSize":12}]'), [{ key: "g", label: "所属", fontSize: 12 }]);
});
