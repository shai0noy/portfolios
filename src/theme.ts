import { createTheme, responsiveFontSizes } from '@mui/material/styles';

export const getTheme = (mode: 'light' | 'dark', direction: 'ltr' | 'rtl' = 'ltr', colorblindMode: boolean = false) => {
  let theme = createTheme({
    direction,
    palette: {
      mode,
      ...(mode === 'light'
        ? {
            // Light Mode
            background: { default: '#f8f9fa', paper: '#ffffff' },
            primary: { main: '#2c3e50' },
            text: { primary: '#2c3e50', secondary: '#607d8b' },
            divider: '#e0e0e0',
            success: { main: colorblindMode ? '#0288d1' : '#66bb6a' }, // Blue for colorblind, green otherwise
            error: { main: '#ef5350' },
          }
        : {
            // Dark Mode
            background: { default: '#0d1117', paper: '#161b22' },
            primary: { main: '#e0f2f7' },
            secondary: { main: '#e3b3ff' },
            text: { primary: '#ffffff', secondary: '#e0e0e0' },
            divider: '#30363d',
            success: { main: colorblindMode ? '#90caf9' : '#a5d6a7' }, // Light blue for colorblind, light green otherwise
            error: { main: '#ef9a9a' },
          }),
    },
    typography: {
      fontFamily: '"Inter", "Rubik", "Helvetica", "Arial", sans-serif',
      h1: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 700 },
      h2: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 600 },
      h3: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 600 },
      h4: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 600 },
      h5: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 600 },
      h6: { fontFamily: '"Merriweather", "Noto Serif", "Noto Serif Hebrew", "David", serif', fontWeight: 600 },
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
    }
  });
  theme = responsiveFontSizes(theme);
  return theme;
};
