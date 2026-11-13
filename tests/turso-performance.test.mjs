import test from "node:test";
import assert from "node:assert/strict";
import { readBatch } from "../src/lib/voting/turso.mjs";
import { createTtlCache } from "../src/lib/voting/public-snapshot.mjs";
import { visitorFacts, evaluateCondition } from "../src/lib/voting/conditions.mjs";

test("Hrana read batch handles multiple independent SELECT results in one HTTP request", async () => {
  let calls = 0;
  const rows = [{ cols: [{name:"id"}], rows: [[{type:"text",value:"a"}]], affected_row_count: 0 },
    { cols: [{name:"count"}], rows: [[{type:"integer",value:"42"}]], affected_row_count: 0 }];
  const result = await readBatch([
    { sql: "SELECT id FROM polls" },
    { sql: "SELECT COUNT(*) AS count FROM votes WHERE voter_hash=?", args: ["hashed"] },
  ], { url:"libsql://test-org.turso.io", token:"demo", fetcher: async (_url, options) => {
    calls++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.requests.length, 2);
    assert.equal(sent.requests[0].type, "batch");
    assert.equal(sent.requests[0].batch.steps.length, 2);
    assert.equal(sent.requests[0].batch.steps[1].stmt.args[0].value, "hashed");
    assert.equal(sent.requests[0].batch.steps[1].stmt.want_rows, true);
    return new Response(JSON.stringify({results:[{type:"ok",response:{
      type:"batch",result:{step_results:rows,step_errors:[null,null]}
    }}]}));
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result.map(x=>x.rows), [[{id:"a"}],[{count:42}]]);
  await assert.rejects(() => readBatch([{sql:"DELETE FROM votes"}], {
    url:"libsql://test-org.turso.io", token:"demo", fetcher: async()=>{throw Error("must not execute");}
  }), /Only read-only/);
});

test("Hrana read batch rejects partial results rather than silently losing data", async () => {
  await assert.rejects(() => readBatch([{sql:"SELECT 1"},{sql:"SELECT 2"}], {
    url:"libsql://test-org.turso.io", token:"demo", fetcher: async()=>new Response(JSON.stringify({
      results:[{type:"ok",response:{type:"batch",result:{
        step_results:[{cols:[],rows:[]}],step_errors:[null,{message:"bad query"}]
      }}}]
    }))
  }),/batch read failed/);
});

test("public snapshot cache coalesces simultaneous calls, expires and never retains failures", async () => {
  let time = 0, loads = 0;
  const cache = createTtlCache(async()=>({generation:++loads}), undefined, ()=>time);
  const results = await Promise.all([cache(),cache(),cache()]);
  assert.equal(loads,1);
  assert.equal(results[0], results[1]);
  time=29999; assert.equal((await cache()).generation,1);
  time=30000; assert.equal((await cache()).generation,2);
  let failures=0;
  const unstable=createTtlCache(async()=>{if(++failures===1)throw Error("temporary");return "ok";});
  await assert.rejects(unstable(),/temporary/);
  assert.equal(await unstable(),"ok");
  assert.equal(failures,2);
});

test("in-memory visitor facts preserve exact nested eligibility semantics", () => {
  const facts=visitorFacts([{poll_id:"a"},{poll_id:"a"},{poll_id:"b"}],
    [{action_id:"gift",status:"used"}]);
  assert.equal(facts.totalVotes,3);
  assert.equal(facts.votedPolls.size,2);
  assert.equal(evaluateCondition({type:"all",rules:[
    {type:"min_distinct_polls",count:2},
    {type:"any",rules:[{type:"voted_poll",pollId:"missing"},{type:"min_total_votes",count:3}]},
    {type:"action_used",actionId:"gift"}
  ]},facts),true);
  assert.equal(evaluateCondition({type:"action_used",actionId:"pending"},facts),false);
  assert.equal(evaluateCondition({type:"action_used",actionId:"gift"},facts),true);
  assert.throws(()=>evaluateCondition({type:"action_claimed",actionId:"gift"},facts),/Invalid condition/);
  assert.throws(()=>evaluateCondition({type:"arbitrary"},facts),/Invalid condition/);
});

test("single page response derives conditional action state without extra vote reads", async () => {
  const { visitorActions } = await import("../src/lib/voting/visitor-actions.mjs");
  const definitions = [
    { id: "gift", title: "Gift", kind: "claim", description: "Redeem at desk",
      config_json: '{"claimLabel":"Redeem"}',
      condition_json: JSON.stringify({ type: "min_total_votes", count: 2 }) },
    { id: "link", title: "Hidden link", kind: "link", description: "Private",
      config_json: '{"url":"https://example.org/private","buttonLabel":"Open"}',
      condition_json: JSON.stringify({ type: "voted_poll", pollId: "required" }) },
  ];
  const votes = [{ poll_id: "a", candidate_id: "x", is_official: 1 },
    { poll_id: "b", candidate_id: "y", is_official: 0 }];
  const actions = visitorActions(definitions, votes, []);
  assert.equal(actions[0].eligible, true);
  assert.equal(actions[1].eligible, false);
  assert.equal(actions[1].config.url, undefined);
  assert.equal(actions[1].description, "利用条件を満たすと内容を確認できます。");
  assert.equal(visitorActions([], votes, []).length, 0);
  const used = visitorActions(definitions, [], [{ action_id: "gift", redeemed_at: "2026-11-13T00:00:00Z" }]);
  assert.equal(used[0].status, "used");
  assert.equal(used[0].eligible, true);
});
