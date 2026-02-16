
import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment, Tooltip } from '@mui/material';

// Common props for optimized fields
interface BaseFieldProps {
  label: string;
  tooltip?: string;
  disabled?: boolean;
}

interface NumericFieldProps extends BaseFieldProps {
  field: string;
  value: number;
  onChange?: (val: number) => void; // Legacy or simple usage
  onUpdate?: (field: string, val: number) => void; // Stable callback usage
  currency?: string;
}

export const NumericField = React.memo(({ label, field, value, onChange, onUpdate, currency, tooltip, disabled }: NumericFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  const displayVal = (value === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : value.toString());

  useEffect(() => {
    // Sync logic if needed, currently reliant on value prop
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

interface PercentageFieldProps extends BaseFieldProps {
  field: string;
  value: number;
  onChange?: (val: number) => void;
  onUpdate?: (field: string, val: number) => void;
}

export const PercentageField = React.memo(({ label, field, value, onChange, onUpdate, tooltip, disabled }: PercentageFieldProps) => {
  const [localDisplay, setLocalDisplay] = useState<string | null>(null);

  const pctValue = value * 100;
  const rounded = Math.round(pctValue * 10000) / 10000;
  
  const displayVal = (value === 0 && localDisplay === null) ? '' : (localDisplay !== null ? localDisplay : rounded.toString());

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
