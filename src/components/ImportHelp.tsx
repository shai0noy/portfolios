import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, List, ListItem, ListItemText, Box
} from '@mui/material';
import { useLanguage } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportHelp({ open, onClose }: Props) {
  const { t, isRtl } = useLanguage();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('Importing CSV from Yahoo Finance', 'ייבוא CSV מ-Yahoo Finance')}</DialogTitle>
      <DialogContent dividers>
        <Typography paragraph>
          {t('This short guide explains how to export a CSV from Yahoo Finance and import it into the app.', 'מדריך קצר זה מסביר כיצד לייצא קובץ CSV מ-Yahoo Finance ולייבא אותו לאפליקציה.')}
        </Typography>

        <Typography variant="h6" gutterBottom>{t('Exporting from Yahoo', 'ייצוא מ-Yahoo')}</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("On Yahoo Finance, open the Portfolio or Activity page containing the transactions or holdings you want to export.", "ב-Yahoo Finance, פתח את עמוד התיק או הפעילות המכיל את העסקאות או ההחזקות שברצונך לייצא.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t('Use any available "Export" or "Download" button to get a CSV. If there is no explicit export, copy the table into a CSV format (comma-separated).', 'השתמש בכפתור "Export" או "Download" כדי לקבל קובץ CSV. אם אין אפשרות ייצוא, העתק את הטבלה לפורמט CSV.')} />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>{t('Required columns for this importer', 'עמודות חובה עבור הייבוא')}</Typography>
        <Typography variant="body2" paragraph>
          {t("The importer expects the following fields in the CSV (column names can vary; you'll map them in the wizard):", "הייבוא מצפה לשדות הבאים בקובץ ה-CSV (שמות העמודות יכולים להשתנות; תמפה אותם באשף):")}
        </Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Symbol or Ticker (e.g. AAPL, 1175819)", "סימול או טיקר (למשל AAPL, 1175819)")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Date (formats supported: YYYY-MM-DD, YYYYMMDD, or other JS-parsable formats)", "תאריך (פורמטים נתמכים: YYYY-MM-DD, YYYYMMDD, או פורמטים אחרים)")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Type (Buy, Sell, DIV, Fee, etc.)", "סוג (קנייה, מכירה, דיבידנד, עמלה וכו')")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Qty (number of shares/units)", "כמות (מספר מניות/יחידות)")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Price (per-share/unit price)", "מחיר (מחיר ליחידה/מניה)")} />
          </ListItem>
        </List>

        <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>{t('Optional but useful:', 'אופציונלי אך שימושי:')}</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Exchange (e.g., NASDAQ, TASE) — if missing, the importer can auto-deduce or you can set a manual exchange.", "בורסה (למשל NASDAQ, TASE) — אם חסר, הייבוא ינסה לזהות או שתוכל להגדיר ידנית.")} />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>{t('How to use the Import Wizard', 'כיצד להשתמש באשף הייבוא')}</Typography>
        <List dense sx={{ listStyleType: 'decimal', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Upload the CSV file or paste the CSV text into the wizard.", "העלה את קובץ ה-CSV או הדבק את הטקסט באשף.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Select the target portfolio.", "בחר את תיק היעד.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t('The importer will attempt to auto-map common column names (Symbol, Date, Qty, Price, Exchange). Review and correct mappings in the "Map Columns" step.', 'הייבוא ינסה למפות אוטומטית שמות עמודות נפוצים. בדוק ותקן את המיפוי בשלב "מיפוי עמודות".')} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText 
              primary={t("Choose an exchange mode:", "בחר מצב בורסה:")} 
              secondary={
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                   • {t("Map from CSV (if file includes exchange values)", "לפי הקובץ (אם הקובץ מכיל עמודת בורסה)")}<br/>
                   • {t("Manual Input (one exchange for all rows)", "הזנה ידנית (בורסה אחת לכל השורות)")}<br/>
                   • {t("Auto-Deduce (based on ticker format; numeric tickers -> TASE, otherwise NASDAQ)", "זיהוי אוטומטי (לפי פורמט הסימול)")}
                </Box>
              }
            />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Preview the parsed transactions and confirm values. Fix any date/format issues by adjusting mappings or editing the CSV source.", "צפה בתצוגה מקדימה ואשר את הערכים. תקן בעיות תאריך/פורמט על ידי התאמת המיפוי או עריכת המקור.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("Click Import to add transactions to the selected portfolio.", "לחץ על ייבוא כדי להוסיף את העסקאות לתיק הנבחר.")} />
          </ListItem>
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>{t('Common tips', 'טיפים נפוצים')}</Typography>
        <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("If dates appear as integers like 20241025, the importer will parse them as YYYY-MM-DD automatically.", "אם תאריכים מופיעים כמספרים כמו 20241025, הייבוא ימיר אותם אוטומטית.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("If the CSV uses a different delimiter or encapsulation, re-save it as a standard comma-separated file.", "אם ה-CSV משתמש במפריד שונה, שמור אותו מחדש כקובץ מופרד פסיקים סטנדרטי.")} />
          </ListItem>
          <ListItem sx={{ display: 'list-item' }}>
            <ListItemText primary={t("If exchange is missing or ambiguous, choose Manual Input or correct the exchange column in the mapping step.", "אם הבורסה חסרה, בחר הזנה ידנית או תקן את עמודת הבורסה בשלב המיפוי.")} />
          </ListItem>
        </List>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Close', 'סגור')}</Button>
      </DialogActions>
    </Dialog>
  );
}
