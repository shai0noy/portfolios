
import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment, Tooltip } from '@mui/material';

// Common props for optimized fields
interface BaseFieldProps {
  label: string;
  tooltip?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  required?: boolean;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  placeholder?: string;
}

interface NumericFieldProps extends BaseFieldProps {
  field: string;
  value: number | string; // Allow string if needed for intermediate
  onChange?: (val: number) => void;
  onUpdate?: (field: string, val: number) => void;
  currency?: string;
}

export const NumericField = React.memo(({ label, field, value, onChange, onUpdate, currency, tooltip, disabled, error, helperText, required, startAdornment, endAdornment, placeholder }: NumericFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  const numericVal = typeof value === 'string' ? parseFloat(value) : value;
  const safeVal = isNaN(numericVal) ? 0 : numericVal;

  const displayVal = (safeVal === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : safeVal.toString());

  useEffect(() => {
    // If external value changes (e.g. rounded by parent), we might need to sync.
  }, [value]);

  const fireChange = (val: number) => {
    if (onUpdate) {
      onUpdate(field, val);
    } else if (onChange) {
      onChange(val);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;

    if (v === '' || v === '-') {
      setLocalDisplay(v);
      fireChange(0);
      return;
    }

    if (v.endsWith('.')) {
      setLocalDisplay(v);
      const num = parseFloat(v);
      if (!isNaN(num)) fireChange(num);
      return;
    } else {
        setLocalDisplay(null);
    }

    const num = parseFloat(v);
    if (!isNaN(num)) {
      const validNum = num < 0 ? 0 : num;
      fireChange(validNum);
    }
  };

  // Determine Adornments
  const finalEndAdornment = endAdornment || (currency ? <InputAdornment position="end">{currency}</InputAdornment> : null);
  const finalStartAdornment = startAdornment;

  const textField = (
    <TextField
      fullWidth
      type="number"
      size="small"
      label={label}
      value={displayVal}
      placeholder={placeholder !== undefined ? placeholder : "-"}
      disabled={disabled}
      onChange={handleChange}
      onBlur={() => setLocalDisplay(null)}
      autoComplete="off"
      error={error}
      helperText={helperText}
      required={required}
      InputProps={{
        startAdornment: finalStartAdornment,
        endAdornment: finalEndAdornment,
        inputProps: { min: 0, step: 'any' }
      }}
      sx={!displayVal && required ? { bgcolor: 'action.hover' } : undefined}
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

interface PercentageFieldProps extends BaseFieldProps {
  field: string;
  value: number | string;
  onChange?: (val: number) => void;
  onUpdate?: (field: string, val: number) => void;
}

export const PercentageField = React.memo(({ label, field, value, onChange, onUpdate, tooltip, disabled, error, helperText, required, startAdornment, endAdornment, placeholder }: PercentageFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  const numericVal = typeof value === 'string' ? parseFloat(value) : value;
  const safeVal = isNaN(numericVal) ? 0 : numericVal;

  const pctValue = safeVal * 100;
  const rounded = Math.round(pctValue * 10000) / 10000;
  
  const displayVal = (safeVal === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : rounded.toString());

  const fireChange = (val: number) => {
    if (onUpdate) {
      onUpdate(field, val);
    } else if (onChange) {
      onChange(val);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    
    if (v === '' || v === '-') {
      setLocalDisplay(v);
      fireChange(0);
      return;
    }

    if (v.endsWith('.')) {
      setLocalDisplay(v);
      const num = parseFloat(v);
      if (!isNaN(num)) fireChange(num / 100);
      return;
    } else {
        setLocalDisplay(null);
    }

    let num = parseFloat(v);
    if (!isNaN(num)) {
      if (num < 0) num = 0;
      if (num > 100) num = 100;
      fireChange(num / 100);
    }
  };

  const textField = (
    <TextField
      fullWidth
      type="number"
      size="small"
      label={label}
      value={displayVal}
      placeholder={placeholder !== undefined ? placeholder : "-"}
      disabled={disabled}
      onChange={handleChange}
      onBlur={() => setLocalDisplay(null)}
      autoComplete="off"
      error={error}
      helperText={helperText}
      required={required}
      InputProps={{
        startAdornment: startAdornment,
        endAdornment: endAdornment || <InputAdornment position="end">%</InputAdornment>,
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
