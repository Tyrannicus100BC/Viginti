
export function calculateTargetScore(round: number): number {
  // Formula: Start at 400, increase by 200 each round (previously 500 + 300n)
  const score = 400 + (round - 1) * 200;
  return score;
}
