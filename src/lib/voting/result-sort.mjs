/**
 * Sort the result display without changing the candidate order stored for voting.
 * Equal vote totals retain the original position.
 * @template {{ votes: number }} T
 * @param {T[]} candidates
 * @param {"original" | "votes-desc" | "votes-asc"} order
 * @returns {T[]}
 */
export function sortResultCandidates(candidates, order) {
  if (order === "original") return [...candidates];
  const direction = order === "votes-desc" ? -1 : 1;
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      direction * (Number(a.candidate.votes) - Number(b.candidate.votes)) ||
      a.index - b.index
    )
    .map(({ candidate }) => candidate);
}
