
import React, { useState, useEffect } from 'react';
import { TextField, InputAdornment, Tooltip, IconButton, Box, type Theme, type SxProps } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import { coerceDate } from '../lib/date';

// Common props for optimized fields
interface BaseFieldProps {
  label?: string;
  tooltip?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  required?: boolean;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  placeholder?: string;
  InputLabelProps?: any;
}

interface NumericFieldProps extends BaseFieldProps {
  field: string;
  value: number | string; // Allow string if needed for intermediate
  onChange?: (val: number) => void;
  onUpdate?: (field: string, val: number) => void;
  currency?: string;
}

export const NumericField = React.memo(({ label, field, value, onChange, onUpdate, currency, tooltip, disabled, error, helperText, required, startAdornment, endAdornment, placeholder, InputLabelProps }: NumericFieldProps) => {
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
      InputLabelProps={InputLabelProps}
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

interface DateFieldProps extends BaseFieldProps {
  value: string;
  onChange: (val: string) => void;
  field?: string;
  onUpdate?: (field: string, val: string) => void;
  sx?: SxProps<Theme>;
}

export const DateField = React.memo(({
  label, value, onChange, onUpdate, field,
  tooltip, disabled, error, helperText, required, placeholder = "dd/mm/yyyy", InputLabelProps, sx
}: DateFieldProps) => {
  const hiddenInputRef = React.useRef<HTMLInputElement | null>(null);

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // yyyy-mm-dd
    if (!val) return;
    const [y, m, d] = val.split('-');
    const formatted = `${d}/${m}/${y}`;
    if (onUpdate && field) {
      onUpdate(field, formatted);
    } else {
      onChange(formatted);
    }
  };

  const openPicker = () => {
    const el = hiddenInputRef.current as any;
    if (el) {
      if (el.showPicker) {
        try {
          el.showPicker();
        } catch {
          el.focus();
          el.click();
        }
      } else {
        el.focus();
        el.click();
      }
    }
  };

  // Convert dd/mm/yyyy to yyyy-mm-dd for the hidden picker
  const getPickerValue = () => {
    if (!value) return '';
    const d = coerceDate(value);
    if (!d || isNaN(d.getTime())) return '';

    // Use local time components to avoid timezone shifts (toISOString uses UTC)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fieldElement = (
    <Box sx={{ position: 'relative', width: '100%', ...sx }}>
      <TextField
        fullWidth
        size="small"
        label={label}
        value={value}
        onChange={(e) => {
          if (onUpdate && field) onUpdate(field, e.target.value);
          else onChange(e.target.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        helperText={helperText}
        required={required}
        InputLabelProps={InputLabelProps || { shrink: true }}
        autoComplete="off"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={openPicker} disabled={disabled}>
                <EventIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
      />
      <input
        type="date"
        ref={hiddenInputRef}
        value={getPickerValue()}
        onChange={handlePickerChange}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
    </Box>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="top" arrow>
        {fieldElement}
      </Tooltip>
    );
  }

  return fieldElement;
});
