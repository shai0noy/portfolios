import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, CircularProgress, Box, Typography
} from '@mui/material';

interface SubscriptionDialogProps {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  t: (key: string, def?: string) => string;
}

export function SubscriptionDialog({ open, onClose, sheetId, t }: SubscriptionDialogProps) {
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'none'>('none');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const WORKER_URL = (import.meta as any).env?.VITE_WORKER_URL || '';

  useEffect(() => {
    if (open && sheetId) {
      loadStatus();
    }
  }, [open, sheetId]);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${WORKER_URL}/subscribe?spreadsheetId=${sheetId}`, {
         credentials: 'include'
      });
      if (!res.ok) throw new Error(t('Failed to load subscription status', 'שגיאה בטעינת סטטוס המנוי'));
      
      const data = await res.json();
      if (data.frequency && data.frequency !== 'none') {
        setFrequency(data.frequency);
        setEmail(data.email || '');
      } else {
        setFrequency('none');
        setEmail('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (isUnsubscribe = false) => {
    setSaving(true);
    setError(null);
    const freq = isUnsubscribe ? 'unsubscribe' : frequency;

    if (!isUnsubscribe && !email) {
      setError(t('Email is required', 'נדרש דוא"ל'));
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`${WORKER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency: freq, spreadsheetId: sheetId, email: isUnsubscribe ? undefined : email }),
        credentials: 'include'
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || t('Failed to save subscription', 'שגיאה בשמירת המנוי'));
      }

      alert(isUnsubscribe ? t('Unsubscribed successfully!', 'בוטלה ההרשמה בהצלחה!') : t('Subscription updated successfully!', 'המנוי עודכן בהצלחה!'));
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle fontWeight="bold">{t('Manage Email Summary', 'ניהול סיכום דוא"ל')}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box display="flex" justifyContent="center" p={3}><CircularProgress size={24} /></Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2}>
            {error && <Typography color="error" variant="body2">{error}</Typography>}
            
            <TextField
              label={t('Email Address', 'כתובת דוא"ל')}
              variant="outlined"
              size="small"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
            />

            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 0.5 }}>
                {t('Frequency', 'תדירות')}
              </FormLabel>
              <RadioGroup
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
              >
                <FormControlLabel value="daily" control={<Radio size="small" />} label={t('Daily', 'יומי')} />
                <FormControlLabel value="weekly" control={<Radio size="small" />} label={t('Weekly', 'שבועי')} />
                <FormControlLabel value="monthly" control={<Radio size="small" />} label={t('Monthly', 'חודשי')} />
                <FormControlLabel value="none" control={<Radio size="small" />} label={t('Off / Unsubscribed', 'כבוי / בטל')} />
              </RadioGroup>
            </FormControl>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving} size="small">{t('Cancel', 'ביטול')}</Button>
        {frequency !== 'none' && (
          <Button 
            onClick={() => handleSave(true)} 
            color="error" 
            disabled={saving || loading}
            size="small"
          >
            {t('Unsubscribe', 'בטל הרשמה')}
          </Button>
        )}
        <Button 
          onClick={() => handleSave(false)} 
          variant="contained" 
          disabled={saving || loading || frequency === 'none'}
          size="small"
        >
          {t('Save', 'שמור')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
