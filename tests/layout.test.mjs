import test from "node:test";
import assert from "node:assert/strict";
import { validateBlock, composeLayout } from "../src/lib/voting/layout.mjs";

test("validates safe layout blocks and rejects unknown kinds", () => {
  assert.deepEqual(validateBlock({
    kind:"heading", title:"受付案内", body:"投票してください", isPublished:true,
  }), {kind:"heading",referenceId:null,title:"受付案内",body:"投票してください",isPublished:1});
  assert.equal(validateBlock({kind:"script",title:"x",isPublished:true}), null);
  assert.equal(validateBlock({kind:"poll",referenceId:"invalid/id",isPublished:true}), null);
  assert.equal(validateBlock({kind:"heading",title:"",isPublished:true}), null);
  assert.equal(validateBlock({kind:"text",body:"",title:"",isPublished:true}), null);
  assert.equal(validateBlock({kind:"poll",referenceId:"poll1",isPublished:false})?.isPublished,0);
});

test("preserves configured order, suppresses hidden referenced sections, appends new sections", () => {
  const polls=[{id:"p1"},{id:"p2"}],actions=[{id:"a1"},{id:"a2"}];
  const blocks=[
    {id:"h1",kind:"heading",title:"好きな出店",body:"",is_published:1},
    {id:"a",kind:"action",reference_id:"a1",is_published:1},
    {id:"p",kind:"poll",reference_id:"p1",is_published:0},
    {id:"t",kind:"text",title:"",body:"説明文",is_published:1},
  ];
  const output=composeLayout(blocks,polls,actions);
  assert.deepEqual(output.map(x=>x.id),["h1","a","t","poll_p2","action_a2"]);
  assert.equal(output[1].actionId,"a1");
  assert.equal(output[2].body,"説明文");
});

test("unplaced polls and actions are appended to the page", () => {
  const output=composeLayout([], [{id:"poll"}],[{id:"action"}]);
  assert.deepEqual(output.map(x=>x.kind),["poll","action"]);
});
