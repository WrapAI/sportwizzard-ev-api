export function americanToDecimal(american: string): number {
  const n = parseInt(american, 10);
  if (isNaN(n)) return 0;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

export function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) return `+${Math.round((decimal - 1) * 100)}`;
  if (decimal <= 1.0) return "0";
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

export type DevigMethod = "shin" | "power" | "multiplicative";

export interface DevigResult {
  over: number;
  under: number;
}

export function multiplicativeDevig(overDec: number, underDec: number): DevigResult {
  const pOver = 1 / overDec;
  const pUnder = 1 / underDec;
  const total = pOver + pUnder;
  if (total === 0) return { over: 0, under: 0 };
  return { over: pOver / total, under: pUnder / total };
}

export function powerDevig(overDec: number, underDec: number, power = 0.95): DevigResult {
  const pOver = Math.pow(1 / overDec, power);
  const pUnder = Math.pow(1 / underDec, power);
  const total = pOver + pUnder;
  if (total === 0) return { over: 0, under: 0 };
  return { over: pOver / total, under: pUnder / total };
}

export function shinDevig(overDec: number, underDec: number): DevigResult {
  const pOver = 1 / overDec;
  const pUnder = 1 / underDec;
  const booksum = pOver + pUnder;

  if (Math.abs(booksum - 1.0) < 0.0001) {
    return { over: pOver, under: pUnder };
  }

  let z = 0.01;
  for (let i = 0; i < 50; i++) {
    const piOver = pOver * (1 - z) / booksum;
    const piUnder = pUnder * (1 - z) / booksum;
    const f = piOver + piUnder - 1.0;
    const df = (pOver * (-1 / booksum)) + (pUnder * (-1 / booksum));

    if (Math.abs(df) < 1e-12) break;

    const zNew = z - f / df;
    if (Math.abs(zNew - z) < 1e-10) {
      z = zNew;
      break;
    }
    z = Math.max(0.0, Math.min(0.2, zNew));
  }

  return {
    over: pOver * (1 - z) / booksum,
    under: pUnder * (1 - z) / booksum,
  };
}

export function devig(
  overDec: number,
  underDec: number,
  method: DevigMethod = "shin",
): DevigResult {
  switch (method) {
    case "power":
      return powerDevig(overDec, underDec);
    case "multiplicative":
      return multiplicativeDevig(overDec, underDec);
    case "shin":
    default:
      return shinDevig(overDec, underDec);
  }
}

export function kellyCriterion(winProb: number, decimalOdds: number, fraction = 1.0): number {
  if (decimalOdds <= 1) return 0;
  const b = decimalOdds - 1;
  const kelly = (winProb * b - (1 - winProb)) / b;
  return Math.max(0, kelly * fraction);
}

export function expectedValuePercent(fairProb: number, betDecimal: number): number {
  return (fairProb * betDecimal - 1.0) * 100;
}

export function dfsExpectedValuePercent(fairProb: number, payoutMultiplier: number): number {
  return (fairProb * payoutMultiplier - 1.0) * 100;
}
