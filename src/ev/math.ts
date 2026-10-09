export function americanToDecimal(american: string): number {
  const n = parseInt(american, 10);
  if (isNaN(n)) return 0;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

export function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) return `+${Math.round((decimal - 1) * 100)}`;
  return `${Math.round(-100 / (decimal - 1))}`;
}

export function decimalToImpliedProb(decimal: number): number {
  if (decimal <= 1) return 0;
  return 1 / decimal;
}

export function impliedProbToDecimal(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  return 1 / prob;
}

export function removeVig(probOver: number, probUnder: number): { over: number; under: number } {
  const total = probOver + probUnder;
  if (total === 0) return { over: 0, under: 0 };
  return { over: probOver / total, under: probUnder / total };
}

export function noVigFairOdds(decimalOver: number, decimalUnder: number): { over: number; under: number } {
  const probOver = decimalToImpliedProb(decimalOver);
  const probUnder = decimalToImpliedProb(decimalUnder);
  return removeVig(probOver, probUnder);
}

export function kellyCriterion(winProb: number, decimalOdds: number, fraction = 1.0): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const kelly = (winProb * b - (1 - winProb)) / b;
  return Math.max(0, kelly * fraction);
}

export function expectedValue(winProb: number, decimalOdds: number): number {
  return winProb * (decimalOdds - 1) - (1 - winProb);
}

export function evPercent(winProb: number, decimalOdds: number): number {
  return expectedValue(winProb, decimalOdds) * 100;
}
