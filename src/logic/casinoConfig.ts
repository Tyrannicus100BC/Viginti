
export function calculateTargetScore(round: number): number {
  let score: number;
  if (round === 1) {
    score = 75;
  } else if (round === 2) {
    score = 250;
  } else if (round === 3) {
    score = 800;
  } else {
    // Casino 4+
    score = 800 + (round - 3) * 500;
  }

  // Reduce by 1/2 and round to nearest multiple of 5
  return Math.round((score / 2) / 5) * 5;
}
