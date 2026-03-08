import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation, Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Login } from './components/Login';
import { TransactionForm } from './components/NewTransaction';
import { PortfolioManager } from './components/PortfolioManager';
import { Dashboard } from './components/Dashboard';
import { ImportCSV } from './components/ImportCSV';
import { TickerDetails } from './components/TickerDetails';
import { ensureSchema, populateTestData, fetchTransactions, rebuildHoldingsSheet, getMetadataValue } from './lib/sheets/index';
import { initializeGapi, signOut, signIn } from './lib/google';
import {
  Box, AppBar, Toolbar, Typography, Container, Tabs, Tab, IconButton, CircularProgress,
  ThemeProvider, CssBaseline, Snackbar, Alert, ListItemIcon, ListItemText,
  Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Drawer, List, ListItem, ListItemButton, ListSubheader, Collapse, Divider
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import MenuIcon from '@mui/icons-material/Menu';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import LanguageIcon from '@mui/icons-material/Language';
import PaletteIcon from '@mui/icons-material/Palette';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getTheme } from './theme';
import { usePortfolios } from './lib/hooks';
import { exportDashboardData } from './lib/exporter';
import { clearAllCache } from './lib/fetching/utils/cache';

import { useLanguage } from './lib/i18n';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import rtlPlugin from 'stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { SessionProvider, useSession } from './lib/SessionContext';
import { ProfileForm, type UserFinancialProfile } from './components/ProfileForm';
import { setMetadataValue } from './lib/sheets/api';
import { ApiKeyDialog } from './components/ApiKeyDialog'; const ColorBlind = VisibilityOffIcon;

const tabMap: Record<string, number> = {
  '/dashboard': 0,
  '/ai': 0,
  '/transaction': 1,
  '/portfolios': 2,
};

