import { useState, useEffect, useCallback } from 'react';
import { Box, Button, Typography, CircularProgress, Paper, Container, TextField, Stack } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { initializeGapi, signIn, checkSheetExists } from '../lib/google';
import { createPortfolioSpreadsheet } from '../lib/sheets/index';
import { useLanguage } from '../lib/i18n';

function extractSheetIdFromUrl(url: string): string | null {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function Login({ onLogin }: { onLogin: (sheetId: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [manualSheetId, setManualSheetId] = useState('');
  const { t } = useLanguage();

  const checkInitialSession = useCallback(async () => {
    try {
      const sessionRestored = await initializeGapi();
      setIsSignedIn(sessionRestored);
      const savedSheetId = localStorage.getItem('g_sheet_id');
      
      if (sessionRestored && savedSheetId && savedSheetId !== 'null') {
        setLoading(true);
        const exists = await checkSheetExists(savedSheetId);
        if (exists) {
          onLogin(savedSheetId);
          return; // Already logged in and sheet is valid
        } else {
          localStorage.removeItem('g_sheet_id');
          setError('Stored spreadsheet not found. Please create a new one or enter an existing ID.');
        }
      } else {
        if (savedSheetId === 'null') {
          localStorage.removeItem('g_sheet_id');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to initialize Google API');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  useEffect(() => {
    checkInitialSession();
  }, [checkInitialSession]);

  const handleSelectSheet = (idOrUrl: string) => {
    const trimmedIdOrUrl = idOrUrl.trim();
    if (!trimmedIdOrUrl) {
      setError('Please enter a valid Spreadsheet ID or URL.');
      return;
    }

    let sheetId = extractSheetIdFromUrl(trimmedIdOrUrl);
    if (!sheetId) {
      sheetId = trimmedIdOrUrl; // Assume it's an ID
    }

    setLoading(true);
    setError('');
    checkSheetExists(sheetId).then(exists => {
      if (exists) {
        localStorage.setItem('g_sheet_id', sheetId!);
        onLogin(sheetId!);
      } else {
        setError('Spreadsheet ID not found or access denied.');
        setLoading(false);
      }
    }).catch(() => {
      setError('Error validating Spreadsheet ID.');
      setLoading(false);
    });
  };

  const handleCreateNew = async () => {
    setLoading(true);
    setError('');
    try {
      const sheetId = await createPortfolioSpreadsheet(); // Uses DEFAULT_SHEET_NAME
      if (sheetId) {
        localStorage.setItem('g_sheet_id', sheetId);
        onLogin(sheetId);
      } else {
        setError('Failed to create new spreadsheet.');
      }
    } catch (e) {
      setError('Error creating spreadsheet.');
    } finally {
      setLoading(false);
    }
  };

  const performLogin = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await signIn();
      setIsSignedIn(true);
      const savedSheetId = localStorage.getItem('g_sheet_id');
      if (savedSheetId && savedSheetId !== 'null') {
        const exists = await checkSheetExists(savedSheetId);
        if (exists) {
          onLogin(savedSheetId);
        } else {
            localStorage.removeItem('g_sheet_id');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Login failed: ' + err.message);
      setIsSignedIn(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !error) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <CircularProgress color="primary" />
    </Box>
  );

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="100vh" bgcolor="background.default">
      <Container maxWidth="sm">
        <Paper elevation={0} sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 3, border: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom color="primary" fontWeight="bold">Portfolio Tracker</Typography>
          {!isSignedIn ? (
            <>
              <Typography variant="body1" color="text.secondary" paragraph>
                {t('Sign in with Google to link your spreadsheet.', 'התחבר עם Google כדי לחבר את הגיליון שלך.')}
              </Typography>
              {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
              <Button variant="contained" startIcon={<GoogleIcon />} onClick={performLogin} disabled={loading} fullWidth size="large" sx={{ mt: 2, py: 1.5 }}>
                {t('Sign in with Google', 'התחברות באמצעות Google')}
              </Button>
            </>
          ) : (
            <Stack spacing={2} sx={{ width: '100%' }}>
              <Typography variant="h6" gutterBottom>{t('Link Your Spreadsheet', 'חיבור גיליון נתונים')}</Typography>
              {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}
              
              <Typography variant="body2" color="text.secondary" align="left" paragraph>
                {t('If this is your first time, create a new spreadsheet. This app will store all data in this private Google Sheet.', 'אם זו הפעם הראשונה שלך, צור גיליון חדש. האפליקציה תשמור את כל הנתונים בגיליון Google פרטי זה.')}
              </Typography>
              <Button variant="outlined" onClick={handleCreateNew} disabled={loading} fullWidth>
                {t('Create New Sheet ("Portfolios_App_Data")', 'יצירת גיליון חדש ("Portfolios_App_Data")')}
              </Button>
              
              <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>{t('OR', 'או')}</Typography>
              
              <Typography variant="body2" color="text.secondary" align="left" paragraph>
                {t('If you have an existing spreadsheet from this app, paste its ID or URL below:', 'אם יש לך גיליון קיים מהאפליקציה, הדבק את המזהה או הקישור שלו למטה:')}
              </Typography>
              <TextField
                label={t('Spreadsheet ID or URL', 'מזהה גיליון או קישור')}
                variant="outlined"
                size="small"
                fullWidth
                value={manualSheetId}
                onChange={(e) => setManualSheetId(e.target.value)}
                placeholder="e.g., 1aBcDeFgH... or https://docs.google.com/..."
              />
              <Button variant="contained" onClick={() => handleSelectSheet(manualSheetId)} disabled={loading || !manualSheetId.trim()} fullWidth>
                {t('Use This Sheet', 'בחירה בגיליון זה')}
              </Button>
            </Stack>
          )}
        </Paper>
      </Container>
    </Box>
  );
}