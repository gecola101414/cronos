export const formatItalianNumber = (
  value: number,
  minFractionDigits: number = 2,
  maxFractionDigits: number = 2
): string => {
  const safeVal = Number.isFinite(value) ? value : 0;
  const maxDec = Math.max(0, maxFractionDigits);
  const minDec = Math.min(Math.max(0, minFractionDigits), maxDec);
  const factor = Math.pow(10, maxDec);
  const absRounded = Math.round((Math.abs(safeVal) + Number.EPSILON) * factor) / factor;
  const isNegative = safeVal < 0 && absRounded > 0;

  const fixedStr = absRounded.toFixed(maxDec);
  const parts = fixedStr.split('.');
  const intPart = parts[0] || '0';
  let decPart = parts[1] || '';

  while (decPart.length > minDec && decPart.endsWith('0')) {
    decPart = decPart.slice(0, -1);
  }

  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = isNegative ? '-' : '';
  return decPart.length > 0 ? `${sign}${groupedInt},${decPart}` : `${sign}${groupedInt}`;
};

export interface SimpleNumberFormatter {
  format: (value: number) => string;
}

export const createNumberFormatter = (
  minFractionDigits: number = 2,
  maxFractionDigits: number = 2
): SimpleNumberFormatter => ({
  format: (value: number) => formatItalianNumber(value, minFractionDigits, maxFractionDigits),
});

export const createCurrencyFormatter = (
  minFractionDigits: number = 2,
  maxFractionDigits: number = 2
): SimpleNumberFormatter => ({
  format: (value: number) => `${formatItalianNumber(value, minFractionDigits, maxFractionDigits)} €`,
});

export const createPercentFormatter = (
  minFractionDigits: number = 2,
  maxFractionDigits: number = 2
): SimpleNumberFormatter => ({
  format: (value: number) => `${formatItalianNumber((Number.isFinite(value) ? value : 0) * 100, minFractionDigits, maxFractionDigits)}%`,
});
