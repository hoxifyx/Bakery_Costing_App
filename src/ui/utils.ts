export function displayWastePercent(wastePct: number | undefined): number {
  return Number(((wastePct ?? 0) * 100).toFixed(2));
}

export function sizeGuideKey(index: number, label: string): string {
  return `${index}-${label}`;
}
