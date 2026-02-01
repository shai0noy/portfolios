import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { Login } from './components/Login';
import { TransactionForm } from './components/NewTransaction';
import { PortfolioManager } from './components/PortfolioManager';
import { Dashboard } from './components/Dashboard';
import { ImportCSV } from './components/ImportCSV';
import { TickerDetails } from './components/TickerDetails';
import { ensureSchema, populateTestData, fetchTransactions, rebuildHoldingsSheet, getMetadataValue, SHEET_STRUCTURE_VERSION_DATE } from './lib/sheets/index';
import { initializeGapi, signOut, signIn } from './lib/google';
import { Box, AppBar, Toolbar, Typography, Container, Tabs, Tab, IconButton, CircularProgress, ThemeProvider, CssBaseline, Menu, MenuItem, Snackbar, Alert, ListItemIcon, ListItemText, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import MenuIcon from '@mui/icons-material/Menu';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ColorBlind from '@mui/icons-material/VisibilityOff';
import { getTheme } from './theme';
import { usePortfolios } from './lib/hooks'; // Assuming we'll create this hook or reuse existing logic
import { exportDashboardData } from './lib/exporter';
import { clearAllCache } from './lib/fetching/utils/cache';

import { useLanguage } from './lib/i18n';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import rtlPlugin from 'stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { SessionProvider, useSession } from './lib/SessionContext';

const tabMap: Record<string, number> = {
  '/dashboard': 0,
  '/transaction': 1,
  '/portfolios': 2,
};

const reverseTabMap: Record<number, string> = {
  0: '/dashboard',
  1: '/transaction',
  2: '/portfolios',
};

// Create rtl cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
  key: 'muiltr',
});

