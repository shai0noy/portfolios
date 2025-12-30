// src/App.tsx
import { useState } from 'react';
import { Login } from './components/Login';
import { AddTrade } from './components/AddTrade';
import { PortfolioManager } from './components/PortfolioManager';
import { ensureSchema } from './lib/sheets';
import { Box, AppBar, Toolbar, Typography, Button, Container, Tabs, Tab, IconButton, Tooltip } from '@mui/material';
import { signOut } from './lib/google';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

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
          <Typography variant="h5" component="div" sx={{ flexGrow: 1, color: 'text.primary', letterSpacing: '-0.5px' }}>
            Portfolios
          </Typography>
          
          <Tooltip title="Open Google Sheet">
            <IconButton onClick={openSheet} size="small" sx={{ mr: 1, color: 'text.secondary' }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Button onClick={handleFixSchema} color="inherit" size="small" sx={{ color: 'text.secondary' }}>Reset Schema</Button>
          <Button color="inherit" onClick={handleLogout} size="small" sx={{ ml: 1, color: 'text.secondary' }}>Logout</Button>
        </Toolbar>
        
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered textColor="primary" indicatorColor="primary">
          <Tab label="Add Trade" sx={{ textTransform: 'none', fontSize: '1rem' }} />
          <Tab label="Manage Portfolios" sx={{ textTransform: 'none', fontSize: '1rem' }} />
        </Tabs>
      </AppBar>
      
      <Container maxWidth="md" sx={{ mt: 5, pb: 8 }}>
        {tab === 0 ? (
          <AddTrade sheetId={sheetId} key={refreshKey} />
        ) : (
          <PortfolioManager sheetId={sheetId} onSuccess={() => setRefreshKey(k => k + 1)} />
        )}
      </Container>
    </Box>
  );
}

export default App;