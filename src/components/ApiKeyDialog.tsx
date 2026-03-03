import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField, Box, Link, Typography, CircularProgress } from '@mui/material';
import { getMetadataValue, setMetadataValue } from '../lib/sheets';
import { useLanguage } from '../lib/i18n';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import KeyIcon from '@mui/icons-material/VpnKey';

interface ApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  sheetId: string;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ open, onClose, sheetId }) => {
  const { t } = useLanguage();
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const fetchKey = async () => {
      setIsLoading(true);
      try {
        const encrypted = await getMetadataValue(sheetId, 'aistudio_apikey');
        if (encrypted && mounted) {
          const decrypted = await decryptSecret(encrypted, sheetId);
          setApiKey(decrypted);
          setHasExistingKey(true);
        }
      } catch (err) {
        console.error("Failed to fetch or decrypt API key", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchKey();
    return () => { mounted = false; };
  }, [open, sheetId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        const encrypted = await encryptSecret(apiKey.trim(), sheetId);
        await setMetadataValue(sheetId, 'aistudio_apikey', encrypted);
      } else {
        await setMetadataValue(sheetId, 'aistudio_apikey', '');
      }
      onClose();
    } catch (err) {
      console.error("Failed to save API key", err);
      alert(t('Failed to save API key. Please check console.', 'נכשל בשמירת מפתח ה-API.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <KeyIcon color="primary" /> {t('AI Studio API Key', 'מפתח ה-API של AI Studio')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText paragraph>
          {t(
            'Enhance this app with AI features by providing your Google AI Studio API key.',
            'שדרג את האפליקציה עם תכונות AI על ידי הזנת מפתח ה-API של Google AI Studio.'
          )}
        </DialogContentText>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t('1. Go to ', '1. עבור אל ')}
          <Link href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener">
            https://aistudio.google.com/api-keys
          </Link>
          <br />
          {t('2. Create a new API key and paste it below.', '2. צור מפתח חדש והדבק אותו למטה.')}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph sx={{ display: 'flex', gap: 0.5, flexDirection: 'column', p: 1.5, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <strong>{t('Privacy & Security:', 'פרטיות ואבטחה:')}</strong>
          <span>• {t('Your key is encrypted using your unique Google Sheet ID before being saved.', 'המפתח שלך מוצפן באמצעות ה-ID הייחודי של גיליון ה-Google שלך לפני השמירה.')}</span>
          <span>• {t('It is stored solely in the "app_metadata" sheet within your private spreadsheet.', 'הוא נשמר אך ורק בגיליון "app_metadata" בתוך הגיליון הפרטי שלך.')}</span>
          <span>• {t('It will never be shared or sent anywhere besides Google AI Studio.', 'הוא לעולם לא ישותף או יישלח לשום מקום מלבד Google AI Studio.')}</span>
          <span>• {t('It is only used when you manually trigger AI-powered actions.', 'השימוש ייעשה רק כאשר אתה יוזם פעולה המופעלת על ידי AI.')}</span>
        </Typography>

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <TextField
            fullWidth
            margin="dense"
            label={t('API Key', 'מפתח API')}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            helperText={hasExistingKey && !apiKey.trim() ? t('Clearing this will remove the saved key.', 'ניקוי שדה זה ימחק את המפתח השמור.') : ''}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={isSaving}>
          {t('Cancel', 'ביטול')}
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={isLoading || isSaving}>
          {isSaving ? <CircularProgress size={20} color="inherit" /> : t('Save', 'שמור')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
