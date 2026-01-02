import { createTheme } from '@mui/material/styles';

export const getTheme = (mode: 'light' | 'dark') => createTheme({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light Mode (Restored/Preserved)
          background: { default: '#f8f9fa', paper: '#ffffff' },
          primary: { main: '#2c3e50' },
          text: { primary: '#2c3e50', secondary: '#607d8b' },
          divider: '#e0e0e0',
          success: { main: '#66bb6a' }, // Custom brighter green for light mode
          error: { main: '#ef5350' },   // Custom red for light mode
        }
      : {
          // Dark Mode (Improved)
          background: { default: '#0d1117', paper: '#161b22' }, // Darker, slightly blueish grey (GitHub-like)
          primary: { main: '#e0f2f7' }, // Even brighter blue for primary actions
          secondary: { main: '#e3b3ff' }, // Even brighter purple
          text: { primary: '#ffffff', secondary: '#e0e0e0' }, // Pure white primary, very light grey secondary
          divider: '#30363d',
          success: { main: '#a5d6a7' }, // Brighter green for dark mode (using the previous 'dark' shade as main)
          error: { main: '#ef9a9a' },   // Brighter red for dark mode (using the previous 'main' shade for consistency)
        }),
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 700 },
    h2: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 600 },
    h3: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 600 },
    h4: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 600 },
    h5: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 600 },
    h6: { fontFamily: '"Merriweather", "Georgia", serif', fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: mode === 'light' ? '0px 2px 4px rgba(0,0,0,0.05)' : 'none',
          border: mode === 'light' ? '1px solid #e0e0e0' : '1px solid #30363d',
          borderRadius: 8,
          backgroundColor: mode === 'light' ? '#ffffff' : '#161b22', // Explicit paper bg
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
          fontWeight: 600,
          boxShadow: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: mode === 'light' ? '#fff' : '#0d1117',
          color: mode === 'light' ? '#2c3e50' : '#c9d1d9',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: mode === 'light' ? '#e0e0e0' : '#30363d',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: mode === 'light' ? '#e0e0e0' : '#30363d',
          color: mode === 'light' ? 'inherit' : '#c9d1d9',
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          backgroundColor: mode === 'light' ? '#fff' : 'transparent',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.23)' : '#30363d',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
             borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#8b949e',
          }
        }
      }
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        icon: {
          color: mode === 'light' ? 'rgba(0, 0, 0, 0.54)' : '#8b949e',
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: mode === 'light' ? 'inherit' : '#8b949e',
        }
      }
    }
  },
});