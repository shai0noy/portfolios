import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  InputAdornment,
  Chip,
  Alert,
  Stack,
  Tooltip,
  Collapse,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import toast from 'react-hot-toast';
import { getMetadataValue, setMetadataValue } from '../lib/sheets';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { getSessionToken, signIn } from '../lib/google';
import { useLanguage } from '../lib/i18n';
import { WORKER_URL } from '../config';

interface AgentAccessDialogProps {
  open: boolean;
  onClose: () => void;
  sheetId: string;
}

interface AgentKeyMeta {
  createdAt?: string;
  label?: string;
  keySuffix?: string;
}

function buildAgentInstructionsMarkdown(baseUrl: string, tokenPlaceholderOrValue: string): string {
  return `# Portfolios Agent API Instructions

Base URL: \`${baseUrl}/agent\`
Auth Header: \`Authorization: Bearer ${tokenPlaceholderOrValue}\`

## Endpoints
- \`GET ${baseUrl}/agent/help\` — Full API schema, supported exchanges, currencies, and transaction types.
- \`GET ${baseUrl}/agent/state?currency=ILS\` — Complete portfolio snapshot (portfolios, holdings, FIFO lots, unrealized/realized gains, tax liabilities, 1D/1W/1M/3M/YTD/1Y/3Y/5Y returns, watchlist alerts, upcoming/recent events, user profile, and market benchmarks). Add \`&portfolioId=<ID>\` to filter or \`&fast=true\` for fast sheet-cached prices.
- \`GET ${baseUrl}/agent/portfolios\` — List all portfolios and tax/commission settings.
- \`GET ${baseUrl}/agent/transactions\` — List transactions (filters: \`portfolioId\`, \`ticker\`, \`exchange\`, \`type\`, \`fromDate\`, \`toDate\`, \`limit\`, \`offset\`). Each item includes \`rowIndex\`.
- \`POST ${baseUrl}/agent/transactions\` — Add single transaction \`{ date, portfolioId, ticker, exchange, type, originalQty, originalPrice, currency, vestDate?, comment?, commission?, autoCommission? }\` or batch \`{ transactions: [...] }\`.
- \`PATCH ${baseUrl}/agent/transactions/:rowIndex\` — Edit fields on transaction at \`rowIndex\` (optional optimistic checks: \`expectedTicker\`, \`expectedQty\`).
- \`DELETE ${baseUrl}/agent/transactions/:rowIndex\` — Delete transaction at \`rowIndex\` (optional query/body checks: \`expectedTicker\`, \`expectedQty\`).
- \`GET ${baseUrl}/agent/dividends\` — List dividend per-share events (filters: \`ticker\`, \`exchange\`, \`source\`, \`fromDate\`, \`toDate\`).
- \`POST ${baseUrl}/agent/dividends\` — Add manual dividend \`{ ticker, exchange, date, amount, currency? }\` or \`{ dividends: [...] }\`.
- \`PATCH ${baseUrl}/agent/dividends/:rowIndex\` — Update dividend at \`rowIndex\`.
- \`DELETE ${baseUrl}/agent/dividends/:rowIndex\` — Delete dividend at \`rowIndex\`.
- \`GET ${baseUrl}/agent/ticker/:exchange/:ticker\` — Live quote, fundamentals, period returns, and owned history for a ticker.`;
}

