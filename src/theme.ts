import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    background: {
      default: '#f8f9fa', // Light grey-white, clean
      paper: '#ffffff',
    },
    primary: {
      main: '#2c3e50', // Dark slate blue - professional, slightly classic
    },
    secondary: {
      main: '#8e44ad',
    },
    text: {
      primary: '#2c3e50',
      secondary: '#607d8b',
    },
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
          boxShadow: '0px 2px 4px rgba(0,0,0,0.05)', // Minimal shadow
          border: '1px solid #e0e0e0', // Subtle border
          borderRadius: 8,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // Modern/Clean
          borderRadius: 6,
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
          },
        },
        containedPrimary: {
           border: '1px solid #2c3e50',
        },
        outlined: {
          borderWidth: '1px',
        }
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
        }
      }
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
          color: '#2c3e50',
          boxShadow: '0px 1px 0px #e0e0e0', // Bottom border instead of shadow
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#2c3e50',
          fontSize: '0.75rem',
        },
      },
    },
  },
});

export default theme;
