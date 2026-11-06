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
  const datePickerRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTextVal(toEuropeanString(value));
  }, [value]);

  const isoVal = toIsoString(value);
  const rawIsoMin = toIsoString(min) || undefined;
  const rawIsoMax = toIsoString(max) || undefined;
  const isoMin = rawIsoMin && rawIsoMax && rawIsoMin > rawIsoMax ? rawIsoMax : rawIsoMin;
  const isoMax = rawIsoMax;

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
          const trimmed = t.trim();
          if (trimmed.length === 10) {
            const parsed = parse(trimmed, 'dd/MM/yyyy', new Date());
            if (isValid(parsed)) {
              const isoStr = format(parsed, 'yyyy-MM-dd');
              onChange(isoStr);
            }
          }
        }}
        onBlur={() => {
          const trimmed = textVal.trim();
          const parsed = parseSafeDate(trimmed);
          if (parsed && trimmed.length >= 8) {
            const isoStr = format(parsed, 'yyyy-MM-dd');
            onChange(isoStr);
            setTextVal(format(parsed, 'dd/MM/yyyy'));
          } else {
            // Ripristina l'ultimo valore valido se il campo viene lasciato vuoto o incompleto
            setTextVal(toEuropeanString(value));
          }
        }}
        className={className}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled && datePickerRef.current) {
            if (typeof (datePickerRef.current as any).showPicker === 'function') {
              try {
                (datePickerRef.current as any).showPicker();
                return;
              } catch (err) {}
            }
            datePickerRef.current.focus();
            datePickerRef.current.click();
          }
        }}
        className="absolute right-1.5 p-0.5 text-xs text-gray-400 hover:text-indigo-600 select-none cursor-pointer disabled:cursor-not-allowed"
        title={title || "Apri calendario"}
      >
        📅
      </button>
      <input
        ref={datePickerRef}
        type="date"
        data-eu-picker="true"
        value={isoVal}
        min={isoMin}
        max={isoMax}
        disabled={disabled}
        onChange={e => {
          if (e.target.value) {
            onChange(e.target.value);
            setTextVal(toEuropeanString(e.target.value));
          }
        }}
        className="sr-only pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

