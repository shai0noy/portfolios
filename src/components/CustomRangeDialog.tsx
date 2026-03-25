
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n';
import { formatDate, coerceDate } from '../lib/date';
import { Typography, Box, Chip } from '@mui/material';
import { DateField } from './PortfolioInputFields';

interface CustomRangeDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (start: Date | null, end: Date | null) => void;
  initialStart: Date | null;
  initialEnd: Date | null;
}

export function CustomRangeDialog({ open, onClose, onSave, initialStart, initialEnd }: CustomRangeDialogProps) {
  const { t } = useLanguage();
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');

  // Update effect to use formatDate (DD/MM/YYYY)
  useEffect(() => {
    if (open) {
      setStartStr(initialStart ? formatDate(initialStart) : '');
      setEndStr(initialEnd ? formatDate(initialEnd) : '');
    }
  }, [open, initialStart, initialEnd]);

  // Helper to calculate duration
  const getDuration = (start: Date | null, end: Date | null) => {
    if (!start) return null;
    const endDate = end || new Date(); // If end is null, assume 'now' for duration calc

    if (isNaN(start.getTime()) || isNaN(endDate.getTime())) return null;
    if (endDate < start) return null;

    let years = endDate.getFullYear() - start.getFullYear();
    let months = endDate.getMonth() - start.getMonth();
    let days = endDate.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
      days += prevMonthDate.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    // Rounding: If we have 11 months and 28+ days, call it a year
    if (months === 11 && days >= 28) {
      years += 1;
      months = 0;
      days = 0;
    }
    // Rounding: If we have 30+ days (close to month end), round up months
    if (days >= 28 && months < 11) {
      months += 1;
      days = 0;
    }

    const parts = [];
    if (years > 0) parts.push(years === 1 ? t('1 Year', 'שנה 1') : `${years} ${t('Years', 'שנים')}`);
    if (months > 0) parts.push(months === 1 ? t('1 Month', 'חודש 1') : `${months} ${t('Months', 'חודשים')}`);
    if (days > 0 && years === 0 && months === 0) parts.push(`${days} ${t('Days', 'ימים')}`);

    if (parts.length === 0) return t('0 Days', '0 ימים');
    return parts.join(', ');
  };

  const parsedStart = coerceDate(startStr);
  // For end date: if empty, it means "Now". We use 'null' for logic but need valid date for duration calc.
  // BUT coerceDate returns null for empty string.
  // If endStr is empty, parsedEnd is null, effectively "Now".
  const parsedEnd = endStr ? coerceDate(endStr) : null;
  const effectiveEnd = parsedEnd || new Date(); // For display purposes

  const durationStr = getDuration(parsedStart, effectiveEnd);

  const handleSave = () => {
    const start = coerceDate(startStr);
    const end = coerceDate(endStr);

    if (end) {
      end.setHours(23, 59, 59, 999);
    }
    onSave(start, end);
    onClose();
  };

  const quickOptions: { label: string, start: string, end: string }[] = [];
  const now = new Date();

  // Last 3 Years
  for (let i = 0; i < 3; i++) {
    const y = now.getFullYear() - i;
    // Use YTD for current year
    const isCurrentYear = i === 0;
    quickOptions.push({
      label: `${y}`,
      start: `01/01/${y}`,
      end: isCurrentYear ? formatDate(now) : `31/12/${y}`
    });
  }

  // Last 6 Months
  for (let i = 0; i < 6; i++) {
    const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = mDate.getFullYear();
    const m = mDate.getMonth();

    // To get localized month, we can use toLocaleString or standard array. 
    // We will stick to standard English for stability, or he-IL based on useLanguage
    const mStringEN = mDate.toLocaleString('en-US', { month: 'short' });
    const mStringHE = mDate.toLocaleString('he-IL', { month: 'short' });
    const mString = t(mStringEN, mStringHE);

    const startStr = `01/${String(m + 1).padStart(2, '0')}/${y}`;
    const isCurrentMonth = (i === 0);
    const endStr = isCurrentMonth ? formatDate(now) : `${new Date(y, m + 1, 0).getDate()}/${String(m + 1).padStart(2, '0')}/${y}`;

    quickOptions.push({
      label: `${mString} ${y}`,
      start: startStr,
      end: endStr
    });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Custom Time Range', 'טווח זמן מותאם אישית')}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {quickOptions.map(opt => (
              <Chip
                key={opt.label}
                label={opt.label}
                size="small"
                variant="outlined"
                onClick={() => { setStartStr(opt.start); setEndStr(opt.end); }}
                sx={{ cursor: 'pointer', borderRadius: 1 }}
              />
            ))}
          </Box>
          <DateField
            label={t('Start Date', 'תאריך התחלה')}
            value={startStr}
            onChange={(val) => setStartStr(val)}
            field="start"
            placeholder="DD/MM/YYYY"
            sx={{ width: '100%' }}
          />
          <DateField
            label={t('End Date', 'תאריך סיום')}
            value={endStr}
            onChange={(val) => setEndStr(val)}
            field="end"
            placeholder={t('Today', 'היום')}
            sx={{ width: '100%' }}
          />
          {durationStr && (
            <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('Duration', 'משך זמן')}: <strong>{durationStr}</strong>
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel', 'ביטול')}</Button>
        <Button onClick={handleSave} variant="contained">{t('Apply', 'החל')}</Button>
      </DialogActions>
    </Dialog>
  );
}