export const AgentAccessDialog: React.FC<AgentAccessDialogProps> = ({ open, onClose, sheetId }) => {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [activeHash, setActiveHash] = useState<string>('');
  const [savedToken, setSavedToken] = useState<string>('');
  const [keyMeta, setKeyMeta] = useState<AgentKeyMeta | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showDocsPreview, setShowDocsPreview] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    if (!open || !sheetId) return;
    let mounted = true;
    setNeedsReauth(false);
    setShowToken(false);

    const loadKeyStatus = async () => {
      setIsLoading(true);
      try {
        const [hashVal, metaStr, encToken] = await Promise.all([
          getMetadataValue(sheetId, 'agent_api_key_hash'),
          getMetadataValue(sheetId, 'agent_api_key_meta'),
          getMetadataValue(sheetId, 'agent_api_token_enc'),
        ]);
        if (!mounted) return;

        setActiveHash(hashVal?.trim() || '');
        if (metaStr) {
          try {
            setKeyMeta(JSON.parse(metaStr));
          } catch {
            setKeyMeta(null);
          }
        } else {
          setKeyMeta(null);
        }

        if (hashVal?.trim() && encToken?.trim()) {
          const decrypted = await decryptSecret(encToken.trim(), sheetId);
          if (mounted) setSavedToken(decrypted);
        } else {
          setSavedToken('');
        }
      } catch (err) {
        console.error('Failed to load Agent API key metadata', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadKeyStatus();
    return () => {
      mounted = false;
    };
  }, [open, sheetId]);

  const handleGenerateOrRotate = async () => {
    if (activeHash) {
      const ok = window.confirm(
        t(
          'Rotating the private key will immediately invalidate your current key. Any agent using the old key will need the new one. Continue?',
          'החלפת המפתח תבטל מיד את תוקף המפתח הנוכחי. כל סוכן שמשתמש במפתח הישן יצטרך לעדכן למפתח החדש. להמשיך?'
        )
      );
      if (!ok) return;
    }

    setIsGenerating(true);
    setNeedsReauth(false);
    try {
      const sessionToken = getSessionToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const res = await fetch(`${WORKER_URL}/agent/token`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ spreadsheetId: sheetId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setNeedsReauth(true);
        }
        throw new Error(data?.error || 'Failed to generate Agent Private Key');
      }

      const newToken: string = data.token;
      const encrypted = await encryptSecret(newToken, sheetId);
      await setMetadataValue(sheetId, 'agent_api_token_enc', encrypted);

      setActiveHash(data.keyHash);
      setSavedToken(newToken);
      setKeyMeta(data.meta || { createdAt: new Date().toISOString(), keySuffix: newToken.slice(-6) });
      setShowToken(true);
      toast.success(t('Agent Private Key generated and saved to your sheet.', 'מפתח הגישה לסוכן נוצר ונשמר בגיליון שלך.'));
    } catch (err: any) {
      console.error('Failed to generate Agent Private Key', err);
      toast.error(err?.message || t('Failed to generate key.', 'יצירת המפתח נכשלה.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async () => {
    const ok = window.confirm(
      t(
        'Revoke Agent Private Key? External agents will immediately lose access to your portfolio.',
        'לבטל את מפתח הגישה לסוכן? סוכנים חיצוניים יאבדו מיד את הגישה לתיק שלך.'
      )
    );
    if (!ok) return;

    setIsRevoking(true);
    try {
      await setMetadataValue(sheetId, 'agent_api_key_hash', '');
      await setMetadataValue(sheetId, 'agent_api_key_meta', '');
      await setMetadataValue(sheetId, 'agent_api_token_enc', '');
      setActiveHash('');
      setSavedToken('');
      setKeyMeta(null);
      setShowToken(false);
      toast.success(t('Agent Private Key revoked.', 'מפתח הגישה לסוכן בוטל.'));
    } catch (err) {
      console.error('Failed to revoke Agent Private Key', err);
      toast.error(t('Failed to revoke key.', 'ביטול המפתח נכשל.'));
    } finally {
      setIsRevoking(false);
    }
  };

  const copyText = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMsg);
    } catch {
      toast.error(t('Failed to copy to clipboard.', 'ההעתקה ללוח נכשלה.'));
    }
  };

  const isKeyActive = Boolean(activeHash);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon color="primary" />
          <span>{t('Agent API Access', 'גישת API לסוכן (Agent)')}</span>
        </Box>
        <Chip
          size="small"
          color={isKeyActive ? 'success' : 'default'}
          label={isKeyActive ? t('Active', 'פעיל') : t('Disabled', 'לא מוגדר')}
        />
      </DialogTitle>

      <DialogContent dividers>
        <DialogContentText paragraph>
          {t(
            'Generate a scoped private key so an external AI agent or automation script can read your portfolio state & statistics and list, add, edit, or delete transactions and dividends.',
            'צור מפתח פרטי ייעודי המאפשר לסוכן AI חיצוני או לתסריט אוטומציה לקרוא את מצב התיק והנתונים הסטטיסטיים ולנהל עסקאות ודיבידנדים (צפייה, הוספה, עריכה ומחיקה).'
          )}
        </DialogContentText>

        <Typography
          variant="body2"
          color="text.secondary"
          paragraph
          sx={{
            display: 'flex',
            gap: 0.5,
            flexDirection: 'column',
            p: 1.5,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <strong>{t('Per-User Sheet Scoping & Security:', 'אבטחה והגבלת הרשאות לגיליון זה בלבד:')}</strong>
          <span>
            •{' '}
            {t(
              'The key hash is stored inside the "App_Metadata" tab of your Google Sheet and verified on every API call.',
              'גיבוב המפתח נשמר בלשונית "App_Metadata" בגיליון הפרטי שלך ונבדק בכל קריאת API.'
            )}
          </span>
          <span>
            •{' '}
            {t(
              'Access is strictly scoped to this spreadsheet alone — rotating or revoking the key takes effect immediately.',
              'הגישה מוגבלת אך ורק לגיליון הנוכחי — החלפה או ביטול של המפתח נכנסים לתוקף באופן מיידי.'
            )}
          </span>
        </Typography>

        {needsReauth && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => signIn()}>
                {t('Sign In', 'התחבר')}
              </Button>
            }
          >
            {t(
              'Please sign in with Google again so a refresh token can be sealed for offline Agent API access.',
              'אנא התחבר מחדש עם Google כדי לאפשר גישת שרת לא-מקוונת עבור הסוכן.'
            )}
          </Alert>
        )}

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={26} />
          </Box>
        ) : (
          <Stack spacing={2}>
            <TextField
              fullWidth
              label={t('API Base URL', 'כתובת בסיס ל-API')}
              value={`${WORKER_URL}/agent`}
              size="small"
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={t('Copy Base URL', 'העתק כתובת')}>
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => copyText(`${WORKER_URL}/agent`, t('Base URL copied!', 'כתובת ה-API הועתקה!'))}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />

            {isKeyActive ? (
              <>
                <TextField
                  fullWidth
                  label={t('Agent Private Key', 'מפתח פרטי לסוכן')}
                  type={showToken ? 'text' : 'password'}
                  size="small"
                  value={savedToken || `ptf_••••••••${keyMeta?.keySuffix || ''}`}
                  helperText={
                    keyMeta?.createdAt
                      ? t(
                          `Created: ${new Date(keyMeta.createdAt).toLocaleString()}`,
                          `נוצר בתאריך: ${new Date(keyMeta.createdAt).toLocaleString()}`
                        )
                      : undefined
                  }
                  InputProps={{
                    readOnly: true,
                    endAdornment: savedToken ? (
                      <InputAdornment position="end">
                        <Tooltip title={showToken ? t('Hide Key', 'הסתר מפתח') : t('Reveal Key', 'הצג מפתח')}>
                          <IconButton size="small" onClick={() => setShowToken(s => !s)}>
                            {showToken ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('Copy Key', 'העתק מפתח')}>
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={() => copyText(savedToken, t('Private key copied!', 'המפתח הפרטי הועתק!'))}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                  {savedToken && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ContentCopyIcon />}
                      onClick={() =>
                        copyText(
                          buildAgentInstructionsMarkdown(WORKER_URL, savedToken),
                          t('Agent instructions (with key) copied!', 'הנחיות הסוכן (כולל המפתח) הועתקו!')
                        )
                      }
                    >
                      {t('Copy Agent Prompt (with Key)', 'העתק הנחיות לסוכן (כולל מפתח)')}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() =>
                      copyText(
                        buildAgentInstructionsMarkdown(WORKER_URL, 'ptf_<YOUR_PRIVATE_KEY>'),
                        t('API documentation copied!', 'תיעוד ה-API הועתק!')
                      )
                    }
                  >
                    {t('Copy Docs Only', 'העתק תיעוד בלבד')}
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} justifyContent="space-between" pt={0.5}>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={isGenerating ? <CircularProgress size={16} color="inherit" /> : <AutorenewIcon />}
                    disabled={isGenerating || isRevoking}
                    onClick={handleGenerateOrRotate}
                  >
                    {t('Rotate Key', 'החלף מפתח')}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={isRevoking ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />}
                    disabled={isGenerating || isRevoking}
                    onClick={handleRevoke}
                  >
                    {t('Revoke Key', 'בטל מפתח')}
                  </Button>
                </Stack>
              </>
            ) : (
              <Box sx={{ py: 1 }}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={isGenerating ? <CircularProgress size={18} color="inherit" /> : <SmartToyIcon />}
                  disabled={isGenerating}
                  onClick={handleGenerateOrRotate}
                >
                  {t('Generate Private Key', 'צור מפתח פרטי לסוכן')}
                </Button>
              </Box>
            )}

            <Box>
              <Button
                size="small"
                color="inherit"
                endIcon={showDocsPreview ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setShowDocsPreview(p => !p)}
                sx={{ textTransform: 'none' }}
              >
                {t('View API Endpoints Reference', 'הצג רשימת נקודות קצה (Endpoints)')}
              </Button>
              <Collapse in={showDocsPreview}>
                <Box
                  component="pre"
                  sx={{
                    mt: 1,
                    p: 1.5,
                    bgcolor: 'background.default',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    direction: 'ltr',
                    textAlign: 'left',
                  }}
                >
                  {buildAgentInstructionsMarkdown(WORKER_URL, 'ptf_<YOUR_PRIVATE_KEY>')}
                </Box>
              </Collapse>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={isGenerating || isRevoking}>
          {t('Close', 'סגור')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
