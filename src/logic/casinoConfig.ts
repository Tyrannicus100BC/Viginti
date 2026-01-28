
export function calculateTargetScore(round: number): number {
  // Formula: Start at 500, increase by 300 each round
  const score = 500 + (round - 1) * 300;
  return score;
}
