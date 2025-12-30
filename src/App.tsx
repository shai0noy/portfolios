import { useState } from 'react';
import { Login } from './components/Login';
import { AddTrade } from './components/AddTrade';
import { ensureSchema } from './lib/sheets';
import { Box, AppBar, Toolbar, Typography, Button, Container } from '@mui/material';
import { signOut } from './lib/google';

function App() {
  const [sheetId, setSheetId] = useState<string | null>(null);

  const handleLogout = () => {
    signOut();
    setSheetId(null);
  };

  const handleFixSchema = async () => {
    if (sheetId) {
      await ensureSchema(sheetId);
      alert('Schema & Formulas Restored!');
    }
  };

  if (!sheetId) return <Login onLogin={setSheetId} />;

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: '#1976d2' }}>
            Portfolios
          </Typography>
          <Button onClick={handleFixSchema}>Fix Schema</Button>
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>
      
      <Container maxWidth="md">
        <AddTrade sheetId={sheetId} />
      </Container>
    </Box>
  );
}

export default App;