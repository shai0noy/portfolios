// src/App.tsx
import { useState } from 'react';
import { Login } from './components/Login';
import { AddTrade } from './components/AddTrade';
import { PortfolioManager } from './components/PortfolioManager';
import { Dashboard } from './components/Dashboard';
import { ensureSchema } from './lib/sheets';
import { Box, AppBar, Toolbar, Typography, Container, Tabs, Tab, IconButton, Tooltip } from '@mui/material';
import { signOut } from './lib/google';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import BuildIcon from '@mui/icons-material/Build';
import LogoutIcon from '@mui/icons-material/Logout';

function App() {
  const [sheetId, setSheetId] = useState<string | null>(localStorage.getItem('g_sheet_id'));
  const [tab, setTab] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0); // Trigger to reload data

  const handleLogout = () => {
    signOut();
    setSheetId(null);
  };

  const handleFixSchema = async () => {
    if (sheetId && confirm("This will reset header rows and formulas. Continue?")) {
      await ensureSchema(sheetId);
    }
  };

  const openSheet = () => {
    if (sheetId) window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank');
  };

  if (!sheetId) return <Login onLogin={setSheetId} />;

  return (
    <Box sx={{ flexGrow: 1, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <AccountBalanceWalletIcon sx={{ color: 'primary.main', mr: 1.5 }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 0, color: 'text.primary', fontWeight: 700, letterSpacing: '-0.5px', mr: 4 }}>
            My Wealth
          </Typography>
          
          <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="primary" indicatorColor="primary" sx={{ flexGrow: 1 }}>
            <Tab label="Dashboard" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} />
            <Tab label="Add Trade" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} />
            <Tab label="Manage Portfolios" sx={{ textTransform: 'none', fontSize: '1rem', minHeight: 64 }} />
          </Tabs>

          <Box display="flex" gap={1}>
             <Tooltip title="Open Google Sheet">
              <IconButton onClick={openSheet} size="small" sx={{ color: 'text.secondary' }}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset Spreadsheet Schema (Fix)">
              <IconButton onClick={handleFixSchema} size="small" sx={{ color: 'text.secondary' }}>
                <BuildIcon fontSize="small" />
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
        {tab === 0 ? (
          <Dashboard sheetId={sheetId} key={refreshKey} />
        ) : tab === 1 ? (
          <AddTrade sheetId={sheetId} key={refreshKey} />
        ) : (
          <PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />
        )}
      </Container>
    </Box>
  );
}

export default App;