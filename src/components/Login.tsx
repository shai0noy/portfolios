import { useState, useEffect } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { initGoogleClient, signIn, getSpreadsheet, createSpreadsheet } from '../lib/google';

export function Login({ onLogin }: { onLogin: (sheetId: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    initGoogleClient()
      .then((sessionRestored) => {
        // If Google Session is valid, check if we have a saved Sheet ID
        const savedSheetId = localStorage.getItem('g_sheet_id');
        
        if (sessionRestored && savedSheetId) {
          // Both valid? Auto-login!
          onLogin(savedSheetId);
        } else {
          setLoading(false); // Show login button
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to initialize Google API');
        setLoading(false);
      });
  }, [onLogin]);

  const handlePostLogin = async () => {
    setLoading(true);
    try {
      let sheetId = await getSpreadsheet();
      if (!sheetId) {
        sheetId = await createSpreadsheet();
      }
      // SAVE SHEET ID
      localStorage.setItem('g_sheet_id', sheetId);
      onLogin(sheetId);
    } catch (e: any) {
      console.error(e);
      setError('Error accessing Drive. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const performLogin = async () => {
    try {
      await signIn();
      await handlePostLogin();
    } catch (err: any) {
      console.error(err);
      setError('Login failed');
    }
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <CircularProgress />
    </Box>
  );

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
      <Typography variant="h4" fontWeight="bold">Portfolios</Typography>
      <Typography color="text.secondary">Private, Local, Secure.</Typography>
      
      {error && <Typography color="error">{error}</Typography>}
      
      <Button 
        variant="contained" 
        startIcon={<GoogleIcon />} 
        onClick={performLogin}
        sx={{ mt: 2, textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }}
      >
        Sign in with Google
      </Button>
    </Box>
  );
}