export function parsePercentToFraction(percent: number): number {
  return percent / 100;
}

export function validatePricingOverrides(
  overheadPct: number | null | undefined,
  targetMargin: number | null | undefined,
  labourRate: number | null | undefined,
): string | null {
  if (overheadPct != null && (!Number.isFinite(overheadPct) || overheadPct < 0)) {
    return 'Overhead percentage must be a finite, non-negative number.';
  }
  if (targetMargin != null && (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin >= 1)) {
    return 'Target margin must be a finite percentage below 100%.';
  }
  if (labourRate != null && (!Number.isFinite(labourRate) || labourRate < 0)) {
    return 'Labour rate must be a finite, non-negative number.';
  }
  return null;
}
