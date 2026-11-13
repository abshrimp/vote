/**
 * Move the selected candidates as one group to a slot in the remaining list.
 * The target index refers to the list after selected IDs are removed.
 * @param {string[]} order
 * @param {string[]} selected
 * @param {number} targetIndex
 * @returns {string[]}
 */
export function insertCandidates(order, selected, targetIndex) {
  const chosen = new Set(selected);
  const moving = order.filter(id => chosen.has(id));
  if (!moving.length) return [...order];
  const remaining = order.filter(id => !chosen.has(id));
  const index = Math.max(0, Math.min(remaining.length, Math.trunc(targetIndex)));
  return [...remaining.slice(0, index), ...moving, ...remaining.slice(index)];
}

/**
 * Move every selected candidate one place up/down without changing selected
 * rows' relative order (even when they are not adjacent).
 * @param {string[]} order
 * @param {string[]} selected
 * @param {-1 | 1} direction
 * @returns {string[]}
 */
export function stepCandidates(order, selected, direction) {
  const chosen = new Set(selected);
  const next = [...order];
  if (direction === -1) {
    for (let i = 1; i < next.length; i++) {
      if (chosen.has(next[i]) && !chosen.has(next[i - 1])) {
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
      }
    }
  } else if (direction === 1) {
    for (let i = next.length - 2; i >= 0; i--) {
      if (chosen.has(next[i]) && !chosen.has(next[i + 1])) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  }
  return next;
}