const reverseTabMap: Record<number, string> = {
  0: '/dashboard',
  1: '/transaction',
  2: '/portfolios',
};

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
  const [refreshKey, setRefreshKey] = useState(0); 
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<'light' | 'dark'>(() => (localStorage.getItem('themeMode') as 'light' | 'dark') || 'light');
  const [rebuilding, setRebuilding] = useState(false);
  const { isSessionExpired, hideLoginModal } = useSession();
  const [schemaVersionMismatch, setSchemaVersionMismatch] = useState<'old' | 'new' | null>(null);
  const [colorblindMode, setColorblindMode] = useState<boolean>(() => localStorage.getItem('colorblindMode') === 'true');
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);

  const { t, toggleLanguage, language, isRtl } = useLanguage();
  const theme = useMemo(() => getTheme(mode, isRtl ? 'rtl' : 'ltr', colorblindMode), [mode, isRtl, colorblindMode]);
  const location = useLocation();
  const navigate = useNavigate();

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('info');
  const [snackbarAction, setSnackbarAction] = useState<React.ReactNode | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('import') === 'true') {
      setImportOpen(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('import');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [exportCollapseOpen, setExportCollapseOpen] = useState(false);

  const [openProfile, setOpenProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserFinancialProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (sheetId && openProfile && !userProfile.age) {
      setLoadingProfile(true);
      getMetadataValue(sheetId, 'user_financial_profile')
        .then(val => {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              setUserProfile(parsed);
            } catch (e) {
              console.error("Failed to parse user profile", e);
            }
          }
        })
        .catch(e => console.error("Failed to load user profile", e))
        .finally(() => setLoadingProfile(false));
    }
  }, [sheetId, openProfile, userProfile.age]);

  const handleSaveProfile = async (profile: UserFinancialProfile) => {
    if (!sheetId) return;
    setSavingProfile(true);
    try {
      await setMetadataValue(sheetId, 'user_financial_profile', JSON.stringify(profile));
      setUserProfile(profile);
      setOpenProfile(false);
      setSnackbarMessage(t('Profile saved!', 'הפרופיל נשמר!'));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error("Failed to save profile", e);
      setSnackbarMessage(t('Failed to save profile', 'שמירת הפרופיל נכשלה'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMenuAnchorEl(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchorEl(null);
  };

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const toggleColorblindMode = () => {
    setColorblindMode(prev => !prev);
  };

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('colorblindMode', String(colorblindMode));
  }, [colorblindMode]);

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
      setRefreshKey(k => k + 1);
      setSchemaVersionMismatch(null);
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
        console.warn("GAPI init failed or timed out", e);
        if (mounted) setGoogleReady(false);
        setSheetId(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSnackbarClose = (_?: any, reason?: string) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
    setSnackbarAction(null);
  };

  const handleReconnect = async () => {
    try {
      await signIn();
      hideLoginModal();
      window.location.reload();
    } catch (e) {
      console.error("Failed to reconnect", e);
      setSnackbarMessage(t('Failed to sign in. Please try again.', 'ההתחברות נכשלה. אנא נסה שנית.'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const [exportInProgress, setExportInProgress] = useState(false);

  // Load portfolios globally so TickerDetails can access them
  const { portfolios } = usePortfolios(sheetId, refreshKey);

  const locationState = location.state as { background?: { pathname: string } } | null;
  const effectivePathname = locationState?.background?.pathname || location.pathname;
  const currentBasePath = '/' + effectivePathname.split('/')[1];
  const currentTab = tabMap[currentBasePath] ?? 0;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    navigate(reverseTabMap[newValue]);
  };

  const renderMobileMenu = (
    <Drawer
      anchor="right"
      open={Boolean(mobileMenuAnchorEl)}
      onClose={handleMobileMenuClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 300,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{t('Navigation', 'ניווט')}</Typography>
        <IconButton onClick={handleMobileMenuClose}>
          <ExpandMore sx={{ transform: isRtl ? 'rotate(90deg)' : 'rotate(-90deg)' }} />
        </IconButton>
      </Box>
      <Divider />

      <List
        sx={{ width: '100%', py: 0 }}
      >
        <ListItem disablePadding>
          <ListItemButton onClick={() => { navigate('/ai'); handleMobileMenuClose(); }}>
            <ListItemIcon><AutoAwesomeIcon color="primary" /></ListItemIcon>
            <ListItemText primary={t('AI Assistant', 'עוזר AI')} />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={() => { setOpenProfile(true); handleMobileMenuClose(); }}>
            <ListItemIcon><ManageAccountsIcon /></ListItemIcon>
            <ListItemText primary={t('Personal Info', 'מידע אישי')} />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={toggleLanguage}>
            <ListItemIcon><LanguageIcon /></ListItemIcon>
            <ListItemText primary={language === 'en' ? 'עברית' : 'English'} />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => setAppearanceOpen(!appearanceOpen)}>
            <ListItemIcon><PaletteIcon /></ListItemIcon>
            <ListItemText primary={t('Appearance', 'מראה')} />
            {appearanceOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={appearanceOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 4 }}>
              <ListItemButton onClick={toggleColorMode}>
                <ListItemIcon sx={{ minWidth: 40 }}>{mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}</ListItemIcon>
                <ListItemText
                  primary={mode === 'light' ? t('Switch to Dark Mode', 'עבור למצב כהה') : t('Switch to Light Mode', 'עבור למצב בהיר')}
                  primaryTypographyProps={{ fontSize: '0.85rem' }}
                />
              </ListItemButton>
              <ListItemButton onClick={toggleColorblindMode}>
                <ListItemIcon sx={{ minWidth: 40 }}><ColorBlind fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary={colorblindMode ? t('Disable Colorblind Mode', 'בטל מצב עיוורון צבעים') : t('Enable Colorblind Mode', 'הפעל מצב עיוורון צבעים')}
                  primaryTypographyProps={{ fontSize: '0.85rem' }}
                />
              </ListItemButton>
            </List>
          </Collapse>
        </ListItem>
      </List>

      <Divider sx={{ my: 1 }} />

      <List
        sx={{ width: '100%', py: 0 }}
        subheader={<ListSubheader sx={{ bgcolor: 'transparent', fontWeight: 700, lineHeight: '32px' }}>{t('Data Management', 'ניהול נתונים')}</ListSubheader>}
      >
        <ListItem disablePadding>
          <ListItemButton onClick={() => { setImportOpen(true); handleMobileMenuClose(); }}>
            <ListItemIcon><CloudUploadIcon /></ListItemIcon>
            <ListItemText primary={t('Import Transactions', 'ייבוא עסקאות')} />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => setExportCollapseOpen(!exportCollapseOpen)}>
            <ListItemIcon><FileDownloadIcon /></ListItemIcon>
            <ListItemText primary={t('Export Data', 'ייצוא נתונים')} />
            {exportCollapseOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={exportCollapseOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 4 }}>
              <ListItemButton disabled={exportInProgress} onClick={() => {
                handleMobileMenuClose();
                exportDashboardData({
                  type: 'holdings',
                  format: 'csv',
                  sheetId: sheetId || undefined,
                  setLoading: setExportInProgress,
                  onSuccess: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('success'); setSnackbarOpen(true); setExportInProgress(false);
                  },
                  onError: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false);
                  }
                });
              }}>
                <ListItemText primary={t('Holdings (CSV)', 'החזקות (CSV)')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton disabled={exportInProgress} onClick={() => {
                handleMobileMenuClose();
                exportDashboardData({
                  type: 'holdings',
                  format: 'sheet',
                  sheetId: sheetId || undefined,
                  setLoading: setExportInProgress,
                  onSuccess: (msg: string, url?: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('success');
                    if (url) setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                    setSnackbarOpen(true); setExportInProgress(false);
                  },
                  onError: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false);
                  }
                });
              }}>
                <ListItemText primary={t('Holdings (Google Sheet)', 'החזקות (Sheet)')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton disabled={exportInProgress} onClick={() => {
                handleMobileMenuClose();
                exportDashboardData({
                  type: 'transactions',
                  format: 'csv',
                  sheetId: sheetId || undefined,
                  setLoading: setExportInProgress,
                  onSuccess: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('success'); setSnackbarOpen(true); setExportInProgress(false);
                  },
                  onError: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false);
                  }
                });
              }}>
                <ListItemText primary={t('Transactions (CSV)', 'עסקאות (CSV)')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton disabled={exportInProgress} onClick={() => {
                handleMobileMenuClose();
                exportDashboardData({
                  type: 'transactions',
                  format: 'sheet',
                  sheetId: sheetId || undefined,
                  setLoading: setExportInProgress,
                  onSuccess: (msg: string, url?: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('success');
                    if (url) setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                    setSnackbarOpen(true); setExportInProgress(false);
                  },
                  onError: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false);
                  }
                });
              }}>
                <ListItemText primary={t('Transactions (Google Sheet)', 'עסקאות (Sheet)')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton disabled={exportInProgress} onClick={() => {
                handleMobileMenuClose();
                exportDashboardData({
                  type: 'both',
                  format: 'sheet',
                  sheetId: sheetId || undefined,
                  setLoading: setExportInProgress,
                  onSuccess: (msg: string, url?: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('success');
                    if (url) setSnackbarAction(<Button color="inherit" size="small" onClick={() => window.open(url, '_blank')}>Open Sheet</Button>);
                    setSnackbarOpen(true); setExportInProgress(false);
                  },
                  onError: (msg: string) => {
                    setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false);
                  }
                });
              }}>
                <ListItemText primary={t('Export All (to Sheet)', 'ייצוא הכל (לגיליון)')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>
            </List>
          </Collapse>
        </ListItem>
      </List>

      <Divider sx={{ my: 1 }} />

      <List
        sx={{ width: '100%', py: 0 }}
      >
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => setAdvancedOpen(!advancedOpen)}>
            <ListItemIcon><SettingsIcon /></ListItemIcon>
            <ListItemText primary={t('Advanced Tools', 'כלים מתקדמים')} />
            {advancedOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={advancedOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 4 }}>
              <ListItemButton onClick={() => { openSheet(); handleMobileMenuClose(); }}>
                <ListItemIcon sx={{ minWidth: 40 }}><OpenInNewIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('Open Google Sheet', 'פתח גיליון Google')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton onClick={() => { handleSetupSheet(); handleMobileMenuClose(); }} disabled={rebuilding}>
                <ListItemIcon sx={{ minWidth: 40 }}>{rebuilding ? <CircularProgress size={18} /> : <BuildIcon fontSize="small" />}</ListItemIcon>
                <ListItemText primary={t('Setup Sheet', 'הגדרות גיליון')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton onClick={() => { setApiKeyDialogOpen(true); handleMobileMenuClose(); }}>
                <ListItemIcon sx={{ minWidth: 40 }}><VpnKeyIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('AI Studio API Key', 'מפתח ה-API של AI Studio')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              <ListItemButton onClick={() => {
                if (confirm(t('This will clear all locally cached market data. Your session will be preserved. Continue?', 'נקה את כל המידע המאוחסן מקומית. החיבור שלך יישמר. להמשיך?'))) {
                  clearAllCache().then(() => window.location.reload());
                }
                handleMobileMenuClose();
              }}>
                <ListItemIcon sx={{ minWidth: 40 }}><DeleteSweepIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={t('Clear Cache', 'נקה מטמון')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </ListItemButton>

              {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <ListItemButton onClick={() => { handlePopulateTestData(); handleMobileMenuClose(); }}>
                  <ListItemIcon sx={{ minWidth: 40 }}><BuildIcon fontSize="small" sx={{ opacity: 0.5 }} /></ListItemIcon>
                  <ListItemText primary={t('Populate Test Data', 'מלא נתוני בדיקה')} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                </ListItemButton>
              )}
            </List>
          </Collapse>
        </ListItem>
      </List>

      <Box sx={{ flexGrow: 1 }} />
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={() => { handleLogout(); handleMobileMenuClose(); }}>
            <ListItemIcon><LogoutIcon color="error" /></ListItemIcon>
            <ListItemText primary={t('Logout', 'יציאה')} sx={{ color: 'error.main' }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
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
          <AppBar position="sticky" color="inherit" elevation={0} sx={{
            borderBottom: 1,
            borderColor: 'divider',
            backdropFilter: 'blur(12px)',
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            boxShadow: 'none',
            zIndex: (theme) => theme.zIndex.drawer + 1,
            transition: 'all 0.3s ease'
          }}>
            <Toolbar sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' }, gap: { xs: 1, sm: 0 }, py: { xs: 1, sm: 0.5 } }}>
              <Typography variant="h5" component="div" sx={{
                flexGrow: 0, flexShrink: 1, minWidth: 0,
                color: 'text.primary',
                fontWeight: 800,
                letterSpacing: '-0.5px',
                mr: { xs: 1, sm: 4 },
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 140, sm: 'none' }
              }}>
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
                  aria-label="open drawer"
                  onClick={handleMobileMenuOpen}
                  color="inherit"
                >
                  <MenuIcon />
                </IconButton>
              </Box>
            </Toolbar>
          </AppBar>

          {renderMobileMenu}

          {openProfile && (
            <ProfileForm
              open={openProfile}
              initialProfile={userProfile}
              loadingProfile={loadingProfile}
              displayCurrency={localStorage.getItem('displayCurrency') || 'USD'}

              onSave={handleSaveProfile}
              onCancel={() => setOpenProfile(false)}
              savingProfile={savingProfile}
            />
          )}

          <Container maxWidth="xl" sx={{ mt: 5, pb: 8 }}>
            {sheetId && (
              <>
                <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
                  <Dashboard sheetId={sheetId} key={`dash_${refreshKey}`} />
                </Box>
                <Box sx={{ display: currentTab === 1 ? 'block' : 'none' }}>
                  <TransactionForm
                    sheetId={sheetId}
                    refreshTrigger={refreshKey}
                    onSaveSuccess={(msg, undoCb) => {
                      setRefreshKey(k => k + 1);
                      setSnackbarMessage(msg || t('Transaction saved!', 'העסקה נשמרה!'));
                      setSnackbarSeverity('success');
                      setSnackbarAction(undoCb ? (
                        <Button color="inherit" size="small" onClick={() => { undoCb(); setSnackbarOpen(false); }}>
                          {t('Undo', 'בטל')}
                        </Button>
                      ) : null);
                      setSnackbarOpen(true);
                    }}
                  />
                </Box>

                <Routes>
                  <Route path="/dashboard" element={null} />
                  <Route path="/ai" element={null} />
                  <Route path="/favorites" element={null} />
                  <Route path="/transaction" element={null} />
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

          <Dialog open={isSessionExpired} onClose={() => { }}>
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

          <Dialog open={!!schemaVersionMismatch} onClose={() => { }}>
            <DialogTitle>{schemaVersionMismatch === 'old' ? t('Sheet Structure Update Required', 'נדרש עדכון מבנה גיליון') : t('Sheet Structure Mismatch', 'אי-התאמה במבנה הגיליון')}</DialogTitle>
            <DialogContent>
              {rebuilding ? (
                <Box display="flex" flexDirection="column" alignItems="center" py={2}>
                  <CircularProgress size={40} sx={{ mb: 2 }} />
                  <DialogContentText align="center">
                    {t('Updating spreadsheet structure and formulas...', 'מעדכן מבנה גיליון ונוסחאות...')}<br />
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

          {sheetId && (
            <ApiKeyDialog
              open={apiKeyDialogOpen}
              onClose={() => setApiKeyDialogOpen(false)}
              sheetId={sheetId}
            />
          )}

        </Box>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default App;