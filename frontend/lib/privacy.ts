export type PrivacyInput = {
  bucket: number;
  poolLiquidity: number;
  secondsSinceLastDeposit: number | null;
  lastDepositAmount: number | null;
};

export type PrivacyCheck = { ok: boolean; label: string; detail: string; penalty: number };

export type PrivacyReport = { score: number; grade: "Strong" | "Fair" | "Weak"; checks: PrivacyCheck[] };

const MINUTE = 60;

function poolCheck(bucket: number, liquidity: number): PrivacyCheck {
  const cover = liquidity / bucket;
  if (cover >= 20) return { ok: true, label: "Pool is busy", detail: "Plenty of other funds to blend in with.", penalty: 0 };
  if (cover >= 5) return { ok: false, label: "Pool is quiet", detail: "Fewer funds to blend with. A smaller size hides better.", penalty: 15 };
  return { ok: false, label: "Pool is small right now", detail: "Your withdrawal is a big share of the pool and stands out.", penalty: 35 };
}

function timingCheck(seconds: number | null): PrivacyCheck {
  if (seconds === null || seconds >= 60 * MINUTE)
    return { ok: true, label: "Good timing gap", detail: "Your deposit and this session aren't close together.", penalty: 0 };
  if (seconds >= 10 * MINUTE)
    return { ok: false, label: "Recent deposit", detail: "Waiting an hour after depositing makes timing analysis harder.", penalty: 10 };
  return { ok: false, label: "You funded too fast", detail: "Deposit and withdrawal minutes apart can be linked by timing.", penalty: 25 };
}

function amountCheck(lastDeposit: number | null): PrivacyCheck {
  const unique = lastDeposit !== null && lastDeposit % 100 !== 0;
  return unique
    ? { ok: false, label: "Your deposit amount is unique", detail: "Odd amounts are easy to trace. Deposit round numbers.", penalty: 15 }
    : { ok: true, label: "Fixed-size withdrawal", detail: "Burners are funded in standard sizes everyone uses.", penalty: 0 };
}

export function privacyReport(input: PrivacyInput): PrivacyReport {
  const checks = [poolCheck(input.bucket, input.poolLiquidity), timingCheck(input.secondsSinceLastDeposit), amountCheck(input.lastDepositAmount)];
  const score = Math.max(0, 100 - checks.reduce((sum, c) => sum + c.penalty, 0));
  const grade = score >= 80 ? "Strong" : score >= 55 ? "Fair" : "Weak";
  return { score, grade, checks };
}
