
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n';
import { formatDate, coerceDate } from '../lib/date';
import { Typography, Box } from '@mui/material';
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
      // Days in previous month
      const prevMonthDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
      days += prevMonthDate.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} ${t('Years', 'שנים')}`);
    if (months > 0) parts.push(`${months} ${t('Months', 'חודשים')}`);
    // Optional: Include days if duration is short or user wants precision?
    // User asked for "years, months", but days are good for short periods.
    if (days > 0 && years === 0) parts.push(`${days} ${t('Days', 'ימים')}`);

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
      // Set to end of day? 23:59:59.999
      end.setHours(23, 59, 59, 999);
    }
    onSave(start, end);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Custom Time Range', 'טווח זמן מותאם אישית')}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
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
