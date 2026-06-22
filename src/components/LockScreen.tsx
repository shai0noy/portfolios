import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Grid, IconButton, Button, useTheme } from '@mui/material';
import BackspaceIcon from '@mui/icons-material/Backspace';
import LockIcon from '@mui/icons-material/Lock';
import { useLanguage } from '../lib/i18n';

interface LockScreenProps {
  pin: string;
  onUnlock: () => void;
}

export function LockScreen({ pin, onUnlock }: LockScreenProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [inputCode, setInputCode] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [shake, setShake] = useState<boolean>(false);

  // Keyboard interceptor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (error) return; // Prevent input while showing error state
      
      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        handleDigit(key);
      } else if (key === 'Backspace') {
        handleBackspace();
      } else if (key === 'Escape' || key === 'Delete') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputCode, error, pin]);

  const handleDigit = (digit: string) => {
    if (inputCode.length >= pin.length) return;
    const newCode = inputCode + digit;
    setInputCode(newCode);

    if (newCode.length === pin.length) {
      if (newCode === pin) {
        onUnlock();
      } else {
        // Trigger shake & error animation
        setError(true);
        setShake(true);
        setTimeout(() => {
          setShake(false);
        }, 500);
        setTimeout(() => {
          setInputCode('');
          setError(false);
        }, 1200);
      }
    }
  };

  const handleBackspace = () => {
    setInputCode(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setInputCode('');
  };

  // 1-9 grid array
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: theme.palette.mode === 'dark' 
          ? 'radial-gradient(circle at center, #111524 0%, #07090e 100%)' 
          : 'radial-gradient(circle at center, #f4f6fa 0%, #e0e5f0 100%)',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'linear-gradient(45deg, #2196f3, #00bcd4)',
          filter: 'blur(80px)',
          opacity: 0.15,
          top: '20%',
          left: '25%',
          animation: 'float-slow 20s infinite alternate',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          width: '250px',
          height: '250px',
          borderRadius: '50%',
          background: 'linear-gradient(45deg, #e91e63, #9c27b0)',
          filter: 'blur(80px)',
          opacity: 0.12,
          bottom: '25%',
          right: '25%',
          animation: 'float-slow 15s infinite alternate-reverse',
        },
        '@keyframes float-slow': {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '100%': { transform: 'translate(30px, -20px) scale(1.1)' }
        }
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 4,
          width: '100%',
          maxWidth: 380,
          textAlign: 'center',
          backdropFilter: 'blur(16px)',
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(20, 24, 40, 0.65)' : 'rgba(255, 255, 255, 0.7)',
          border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          animation: shake ? 'shake 0.4s ease' : 'none',
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0)' },
            '20%, 60%': { transform: 'translateX(-10px)' },
            '40%, 80%': { transform: 'translateX(10px)' }
          }
        }}
      >
        {/* Header Icon & Title */}
        <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              bgcolor: error ? 'error.main' : 'primary.main',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              mb: 2,
              color: '#fff',
              boxShadow: error ? '0 0 16px rgba(211, 47, 47, 0.4)' : '0 0 16px rgba(25, 118, 210, 0.4)',
              transition: 'background-color 0.3s ease, box-shadow 0.3s ease'
            }}
          >
            <LockIcon sx={{ fontSize: 30 }} />
          </Box>
          <Typography variant="h5" fontWeight={800} color={error ? 'error' : 'text.primary'}>
            {error ? t('Incorrect PIN', 'קוד שגוי') : t('Enter Passcode', 'הזן קוד גישה')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('App is locked for security', 'האפליקציה נעולה לצורכי אבטחה')}
          </Typography>
        </Box>

        {/* PIN Entry Indicators */}
        <Box display="flex" justifyContent="center" gap={2} mb={5}>
          {Array.from({ length: pin.length }).map((_, idx) => {
            const isActive = idx < inputCode.length;
            return (
              <Box
                key={idx}
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: error 
                    ? 'error.main' 
                    : isActive 
                      ? 'primary.main' 
                      : theme.palette.mode === 'dark' 
                        ? 'rgba(255, 255, 255, 0.15)' 
                        : 'rgba(0, 0, 0, 0.12)',
                  transform: isActive ? 'scale(1.2)' : 'scale(1)',
                  transition: 'background-color 0.15s ease, transform 0.15s ease',
                  boxShadow: isActive && !error ? '0 0 8px rgba(25, 118, 210, 0.4)' : 'none'
                }}
              />
            );
          })}
        </Box>

        {/* Numpad Layout */}
        <Grid container spacing={2} sx={{ maxWidth: 280, mx: 'auto' }}>
          {digits.map((digit) => (
            <Grid item xs={4} key={digit}>
              <IconButton
                onClick={() => handleDigit(digit)}
                disabled={error}
                sx={{
                  width: 64,
                  height: 64,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
                  color: 'text.primary',
                  '&:hover': {
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                    bgcolor: 'primary.main',
                    color: '#fff'
                  },
                  transition: 'all 0.1s ease'
                }}
              >
                {digit}
              </IconButton>
            </Grid>
          ))}

          {/* Bottom Row */}
          <Grid item xs={4}>
            <Button
              onClick={handleClear}
              disabled={error}
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'text.secondary',
                minWidth: 'auto',
                p: 0,
                '&:hover': {
                  bgcolor: 'transparent',
                  color: 'text.primary'
                }
              }}
            >
              {t('Clear', 'נקה')}
            </Button>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onClick={() => handleDigit('0')}
              disabled={error}
              sx={{
                width: 64,
                height: 64,
                fontSize: '1.5rem',
                fontWeight: 700,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
                color: 'text.primary',
                '&:hover': {
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                },
                '&:active': {
                  transform: 'scale(0.95)',
                  bgcolor: 'primary.main',
                  color: '#fff'
                },
                transition: 'all 0.1s ease'
              }}
            >
              0
            </IconButton>
          </Grid>
          <Grid item xs={4}>
            <IconButton
              onClick={handleBackspace}
              disabled={error || inputCode.length === 0}
              sx={{
                width: 64,
                height: 64,
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'transparent',
                  color: 'text.primary'
                },
                '&:active': {
                  transform: 'scale(0.95)'
                },
                transition: 'all 0.1s ease'
              }}
            >
              <BackspaceIcon />
            </IconButton>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
