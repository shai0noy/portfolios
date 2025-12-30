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
    <Box sx={{ flexGrow: 1, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: '#1976d2' }}>
            Portfolios
          </Typography>
          
          {/* LINK TO SHEET */}
          <Tooltip title="Open Google Sheet">
            <IconButton onClick={openSheet} color="primary" sx={{ mr: 1 }}>
              <OpenInNewIcon />
            </IconButton>
          </Tooltip>

          <Button onClick={handleFixSchema} color="inherit" size="small">Reset Schema</Button>
          <Button color="inherit" onClick={handleLogout} size="small" sx={{ ml: 1 }}>Logout</Button>
        </Toolbar>
        
        {/* TABS */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered textColor="primary" indicatorColor="primary">
          <Tab label="Add Trade" />
          <Tab label="Manage Portfolios" />
        </Tabs>
      </AppBar>
      
      <Container maxWidth="md">
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