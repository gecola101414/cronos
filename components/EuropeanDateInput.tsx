import React, { useState, useEffect } from 'react';
import { format, parseISO, parse, isValid } from 'date-fns';

function parseSafeDate(val?: string): Date | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  try {
    const iso = parseISO(trimmed);
    if (isValid(iso)) return iso;
  } catch (e) {}

  const formats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'dd/MM/yy', 'd/M/yyyy'];
  for (const fmt of formats) {
    try {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed)) return parsed;
    } catch (e) {}
  }

  try {
    const native = new Date(trimmed);
    if (isValid(native)) return native;
  } catch (e) {}

  return null;
}

function toEuropeanString(val?: string): string {
  const parsed = parseSafeDate(val);
  if (!parsed) return '';
  try {
    return format(parsed, 'dd/MM/yyyy');
  } catch (e) {
    return '';
  }
}

function toIsoString(val?: string): string {
  const parsed = parseSafeDate(val);
  if (!parsed) return '';
  try {
    return format(parsed, 'yyyy-MM-dd');
  } catch (e) {
    return '';
  }
}

export const EuropeanDateInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  placeholder?: string;
}> = ({ value, onChange, min, max, disabled, className, title, placeholder = "GG/MM/AAAA" }) => {
  const [textVal, setTextVal] = useState(() => toEuropeanString(value));

  useEffect(() => {
    setTextVal(toEuropeanString(value));
  }, [value]);

  const isoVal = toIsoString(value);
  const isoMin = toIsoString(min) || undefined;
  const isoMax = toIsoString(max) || undefined;

  return (
    <div className="relative flex items-center w-full" title={title}>
      <input
        type="text"
        placeholder={placeholder}
        value={textVal}
        disabled={disabled}
        onChange={e => {
          const t = e.target.value;
          setTextVal(t);
          const parsed = parse(t, 'dd/MM/yyyy', new Date());
          if (isValid(parsed) && t.trim().length === 10) {
            const isoStr = format(parsed, 'yyyy-MM-dd');
            if ((!isoMin || isoStr >= isoMin) && (!isoMax || isoStr <= isoMax)) {
              onChange(isoStr);
            }
          } else if (t === '') {
            onChange('');
          }
        }}
        className={className}
      />
      <div className="absolute right-2 pointer-events-none text-xs text-gray-400 select-none">
        📅
      </div>
      <input
        type="date"
        data-eu-picker="true"
        value={isoVal}
        min={isoMin}
        max={isoMax}
        disabled={disabled}
        onClick={e => {
          if (!disabled && typeof (e.currentTarget as any).showPicker === 'function') {
            try {
              (e.currentTarget as any).showPicker();
            } catch (err) {}
          }
        }}
        onChange={e => {
          if (e.target.value) {
            onChange(e.target.value);
            setTextVal(toEuropeanString(e.target.value));
          }
        }}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        title={title || "Seleziona data"}
      />
    </div>
  );
};

