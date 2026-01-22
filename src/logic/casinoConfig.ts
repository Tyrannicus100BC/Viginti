
export function calculateTargetScore(round: number): number {
  let score: number;
  if (round === 1) {
    score = 1000;
  } else if (round === 2) {
    score = 1300;
  } else if (round === 3) {
    score = 1600;
  } else {
    // Casino 4+
    score = 1600 + (round - 3) * 300;
  }
  return score;
}
