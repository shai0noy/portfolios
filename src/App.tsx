import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { Login } from './components/Login';
import { TransactionForm } from './components/NewTransaction';
import { PortfolioManager } from './components/PortfolioManager';
import { Dashboard } from './components/Dashboard';
import { ImportCSV } from './components/ImportCSV';
import { TickerDetails } from './components/TickerDetails'; // Import TickerDetails
import { ensureSchema, populateTestData, fetchTransactions, rebuildHoldingsSheet } from './lib/sheets';
import { initGoogleClient, refreshToken, signOut } from './lib/google';
import { Box, AppBar, Toolbar, Typography, Container, Tabs, Tab, IconButton, Tooltip, CircularProgress, ThemeProvider, CssBaseline } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { getTheme } from './theme';

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
  const [sheetId, setSheetId] = useState<string | null>(localStorage.getItem('g_sheet_id'));
  const [refreshKey, setRefreshKey] = useState(0); // Trigger to reload data
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<'light' | 'dark'>(() => (localStorage.getItem('themeMode') as 'light' | 'dark') || 'light');
  const [rebuilding, setRebuilding] = useState(false);

  const theme = useMemo(() => getTheme(mode), [mode]);
  const location = useLocation();
  const navigate = useNavigate();

  const currentTab = tabMap[location.pathname] || 0;

  useEffect(() => {
    if (!location.pathname || location.pathname === '/') {
      navigate('/dashboard');
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

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
    if (!confirm("This will reset sheet headers and rebuild all live data formulas. This can fix issues but is a heavy operation. Are you sure?")) return;
    
    setRebuilding(true);
    try {
      await ensureSchema(sheetId);
      await fetchTransactions(sheetId);
      await rebuildHoldingsSheet(sheetId);
      setRefreshKey(k => k + 1); // Refresh dashboard
      alert("Sheet setup complete. Headers and live data have been rebuilt.");
    } catch (e) {
      console.error(e);
      alert("Error during sheet setup: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRebuilding(false);
    }
  };

  const handlePopulateTestData = async () => {
    if (!sheetId) return;
    if (!confirm('Populate sheet with 3 test portfolios and sample transactions?')) return;
    try {
      await populateTestData(sheetId);
      setRefreshKey(k => k + 1);
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
        const restored = await initGoogleClient();
        if (mounted) setGoogleReady(restored);
        if (!restored) {
          setSheetId(null);
        }
      } catch (e) {
        if (mounted) setGoogleReady(false);
        setSheetId(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!sheetId || !googleReady) return;

    const checkToken = async () => {
      const savedExpiry = localStorage.getItem('g_expires');
      if (savedExpiry) {
        const expiryTime = parseInt(savedExpiry);
        const bufferMs = 15 * 60 * 1000; // 15 minutes buffer
        if (Date.now() > expiryTime - bufferMs) {
          console.log('Token nearing expiration, attempting silent refresh...');
          try {
            await refreshToken();
            console.log('Token refreshed successfully.');
          } catch (e) {
            console.warn('Periodic silent token refresh failed.', e);
            // Optionally handle logout if refresh persistently fails
            // handleLogout();
          }
        }
      }
    };

    checkToken(); // Initial check
    const intervalId = setInterval(checkToken, 10 * 60 * 1000); // Check every 10 minutes

    return () => clearInterval(intervalId);
  }, [sheetId, googleReady]);

  if (googleReady === null) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh"><CircularProgress /></Box>;
  }

  const content = !sheetId || googleReady === false ? (
    <Login onLogin={handleLogin} />
  ) : (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <AccountBalanceWalletIcon sx={{ color: 'primary.main', mr: 1.5 }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 0, color: 'text.primary', fontWeight: 700, letterSpacing: '-0.5px', mr: 4 }}>
            My Portfolios
          </Typography>
          
          <Tabs value={currentTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary" sx={{ flexGrow: 1 }}>
            <Tab label="Dashboard" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} component={RouterLink} to="/dashboard" />
            <Tab label="Add Trade" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} component={RouterLink} to="/transaction" />
            <Tab label="Manage Portfolios" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} component={RouterLink} to="/portfolios" />
          </Tabs>

          <Box display="flex" gap={1}>
             <Tooltip title="Switch Theme">
              <IconButton onClick={toggleColorMode} size="small" sx={{ color: 'text.secondary' }}>
                {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
              </IconButton>
            </Tooltip>

             <Tooltip title="Import Transactions (CSV)">
              <IconButton onClick={() => setImportOpen(true)} size="small" sx={{ color: 'text.secondary' }}>
                <FileDownloadIcon fontSize="small" />
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
      
      <Container maxWidth="xl" sx={{ mt: 5, pb: 8 }}>
        <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
          <Dashboard sheetId={sheetId} key={refreshKey} />
        </Box>
        <Box sx={{ display: currentTab === 1 ? 'block' : 'none' }}>
          <TransactionForm sheetId={sheetId} key={refreshKey} />
        </Box>

        {/* Routes for components that should not be hidden, but mounted on navigation */}
        <Routes>
          <Route path="/dashboard" element={null} /> {/* Dummy route */}
          <Route path="/transaction" element={null} /> {/* Dummy route */}
          <Route path="/portfolios" element={<PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />} />
          <Route path="/portfolios/:portfolioId" element={<PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />} />
          <Route path="/ticker/:exchange/:ticker" element={<TickerDetails />} />
        </Routes>
      </Container>

      {importOpen && (
        <ImportCSV 
          sheetId={sheetId} 
          open={importOpen} 
          onClose={() => setImportOpen(false)} 
          onSuccess={() => { setRefreshKey(k => k + 1); setImportOpen(false); }} 
        />
      )}
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {content}
    </ThemeProvider>
  );
}

export default App;