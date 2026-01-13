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
import { SessionExpiredError } from './lib/errors';
import { Box, AppBar, Toolbar, Typography, Container, Tabs, Tab, IconButton, Tooltip, CircularProgress, ThemeProvider, CssBaseline, Menu, MenuItem, Snackbar, Alert, ListItemIcon, ListItemText, Button, Modal, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import MenuIcon from '@mui/icons-material/Menu';
import { getTheme } from './theme';
import { exportDashboardData } from './lib/exporter';

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

function App() {
  const [sheetId, setSheetId] = useState<string | null>(() => {
    const saved = localStorage.getItem('g_sheet_id');
    return saved === 'null' ? null : saved;
  });
  const [refreshKey, setRefreshKey] = useState(0); // Trigger to reload data
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<'light' | 'dark'>(() => (localStorage.getItem('themeMode') as 'light' | 'dark') || 'light');
  const [rebuilding, setRebuilding] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [schemaVersionMismatch, setSchemaVersionMismatch] = useState<'old' | 'new' | null>(null);

  const theme = useMemo(() => getTheme(mode), [mode]);
  const location = useLocation();
  const navigate = useNavigate();

  const currentBasePath = '/' + location.pathname.split('/')[1];
  const currentTab = tabMap[currentBasePath] ?? 0;

  useEffect(() => {
    if (!location.pathname || location.pathname === '/') {
      navigate('/dashboard');
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

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
    if (!schemaVersionMismatch && !confirm("This will reset sheet headers and rebuild all live data formulas. This can fix issues but is a heavy operation. Are you sure?")) return;
    
    setRebuilding(true);
    try {
      await ensureSchema(sheetId);
      await fetchTransactions(sheetId);
      await rebuildHoldingsSheet(sheetId);
      setRefreshKey(k => k + 1); // Refresh dashboard
      setSchemaVersionMismatch(null); // Clear warning
      setSnackbarMessage("Sheet setup complete. Headers and live data have been rebuilt.");
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (e) {
      console.error(e);
      setSnackbarMessage("Error during sheet setup: " + (e instanceof Error ? e.message : String(e)));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRebuilding(false);
    }
  };

  const handlePopulateTestData = async () => {
    if (!sheetId) return;
    if (!confirm('Populate sheet with test portfolios and sample transactions?')) return;
    try {
      await populateTestData(sheetId);
      setRefreshKey(k => k + 1);
      setSchemaVersionMismatch(null);
      alert('Test data populated (if not already present).');
    } catch (e) {
      console.error(e);
      alert('Failed to populate test data: ' + (e instanceof Error ? e.message : String(e)));
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

  useEffect(() => {
    const handleErrors = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof SessionExpiredError) {
        setSessionExpired(true);
      }
    };
    window.addEventListener('unhandledrejection', handleErrors);
    return () => {
      window.removeEventListener('unhandledrejection', handleErrors);
    };
  }, []);

  const handleReconnect = async () => {
    try {
      await signIn();
      setSessionExpired(false);
      setRefreshKey(k => k + 1); // Refresh data
    } catch (e) {
      console.error("Failed to reconnect", e);
      setSnackbarMessage('Failed to sign in. Please try again.');
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
        <ListItemText>Switch Theme</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { setImportOpen(true); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <CloudUploadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Import Transactions</ListItemText>
      </MenuItem>
      <MenuItem onClick={(e) => { setExportMenuAnchorElApp(e.currentTarget); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <FileDownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Export Data</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { openSheet(); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <OpenInNewIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Open Google Sheet</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { handleSetupSheet(); handleMobileMenuClose(); }} disabled={rebuilding}>
        <ListItemIcon>
          {rebuilding ? <CircularProgress size={20} /> : <BuildIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText>Setup Sheet</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => { handleLogout(); handleMobileMenuClose(); }}>
        <ListItemIcon>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Logout</ListItemText>
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' }, gap: { xs: 1, sm: 0 } }}>
            <AccountBalanceWalletIcon sx={{ color: 'primary.main', mr: 1.5 }} />
            <Typography variant="h5" component="div" sx={{ flexGrow: 0, flexShrink: 1, minWidth: 0, color: 'text.primary', fontWeight: 700, letterSpacing: '-0.5px', mr: { xs: 1, sm: 4 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 140, sm: 'none' } }}>
              My Portfolios
            </Typography>
            
            <Tabs value={currentTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ flexGrow: 1, minWidth: 0 }}>
              <Tab label="Dashboard" sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 64 }} component={RouterLink} to="/dashboard" />
              <Tab label="Add Trade" sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 64 }} component={RouterLink} to="/transaction" />
              <Tab label="Manage Portfolios" sx={{ textTransform: 'none', fontSize: { xs: '0.9rem', sm: '1rem' }, minHeight: 64, minWidth: 80 }} component={RouterLink} to="/portfolios" />
            </Tabs>

            <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
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

            <Box display="flex" gap={1} sx={{ display: { xs: 'none', md: 'flex' }, flexShrink: 0, alignItems: 'center' }}>
               <Tooltip title="Switch Theme">
                <IconButton onClick={toggleColorMode} size="small" sx={{ color: 'text.secondary' }}>
                  {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                </IconButton>
              </Tooltip>

               <Tooltip title="Import Transactions via CSV">
                <IconButton onClick={() => setImportOpen(true)} size="small" sx={{ color: 'text.secondary' }}>
                  <CloudUploadIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Export data (CSV / Google Sheet)">
                <IconButton onClick={(e) => setExportMenuAnchorElApp(e.currentTarget)} size="small" sx={{ color: 'text.secondary' }}>
                  {exportInProgress ? <CircularProgress size={18} /> : <FileDownloadIcon fontSize="small" />}
                </IconButton>
              </Tooltip>

              {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <Tooltip title="Populate test data (localhost only)">
                  <IconButton onClick={handlePopulateTestData} size="small" sx={{ color: 'text.disabled', opacity: 0.15 }}>
                    <BuildIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
               <Tooltip title="Open Google Sheet">
                <IconButton onClick={openSheet} size="small" sx={{ color: 'text.secondary' }}>
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Setup Sheet (Reset Schema & Rebuild Live Data)">
                <IconButton onClick={handleSetupSheet} size="small" sx={{ color: 'text.secondary' }} disabled={rebuilding}>
                   {rebuilding ? <CircularProgress size={20} /> : <BuildIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              
               <Tooltip title="Logout">
                <IconButton onClick={handleLogout} size="small" sx={{ color: 'text.secondary' }}>
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
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
          }}>Holdings (CSV)</MenuItem>
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
          }}>Holdings (Google Sheet)</MenuItem>
          <MenuItem disabled={exportInProgress} onClick={() => {
            setExportMenuAnchorElApp(null);
            setExportInProgress(true);
            exportDashboardData({ type: 'transactions', format: 'csv', sheetId, setLoading: setExportInProgress, onSuccess: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('success'); setSnackbarOpen(true); setExportInProgress(false); }, onError: (msg) => { setSnackbarMessage(msg); setSnackbarSeverity('error'); setSnackbarOpen(true); setExportInProgress(false); } });
          }}>Transactions (CSV)</MenuItem>
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
          }}>Transactions (Google Sheet)</MenuItem>
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
          }}>Export transactions & holdings (to Sheet)</MenuItem>
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
                  key={refreshKey} 
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
                <Route path="/ticker/:exchange/:ticker" element={<TickerDetails sheetId={sheetId} />} />
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

        <Modal open={sessionExpired}>
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            border: '2px solid #000',
            boxShadow: 24,
            p: 4,
          }}>
            <Typography variant="h6" component="h2">
              Session Expired
            </Typography>
            <Typography sx={{ mt: 2 }}>
              Your session has expired. Please sign in again to continue.
            </Typography>
            <Button onClick={handleReconnect} variant="contained" sx={{ mt: 2 }}>Sign In</Button>
          </Box>
        </Modal>

        {/* Schema Version Dialog */}
        <Dialog open={!!schemaVersionMismatch} onClose={() => {}}>
          <DialogTitle>{schemaVersionMismatch === 'old' ? 'Sheet Structure Update Required' : 'Sheet Structure Mismatch'}</DialogTitle>
          <DialogContent>
            {rebuilding ? (
              <Box display="flex" flexDirection="column" alignItems="center" py={2}>
                <CircularProgress size={40} sx={{ mb: 2 }} />
                <DialogContentText align="center">
                  Updating spreadsheet structure and formulas...<br/>
                  Please wait, this may take a few moments.
                </DialogContentText>
              </Box>
            ) : (
              <DialogContentText>
                {schemaVersionMismatch === 'old' 
                  ? "Your Google Sheet structure is outdated. A new version of the application requires schema updates to function correctly."
                  : "Warning: Your Google Sheet's structure version is newer than this application's version. This is an unexpected situation and may cause parts of the app to not function as expected. Please consider updating the application."}
                <br /><br />
                {schemaVersionMismatch === 'old' && "Please perform a 'Setup Sheet' to upgrade the columns and formulas. This will rewrite headers and rebuild live data, but your transaction history is safe (unless columns were removed)."}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSchemaVersionMismatch(null)} color="primary" disabled={rebuilding}>
              {schemaVersionMismatch === 'old' ? 'Ignore (Risky)' : 'Acknowledge'}
            </Button>
            {schemaVersionMismatch === 'old' && (
              <Button onClick={handleSetupSheet} variant="contained" color="primary" autoFocus disabled={rebuilding}>
                {rebuilding ? "Updating..." : "Setup Sheet (Upgrade)"}
              </Button>
            )}
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;