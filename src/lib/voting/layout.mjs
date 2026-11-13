import { validId } from "./logic.mjs";
import { sanitizeRich } from "./richtext.mjs";

export const LAYOUT_KINDS = new Set(["heading", "text", "poll", "action"]);

export function validateBlock(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !LAYOUT_KINDS.has(input.kind)) return null;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  // Body text is rich text (see richtext.mjs) and is cleaned before it is stored.
  const body = typeof input.body === "string" && input.body.length <= 20000 ? sanitizeRich(input.body) : "";
  if (title.length > 120 || body.length > 8000) return null;
  const ref = input.kind === "poll" || input.kind === "action"
    ? input.referenceId : null;
  if (ref !== null && !validId(ref)) return null;
  if (input.kind === "heading" && !title) return null;
  if (input.kind === "text" && !body && !title) return null;
  if (typeof input.isPublished !== "boolean") return null;
  return {
    kind: input.kind,
    referenceId: ref,
    title: ref === null ? title : "",
    body: ref === null ? body : "",
    isPublished: input.isPublished ? 1 : 0,
  };
}

// All published blocks are ordered. Unreferenced polls and actions are appended
// so adding a new poll cannot silently make it invisible.
export function composeLayout(blocks, polls, actions) {
  const pollMap = new Map(polls.map(p => [p.id, p]));
  const actionMap = new Map(actions.map(a => [a.id, a]));
  const referencedPolls = new Set();
  const referencedActions = new Set();
  const layout = [];
  for (const block of blocks) {
    if (block.kind === "poll") {
      referencedPolls.add(block.reference_id);
      if (block.is_published === 1 && pollMap.has(block.reference_id))
        layout.push({ id: block.id, kind: "poll", pollId: block.reference_id });
    } else if (block.kind === "action") {
      referencedActions.add(block.reference_id);
      if (block.is_published === 1 && actionMap.has(block.reference_id))
        layout.push({ id: block.id, kind: "action", actionId: block.reference_id });
    } else if (block.is_published === 1 && (block.kind === "heading" || block.kind === "text")) {
      layout.push({ id: block.id, kind: block.kind, title: block.title, body: block.body });
    }
  }
  for (const poll of polls) {
    if (!referencedPolls.has(poll.id)) layout.push({ id: "poll_" + poll.id, kind: "poll", pollId: poll.id });
  }
  for (const action of actions) {
    if (!referencedActions.has(action.id)) layout.push({ id: "action_" + action.id, kind: "action", actionId: action.id });
  }
  return layout;
}