function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}
function AppContent() {
  const [sheetId, setSheetId] = useState<string | null>(() => {
    const saved = localStorage.getItem('g_sheet_id');
    return saved === 'null' ? null : saved;
  });
  const [refreshKey, setRefreshKey] = useState(0); // Trigger to reload data
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<'light' | 'dark'>(() => (localStorage.getItem('themeMode') as 'light' | 'dark') || 'light');
  const [rebuilding, setRebuilding] = useState(false);
  const { isSessionExpired, hideLoginModal } = useSession();
  const [schemaVersionMismatch, setSchemaVersionMismatch] = useState<'old' | 'new' | null>(null);
  const [colorblindMode, setColorblindMode] = useState<boolean>(() => localStorage.getItem('colorblindMode') === 'true');

  const { t, toggleLanguage, language, isRtl } = useLanguage();
  const theme = useMemo(() => getTheme(mode, isRtl ? 'rtl' : 'ltr', colorblindMode), [mode, isRtl, colorblindMode]);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let scrollTimer: number | null = null;
    const handleScroll = () => {
      document.body.classList.add('scrolling');
      if (scrollTimer !== null) {
        window.clearTimeout(scrollTimer);
      }
      scrollTimer = window.setTimeout(() => {
        document.body.classList.remove('scrolling');
      }, 3000); // Remove class after 3s of no scrolling
    };

    window.addEventListener('scroll', handleScroll, true); // Use capture phase

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (scrollTimer !== null) {
        window.clearTimeout(scrollTimer);
      }
    };
  }, []);

  // Listen for import=true in query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('import') === 'true') {
      setImportOpen(true);
      // Clean up the URL
      params.delete('import');
      const newSearch = params.toString();
      navigate({ pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' }, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  // Load portfolios globally so TickerDetails can access them
  const { portfolios } = usePortfolios(sheetId, refreshKey);

  const locationState = location.state as { background?: { pathname: string } } | null;
  const effectivePathname = locationState?.background?.pathname || location.pathname;
  const currentBasePath = '/' + effectivePathname.split('/')[1];
  const currentTab = tabMap[currentBasePath] ?? 0;

  useEffect(() => {
    if (!location.pathname || location.pathname === '/') {
      navigate('/dashboard');
    }
  }, [location.pathname, navigate]);

  // Load Rubik font for better Hebrew readability
  useEffect(() => {
    const link = document.createElement('link');
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:wght@300;400;700;900&family=Noto+Serif:wght@300;400;500;700&family=Noto+Serif+Hebrew:wght@300;400;700&family=Rubik:wght@300;400;500;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${mode}`);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('colorblindMode', String(colorblindMode));
  }, [colorblindMode]);

  useEffect(() => {
    if (sheetId && googleReady) {
      getMetadataValue(sheetId, 'schema_created').then(val => {
         if (!val) {
             setSchemaVersionMismatch('old');
             return;
         }
         const sheetDate = new Date(val);
         const codeDate = new Date(SHEET_STRUCTURE_VERSION_DATE);
         
         if (isNaN(sheetDate.getTime())) {
             setSchemaVersionMismatch('old');
             return;
         }

         sheetDate.setHours(0,0,0,0);
         codeDate.setHours(0,0,0,0);

         if (sheetDate < codeDate) {
             setSchemaVersionMismatch('old');
         } else if (sheetDate > codeDate) {
             setSchemaVersionMismatch('new');
         }
      }).catch(e => console.warn("Failed to check schema version", e));
    }
  }, [sheetId, googleReady]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    navigate(reverseTabMap[newValue]);
  };

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const handleLogout = () => {
    signOut();
    setSheetId(null);
  };

  const handleSetupSheet = async () => {
    if (!sheetId) return;
    if (!schemaVersionMismatch && !confirm(t("This will reset sheet headers and rebuild all live data formulas. This can fix issues but is a heavy operation. Are you sure?", "פעולה זו תאפס את כותרות הגיליון ותבנה מחדש את כל הנוסחאות. זוהי פעולה כבדה. האם אתה בטוח?"))) return;
    
    setRebuilding(true);
    try {
      await ensureSchema(sheetId);
      await fetchTransactions(sheetId);
      await rebuildHoldingsSheet(sheetId);
      setRefreshKey(k => k + 1); // Refresh dashboard
      setSchemaVersionMismatch(null); // Clear warning
      setSnackbarMessage(t("Sheet setup complete. Headers and live data have been rebuilt.", "הגדרת הגיליון הושלמה. הכותרות והנתונים החיים נבנו מחדש."));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error(e);
      setSnackbarMessage(t("Error during sheet setup: ", "שגיאה בהגדרת הגיליון: ") + (e instanceof Error ? e.message : String(e)));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRebuilding(false);
    }
  };

  const handlePopulateTestData = async () => {
    if (!sheetId) return;
    if (!confirm(t('Populate sheet with test portfolios and sample transactions?', 'האם למלא את הגיליון בתיקי בדיקה ועסקאות לדוגמה?'))) return;
    try {
      await populateTestData(sheetId);
      setRefreshKey(k => k + 1);
      setSchemaVersionMismatch(null);
      alert(t('Test data populated (if not already present).', 'נתוני בדיקה מולאו (אם לא היו קיימים).'));
    } catch (e) {
      console.error(e);
      alert(t('Failed to populate test data: ', 'נכשל מילוי נתוני בדיקה: ') + (e instanceof Error ? e.message : String(e)));
    }
  };

  const openSheet = () => {
    if (sheetId) window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank');
  };

  const handleLogin = (sid: string) => {
    setSheetId(sid);
    setGoogleReady(true);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initializeGapi();
        if (mounted) setGoogleReady(true);
      } catch (e) {
        if (mounted) setGoogleReady(false);
        setSheetId(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [exportMenuAnchorElApp, setExportMenuAnchorElApp] = useState<null | HTMLElement>(null);
  const [exportInProgress, setExportInProgress] = useState(false);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('info');
  const [snackbarAction, setSnackbarAction] = useState<React.ReactNode | null>(null);

  const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = useState<null | HTMLElement>(null);
  const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

  const handleMobileMenuClose = () => {
    setMobileMoreAnchorEl(null);
  };

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMoreAnchorEl(event.currentTarget);
  };

  const handleSnackbarClose = (_?: any, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
    setSnackbarAction(null); // Clear action on close
  };

  const toggleColorblindMode = () => {
    setColorblindMode(prev => !prev);
  };

  const handleReconnect = async () => {
    try {
      await signIn();
      hideLoginModal();
      window.location.reload(); // Force a full reload to refresh all data and states
    } catch (e) {
      console.error("Failed to reconnect", e);
      setSnackbarMessage(t('Failed to sign in. Please try again.', 'ההתחברות נכשלה. אנא נסה שנית.'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const mobileMenuId = 'primary-search-account-menu-mobile';
  const renderMobileMenu = (
    <Menu
      anchorEl={mobileMoreAnchorEl}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      id={mobileMenuId}
      keepMounted
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      open={isMobileMenuOpen}
      onClose={handleMobileMenuClose}
    >
      <MenuItem onClick={toggleColorMode}>
        <ListItemIcon>
          {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
        </ListItemIcon>
        <ListItemText>{t('Switch Theme', 'מצב בהיר/כהה')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={toggleColorblindMode}>
        <ListItemIcon>
          <ColorBlind fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Colorblind Mode', 'מצב עיוורון צבעים')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={toggleLanguage}>
        <ListItemIcon>
          <Typography variant="button" sx={{ fontWeight: 700, fontSize: '0.85rem', ml: 0.3, mt: '3px' }}>
            {language === 'en' ? 'He' : 'En'}
          </Typography>
        </ListItemIcon>
        <ListItemText>{t("הצג בעברית", "Switch to English")}</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { setImportOpen(true); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <CloudUploadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Import Transactions', 'ייבוא עסקאות')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={(e) => { setExportMenuAnchorElApp(e.currentTarget); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <FileDownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Export Data', 'ייצוא נתונים')}</ListItemText>
      </MenuItem>
      {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
        <MenuItem onClick={() => { handlePopulateTestData(); handleMobileMenuClose(); }}>
          <ListItemIcon>
            <BuildIcon fontSize="small" sx={{ opacity: 0.5 }} />
          </ListItemIcon>
          <ListItemText>{t('Populate Test Data', 'מלא נתוני בדיקה')}</ListItemText>
        </MenuItem>
      )}
      <MenuItem onClick={() => { openSheet(); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <OpenInNewIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Open Google Sheet', 'פתח גיליון Google')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { handleSetupSheet(); handleMobileMenuClose(); }} disabled={rebuilding}>
        <ListItemIcon>
          {rebuilding ? <CircularProgress size={20} /> : <BuildIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText>{t('Setup Sheet', 'הגדרות גיליון')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { 
        if (confirm(t('This will clear all locally cached market data (prices, history, ticker lists). Your session and settings will be preserved. Continue?', 'פעולה זו תנקה את כל המידע המאוחסן מקומית (מחירים, היסטוריה, רשימות ניירות). החיבור וההגדרות שלך יישמרו. להמשיך?'))) {
          clearAllCache().then(() => window.location.reload()); 
        }
        handleMobileMenuClose(); 
      }}>
        <ListItemIcon>
          <DeleteSweepIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Clear Cache', 'נקה מטמון')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { handleLogout(); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t('Logout', 'יציאה')}</ListItemText>
      </MenuItem>
    </Menu>
  );

  if (googleReady === null) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh"><CircularProgress /></Box>;
  }

  if (!sheetId || googleReady === false) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <CacheProvider value={isRtl ? cacheRtl : cacheLtr}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' }, gap: { xs: 1, sm: 0 } }}>
            <AccountBalanceWalletIcon sx={{ color: 'primary.main', mr: 1.5 }} />
            <Typography variant="h5" component="div" sx={{ flexGrow: 0, flexShrink: 1, minWidth: 0, color: 'text.primary', fontWeight: 700, letterSpacing: '-0.5px', mr: { xs: 1, sm: 4 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 140, sm: 'none' } }}>
              {t('My Portfolios', 'My Portfolios')}
            </Typography>
            
            <Tabs value={currentTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ flexGrow: 1, minWidth: 0 }}>
              <Tab label={t("Dashboard", "דאשבורד")} sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 64 }} component={RouterLink} to="/dashboard" />
              <Tab label={t("Add Trade", "הוסף עסקה")} sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 64 }} component={RouterLink} to="/transaction" />
              <Tab label={t("Manage Portfolios", "ניהול תיקים")} sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 80 }} component={RouterLink} to="/portfolios" />
            </Tabs>

            <Box sx={{ display: 'flex' }}>
              <IconButton
                size="large"
                aria-label="show more"
                aria-controls={mobileMenuId}
                aria-haspopup="true"
                onClick={handleMobileMenuOpen}
                color="inherit"
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>
        {renderMobileMenu}

        <Menu
          id="app-export-menu"
          anchorEl={exportMenuAnchorElApp}
          open={Boolean(exportMenuAnchorElApp)}
          onClose={() => setExportMenuAnchorElApp(null)}
        >
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({ type: 'holdings', format: 'csv', sheetId, setLoading: setExportInProgress, onSuccess: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('success'); setSnackbarOpen(true); setExportInProgress(false); }, onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false); } });
          }}>{t('Holdings (CSV)', 'החזקות (CSV)')}</MenuItem>
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({
              type: 'holdings', format: 'sheet', sheetId, setLoading: setExportInProgress, 
              onSuccess: (msg, url) => {
                setSnackbarMessage(msg);
                setSnackbarSeverity('success');
                setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                setSnackbarOpen(true);
                setExportInProgress(false); 
              },
              onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarAction(null); setSnackbarOpen(true); setExportInProgress(false); }
            });
          }}>{t('Holdings (Google Sheet)', 'החזקות (Google Sheet)')}</MenuItem>
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({ type: 'transactions', format: 'csv', sheetId, setLoading: setExportInProgress, onSuccess: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('success'); setSnackbarOpen(true); setExportInProgress(false); }, onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false); } });
          }}>{t('Transactions (CSV)', 'עסקאות (CSV)')}</MenuItem>
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({
              type: 'transactions', format: 'sheet', sheetId, setLoading: setExportInProgress, 
              onSuccess: (msg, url) => {
                setSnackbarMessage(msg);
                setSnackbarSeverity('success');
                setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                setSnackbarOpen(true);
                setExportInProgress(false); 
              },
              onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarAction(null); setSnackbarOpen(true); setExportInProgress(false); }
            });
          }}>{t('Transactions (Google Sheet)', 'עסקאות (Google Sheet)')}</MenuItem>
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({
              type: 'both', format: 'sheet', sheetId, setLoading: setExportInProgress, 
              onSuccess: (msg, url) => {
                setSnackbarMessage(msg);
                setSnackbarSeverity('success');
                setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                setSnackbarOpen(true);
                setExportInProgress(false); 
              },
              onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarAction(null); setSnackbarOpen(true); setExportInProgress(false); }
            });
          }}>{t('Export transactions & holdings (to Sheet)', 'ייצוא הכל (לגיליון)')}</MenuItem>
        </Menu>
        
        <Container maxWidth="xl" sx={{ mt: 5, pb: 8 }}>
          {sheetId && (
            <>
              <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
                <Dashboard sheetId={sheetId} key={refreshKey} />
              </Box>
              <Box sx={{ display: currentTab === 1 ? 'block' : 'none' }}>
                <TransactionForm 
                  sheetId={sheetId} 
                  refreshTrigger={refreshKey}
                  onSaveSuccess={() => {
                    setRefreshKey(k => k + 1);
                    setSnackbarMessage('Transaction saved! Dashboard is refreshing...');
                    setSnackbarSeverity('success');
                    setSnackbarOpen(true);
                  }} 
                />
              </Box>
      
              {/* Routes for components that should not be hidden, but mounted on navigation */}
              <Routes>
                <Route path="/dashboard" element={null} /> {/* Dummy route */}
                <Route path="/transaction" element={null} /> {/* Dummy route */}
                <Route path="/portfolios" element={<PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />} />
                <Route path="/portfolios/:portfolioId" element={<PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />} />
                <Route path="/ticker/:exchange/:ticker" element={<TickerDetails sheetId={sheetId} portfolios={portfolios} />} />
              </Routes>
            </>
          )}
        </Container>
  
        {importOpen && (
          <ImportCSV 
            sheetId={sheetId} 
            open={importOpen} 
            onClose={() => setImportOpen(false)} 
            onSuccess={() => { setRefreshKey(k => k + 1); setImportOpen(false); }} 
          />
        )}

        <Snackbar open={snackbarOpen} autoHideDuration={10000} onClose={handleSnackbarClose}>
          <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }} action={snackbarAction}>
            {snackbarMessage}
          </Alert>
        </Snackbar>

        <Dialog open={isSessionExpired} onClose={() => {}}>
          <DialogTitle>{t('Session Expired', 'הפעלתך פגה')}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {t('Your session has expired. Please sign in again to continue.', 'הפעלתך פגה. אנא התחבר מחדש כדי להמשיך.')}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
             <Button onClick={handleReconnect} variant="contained" color="primary" autoFocus>
                {t('Sign In', 'התחבר')}
             </Button>
          </DialogActions>
        </Dialog>

        {/* Schema Version Dialog */}
        <Dialog open={!!schemaVersionMismatch} onClose={() => {}}>
          <DialogTitle>{schemaVersionMismatch === 'old' ? t('Sheet Structure Update Required', 'נדרש עדכון מבנה גיליון') : t('Sheet Structure Mismatch', 'אי-התאמה במבנה הגיליון')}</DialogTitle>
          <DialogContent>
            {rebuilding ? (
              <Box display="flex" flexDirection="column" alignItems="center" py={2}>
                <CircularProgress size={40} sx={{ mb: 2 }} />
                <DialogContentText align="center">
                  {t('Updating spreadsheet structure and formulas...', 'מעדכן מבנה גיליון ונוסחאות...')}<br/>
                  {t('Please wait, this may take a few moments.', 'אנא המתן, זה עשוי לקחת מספר רגעים.')}
                </DialogContentText>
              </Box>
            ) : (
              <DialogContentText>
                {schemaVersionMismatch === 'old' 
                  ? t("Your Google Sheet structure is outdated. A new version of the application requires schema updates to function correctly.", "מבנה הגיליון שלך מיושן. גרסה חדשה של האפליקציה דורשת עדכוני סכמה כדי לפעול כראוי.")
                  : t("Warning: Your Google Sheet's structure version is newer than this application's version. This is an unexpected situation and may cause parts of the app to not function as expected. Please consider updating the application.", "אזהרה: גרסת מבנה הגיליון שלך חדשה יותר מגרסת האפליקציה. זהו מצב לא צפוי ועשוי לגרום לחלקים מהאפליקציה לא לפעול כצפוי.")}
                <br /><br />
                {schemaVersionMismatch === 'old' && t("Please perform a 'Setup Sheet' to upgrade the columns and formulas. This will rewrite headers and rebuild live data, but your transaction history is safe (unless columns were removed).", "אנא בצע 'הגדרת גיליון' כדי לשדרג את העמודות והנוסחאות. פעולה זו תכתוב מחדש כותרות ותבנה מחדש נתונים חיים, אך היסטוריית העסקאות שלך בטוחה.")}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSchemaVersionMismatch(null)} color="primary" disabled={rebuilding}>
              {schemaVersionMismatch === 'old' ? t('Ignore (Risky)', 'התעלם (מסוכן)') : t('Acknowledge', 'אישור')}
            </Button>
            {schemaVersionMismatch === 'old' && (
              <Button onClick={handleSetupSheet} variant="contained" color="primary" autoFocus disabled={rebuilding}>
                {rebuilding ? t("Updating...", "מעדכן...") : t("Setup Sheet (Upgrade)", "הגדרת גיליון (שדרוג)")}
              </Button>
            )}
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
    </CacheProvider>
  );
}

export default App;