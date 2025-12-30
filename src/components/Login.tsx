import { useState, useEffect } from 'react';
import { Box, Button, Typography, CircularProgress, Paper, Container } from '@mui/material';
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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <CircularProgress color="primary" />
    </Box>
  );

  return (
    <Box 
      display="flex" 
      flexDirection="column" 
      alignItems="center" 
      justifyContent="center" 
      minHeight="100vh" 
      bgcolor="background.default"
    >
      <Container maxWidth="xs">
        <Paper 
          elevation={0} 
          sx={{ 
            p: 5, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            textAlign: 'center'
          }}
        >
          <Typography variant="h3" gutterBottom color="primary">
            Portfolios
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            This is a purely client-side application. The code is open source and runs directly from GitHub Pages. All your data is stored in a private Google Sheet in your own Google Drive. No servers other than Google's can access your data, and the app can only access the Google Sheet it creates.
          </Typography>
          
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          
          <Button 
            variant="contained" 
            startIcon={<GoogleIcon />} 
            onClick={performLogin}
            fullWidth
            size="large"
            sx={{ mt: 2, py: 1.5 }}
          >
            Sign in with Google
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
