import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, List, ListItem, ListItemText, Box
} from '@mui/material';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportHelp({ open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Importing CSV from Yahoo Finance</DialogTitle>
      <DialogContent dividers>
        <Typography paragraph>
          This short guide explains how to export a CSV from Yahoo Finance and import it into the app.
        </Typography>

        <Typography variant="h6" gutterBottom>Exporting from Yahoo</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="On Yahoo Finance, open the Portfolio or Activity page containing the transactions or holdings you want to export." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary='Use any available "Export" or "Download" button to get a CSV. If there is no explicit export, copy the table into a CSV format (comma-separated).' />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Required columns for this importer</Typography>
        <Typography variant="body2" paragraph>
          The importer expects the following fields in the CSV (column names can vary; you'll map them in the wizard):
        </Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Symbol or Ticker (e.g. AAPL, 1175819)" />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Date (formats supported: YYYY-MM-DD, YYYYMMDD, or other JS-parsable formats)" />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Type (Buy, Sell, DIV, Fee, etc.)" />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Qty (number of shares/units)" />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Price (per-share/unit price)" />
          </ListItem>
        </List>

        <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>Optional but useful:</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Exchange (e.g., NASDAQ, TASE) — if missing, the importer can auto-deduce or you can set a manual exchange." />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>How to use the Import Wizard</Typography>
        <List dense sx={{ listStyleType: 'decimal', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Upload the CSV file or paste the CSV text into the wizard." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Select the target portfolio." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary='The importer will attempt to auto-map common column names (Symbol, Date, Qty, Price, Exchange). Review and correct mappings in the "Map Columns" step.' />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText 
              primary="Choose an exchange mode:" 
              secondary={
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                   • Map from CSV (if file includes exchange values)<br/>
                   • Manual Input (one exchange for all rows)<br/>
                   • Auto-Deduce (based on ticker format; numeric tickers -{'>'} TASE, otherwise NASDAQ)
                </Box>
              }
            />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Preview the parsed transactions and confirm values. Fix any date/format issues by adjusting mappings or editing the CSV source." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="Click Import to add transactions to the selected portfolio." />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Common tips</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="If dates appear as integers like 20241025, the importer will parse them as YYYY-MM-DD automatically." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="If the CSV uses a different delimiter or encapsulation, re-save it as a standard comma-separated file." />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary="If exchange is missing or ambiguous, choose Manual Input or correct the exchange column in the mapping step." />
          </ListItem>
        </List>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
