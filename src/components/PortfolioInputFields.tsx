
import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment, Tooltip } from '@mui/material';

interface NumericFieldProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  currency?: string;
  tooltip?: string;
  disabled?: boolean;
}

export const NumericField = React.memo(({ label, value, onChange, currency, tooltip, disabled }: NumericFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  // If value is 0, we want to show empty string (and let placeholder "-" show)
  // unless user is typing, which is handled by localDisplay
  const displayVal = (value === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : value.toString());

  useEffect(() => {
    // Sync local display if external value changes significantly?
    // Actually, if we use value prop, we don't need this complex sync if we blindly trust props.
    // But we want to allow typing "0." without it becoming "0".
    // If external value changed (e.g. rounded), we should update.
    // However, for simple input, just relying on props is often enough if parent updates fast.
    // Except "5." case.
    if (localDisplay === null && value !== 0) {
        // logic to ensure we don't overwrite user typing trailing dot?
        // if localDisplay is null, we show value.toString().
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    
    // Allow empty or "-" to clear value
    if (v === '' || v === '-') {
      setLocalDisplay(v);
      onChange(0);
      return;
    }

    // Allow trailing decimal
    if (v.endsWith('.')) {
      setLocalDisplay(v);
      // We don't update parent yet if it's just "12." (it parses to 12)
      // Actually we should update parent to 12.
      const num = parseFloat(v);
      if (!isNaN(num)) onChange(num);
      return;
    } else {
        setLocalDisplay(null);
    }

    const num = parseFloat(v);
    if (!isNaN(num)) {
      // Prevent negative
      const validNum = num < 0 ? 0 : num;
      onChange(validNum);
    }
  };

  const textField = (
    <TextField
      fullWidth
      type="number"
      size="small"
      label={label}
      value={displayVal}
      placeholder="-"
      disabled={disabled}
      onChange={handleChange}
      onBlur={() => setLocalDisplay(null)}
      autoComplete="off"
      InputProps={{
        endAdornment: currency ? <InputAdornment position="end">{currency}</InputAdornment> : null,
        inputProps: { min: 0, step: 'any' }
      }}
    />
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="top" arrow>
        {textField}
      </Tooltip>
    );
  }
  return textField;
});

interface PercentageFieldProps {
  label: string;
  value: number; // 0.1 for 10%
  onChange: (val: number) => void;
  tooltip?: string;
  disabled?: boolean;
}

export const PercentageField = React.memo(({ label, value, onChange, tooltip, disabled }: PercentageFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  // Display 0 as empty (placeholder "-")
  const pctValue = value * 100;
  // Round to 4 decimals to avoid float artifacts
  const rounded = Math.round(pctValue * 10000) / 10000;
  
  const displayVal = (value === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : rounded.toString());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    
    if (v === '' || v === '-') {
      setLocalDisplay(v);
      onChange(0);
      return;
    }

    if (v.endsWith('.')) {
      setLocalDisplay(v);
      const num = parseFloat(v);
      if (!isNaN(num)) onChange(num / 100);
      return;
    } else {
        setLocalDisplay(null);
    }

    let num = parseFloat(v);
    if (!isNaN(num)) {
      if (num < 0) num = 0;
      if (num > 100) num = 100;
      onChange(num / 100);
    }
  };

  const textField = (
    <TextField
      fullWidth
      type="number"
      size="small"
      label={label}
      value={displayVal}
      placeholder="-"
      disabled={disabled}
      onChange={handleChange}
      onBlur={() => setLocalDisplay(null)}
      autoComplete="off"
      InputProps={{
        endAdornment: <InputAdornment position="end">%</InputAdornment>,
        inputProps: { min: 0, step: 'any' }
      }}
    />
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="top" arrow>
        {textField}
      </Tooltip>
    );
  }
  return textField;
});
