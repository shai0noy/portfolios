import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, IconButton,
  CircularProgress, Paper, Tooltip, Select, MenuItem, FormControl,
  FormControlLabel, Chip, Stack, ToggleButton, ToggleButtonGroup, Switch, Alert,
  InputAdornment
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CakeIcon from '@mui/icons-material/Cake';
import EventIcon from '@mui/icons-material/Event';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLanguage } from '../lib/i18n';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import { type ChatMessage, askGemini, fetchModels, type GeminiModel, getModelByCapability } from '../lib/gemini';
import type { EnrichedDashboardHolding } from '../lib/dashboard_calc';
import type { DashboardSummaryData } from '../lib/types';
import { formatPercent } from '../lib/currencyUtils';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { getMetadataValue, setMetadataValue } from '../lib/sheets/api';

interface AiChatDialogPortfolioData {
  holdings: EnrichedDashboardHolding[];
  summary: DashboardSummaryData;
  displayCurrency: string;
}

interface ExtendedChatMessage extends ChatMessage {
  isError?: boolean;
}

interface UserFinancialProfile {
  age?: number;
  retirementAge?: number;
  numChildren?: number;
  netYearlyEarnings?: number;
  yearlySpending?: number;
  ownsHome?: boolean;
}

interface AiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  sheetId: string;
  portfolioData: AiChatDialogPortfolioData;
}

const ChatMessageItem = React.memo(({ msg, t, onRetry, lastPrompt }: {
  msg: ExtendedChatMessage,
  t: (e: string, h?: string) => string,
  onRetry: (prompt: string) => void,
  lastPrompt: string
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
        gap: 1.5,
        mb: 1
      }}
    >
      {msg.role === 'model' && <SmartToyIcon color="primary" sx={{ mt: 1 }} />}
      <Paper
        sx={{
          p: 1.5,
          maxWidth: '92%',
          bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
          color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
          borderRadius: 2
        }}
      >
        <Typography component="div" variant="body2" sx={{
          whiteSpace: 'normal',
          '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
          '& ul, & ol': { m: 0, pl: 2, mb: 1 },
          '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace' }
        }}>
          {msg.role === 'model' ? (
            <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
          ) : (
            msg.parts[0].text
          )}
        </Typography>
        {msg.isError && (
          <Button
            startIcon={<RefreshIcon />}
            size="small"
            variant="outlined"
            color="error"
            onClick={() => onRetry(lastPrompt)}
            sx={{ mt: 1, textTransform: 'none', py: 0, fontSize: '0.7rem' }}
          >
            {t('Retry', 'נסה שוב')}
          </Button>
        )}
      </Paper>
      {msg.role === 'user' && <PersonIcon color="action" sx={{ mt: 1 }} />}
    </Box>
  );
});

export const AiChatDialog: React.FC<AiChatDialogProps> = ({ open, onClose, apiKey, sheetId, portfolioData }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ExtendedChatMessage[]>(() => {
    const saved = localStorage.getItem('ai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(localStorage.getItem('gemini_selected_model') || 'models/gemini-1.5-flash');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>('');

  const [chatMode, setChatMode] = useState<'fast' | 'thinking'>('fast');
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [openDisclaimer, setOpenDisclaimer] = useState(true);
  const [openProfile, setOpenProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserFinancialProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (open && sheetId && !userProfile.age) {
      setLoadingProfile(true);
      getMetadataValue(sheetId, 'user_financial_profile')
        .then(val => {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              setUserProfile(parsed);
            } catch (e) {
              console.error("Failed to parse user profile: " + val, e);
            }
          }
        })
        .catch(e => console.error("Failed to load user profile", e))
        .finally(() => setLoadingProfile(false));
    }
  }, [open, sheetId]);

  const handleSaveProfile = async () => {
    if (!sheetId) return;
    setSavingProfile(true);
    try {
      await setMetadataValue(sheetId, 'user_financial_profile', JSON.stringify(userProfile));
      setOpenProfile(false);
    } catch (e) {
      console.error("Failed to save profile", e);
      alert(t('Failed to save profile', 'שמירת הפרופיל נכשלה'));
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (open && apiKey) {
      if (!availableModels || availableModels.length === 0) {
        fetchModels(apiKey).then(models => {
          setAvailableModels(models);
        });
      }
    }
  }, [open, apiKey]);

  // Sync chat mode with model selection when NOT in expert mode
  useEffect(() => {
    if (!isExpertMode && availableModels.length > 0) {
      const bestModel = getModelByCapability(availableModels, chatMode);
      if (bestModel !== selectedModel) {
        setSelectedModel(bestModel);
      }
    }
  }, [chatMode, availableModels, isExpertMode]); // Intentionally not depending on selectedModel to avoid loops

  // Ensure initial model selection/validation (only once or when list loads)
  useEffect(() => {
    if (!availableModels.length) return;
    const currentExists = availableModels.some(m => m.name === selectedModel);

    if (!currentExists && !isExpertMode) {
      // Default init
      const bestModel = getModelByCapability(availableModels, chatMode);
      setSelectedModel(bestModel);
    }
  }, [availableModels]);

  useEffect(() => {
    localStorage.setItem('gemini_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('ai_chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const summarizePortfolio = () => {
    const hSummary = portfolioData.holdings.map(h => ({
      symbol: `${h.exchange}:${h.ticker}`,
      name: h.displayName,
      value: h.display.marketValue,
      unrealizedGain: h.display.unrealizedGain,
      unrealizedGainPct: formatPercent(h.display.unrealizedGainPct),
      dayChangePct: formatPercent(h.display.dayChangePct),
      realizedGain: h.display.realizedGain,
      realizedGainPct: formatPercent(h.display.realizedGainPct),
      weightInAllHoldings: h.display.weightInGlobal,
      sector: h.sector,
      perf1w: formatPercent(h.perf1w),
      perf1m: formatPercent(h.perf1m),
      perf3m: formatPercent(h.perf3m),
      perf1y: formatPercent(h.perf1y),
      perf5y: formatPercent(h.perf5y),
      lots: h.activeLots.map(l => ({
        date: l.date,
        vestingDate: l.vestingDate,
        soldDate: l.soldDate,
        cost: l.costTotal
      }))    
    }));

    return JSON.stringify({
      totalValue: portfolioData.summary.aum,
      totalGain: portfolioData.summary.totalReturn,
      currency: portfolioData.displayCurrency,
      perf1d: formatPercent(portfolioData.summary.perf1d),
      perf1w: formatPercent(portfolioData.summary.perf1w),
      perf1m: formatPercent(portfolioData.summary.perf1m),
      perf3m: formatPercent(portfolioData.summary.perf3m),
      perf1y: formatPercent(portfolioData.summary.perf1y),
      perf5y: formatPercent(portfolioData.summary.perf5y),
      totalUnvestedValue: portfolioData.summary.totalUnvestedValue,
      valueAfterTax: portfolioData.summary.valueAfterTax,
      holdings: hSummary
    });
  };

  const handleSend = async (retryPrompt?: string) => {
    const userMsg = retryPrompt || input.trim();
    if (!userMsg || isLoading) return;

    if (!retryPrompt) setInput('');

    // If not a retry, add to messages. If retry, maybe we want to remove the previous error message?
    // Let's just append for now but filter history when sending.
    if (!retryPrompt) {
      setMessages(prev => [...prev, { role: 'user', parts: [{ text: userMsg }] }]);
    }

    lastPromptRef.current = userMsg;
    setIsLoading(true);

    try {
      // Filter history to remove error messages and ensure proper role alternation
      const history = messages.filter((m) => !m.isError);

      const profileContext = userProfile && Object.keys(userProfile).length > 0
        ? `\nUser Profile: ${JSON.stringify(userProfile)}`
        : '';

      const systemInstruction = `
You are a financial assistant. Be professional, objective, and direct. Avoid excessive praise or flattery. Focus on data-driven analysis and facts. 
If your response includes specific investment or tax handling advice, please add a brief disclaimer at the end. 
Suggest one concrete follow-up question or action.

==User Context==
${profileContext}

==Current Portfolio Data==
${summarizePortfolio()}

==User Session Start==`;

      const response = await askGemini(apiKey, history, userMsg, selectedModel, systemInstruction);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: response }] }]);
    } catch (err) {
      console.error("Gemini Error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: t('Sorry, I encountered an error while processing your request.', 'מצטער, נתקלתי בשגיאה בעיבוד הבקשה שלך.') }],
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    if (confirm(t('Are you sure you want to clear chat history?', 'האם אתה בטוח שברצונך למחוק את היסטוריית הצ׳אט?'))) {
      setMessages([]);
      localStorage.removeItem('ai_chat_history');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
      >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon color="primary" /> {t('AI Portfolio Assistant', 'עוזר תיק השקעות AI')}
          </Box>

          {!isExpertMode ? (
            <ToggleButtonGroup
              value={chatMode}
              exclusive
              onChange={(_, newVal) => { if (newVal) setChatMode(newVal); }}
              size="small"
              sx={{ height: 32 }}
            >
              <ToggleButton value="fast" sx={{ px: 2, py: 0, textTransform: 'none', gap: 0.5 }}>
                <BoltIcon fontSize="small" /> {t('Fast', 'מהיר')}
              </ToggleButton>
              <ToggleButton value="thinking" sx={{ px: 2, py: 0, textTransform: 'none', gap: 0.5 }}>
                <PsychologyIcon fontSize="small" /> {t('Thinking', 'חושב')}
              </ToggleButton>
            </ToggleButtonGroup>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  sx={{ height: 32, fontSize: '0.8rem' }}
                  displayEmpty
                >
                  {availableModels.length > 0 ? (
                    availableModels
                      .map(m => (
                        <MenuItem key={m.name} value={m.name} sx={{ fontSize: '0.8rem' }}>
                          {m.displayName}
                        </MenuItem>
                      ))
                  ) : (
                    <MenuItem value={selectedModel} disabled sx={{ fontSize: '0.8rem' }}>
                      {selectedModel.replace('models/', '')}
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
            </Box>
          )}


          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={isExpertMode}
                onChange={(e) => setIsExpertMode(e.target.checked)}
              />
            }
            label={<Typography variant="caption">{t('Expert Mode', 'מצב מומחה')}</Typography>}
            sx={{ ml: 1 }}
          />
        </Box>
        <Box>
            <Tooltip title={t("User Profile", "פרופיל משתמש")}>
              <IconButton onClick={() => setOpenProfile(true)} size="small" sx={{ mr: 1 }}>
                <ManageAccountsIcon />
              </IconButton>
            </Tooltip>
          <Tooltip title={t('Clear History', 'נקה היסטוריה')}>
            <Button
              onClick={clearHistory}
              size="small"
              color="inherit"
              startIcon={<DeleteOutlineIcon />}
              sx={{ mr: 1, textTransform: 'none' }}
            >
              {t('Clear Chat', 'נקה שיחה')}
            </Button>
          </Tooltip>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          ref={scrollRef}
          sx={{
            height: '400px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            p: 1
          }}
        >
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.8 }}>
              <SmartToyIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main', opacity: 0.5 }} />
              <Typography variant="body1" gutterBottom>
                {t('Hello! I can help you analyze your portfolio.', 'שלום! אני יכול לעזור לך לנתח את התיק שלך.')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('Try asking one of these:', 'נסה לשאול את אחת השאלות הבאות:')}
              </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" sx={{ maxWidth: 800, mx: 'auto' }}>
                {[
                  t("What are the key risks in my portfolio?", "מהם הסיכונים המרכזיים בתיק?"),
                  t("How is my asset allocation distributed?", "איך נראית הקצאת הנכסים שלי?"),
                  t("Suggest 3 improvements for my portfolio", "הצע 3 שיפורים לתיק שלי"),
                  t("Compare my performance to the S&P 500", "השווה את הביצועים שלי ל-S&P 500"),
                  t("Summarize my portfolio performance", "סכם את ביצועי התיק שלי")
                ].map((text, i) => (
                  <Chip 
                    key={i}
                    label={text}
                    onClick={() => setInput(text)}
                    clickable
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}
          {messages.map((msg, i) => (
            <ChatMessageItem
              key={i} 
              msg={msg}
              t={t}
              onRetry={handleSend}
              lastPrompt={lastPromptRef.current}
            />
          ))}
          {isLoading && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <SmartToyIcon color="primary" sx={{ mt: 1 }} />
              <Paper sx={{ p: 1.5, borderRadius: 2 }}>
                <CircularProgress size={20} />
              </Paper>
            </Box>
          )}
          <Box ref={scrollRef} />
        </Box>
        {openDisclaimer && (
          <Alert
            severity="info"
            onClose={() => setOpenDisclaimer(false)}
            sx={{ mt: 0, mb: 0, py: 0, '& .MuiAlert-message': { fontSize: '0.75rem' } }}
          >
            {t(
              'Disclaimer: This AI assistant provides analysis for informational purposes only and does not constitute financial advice. Always consult with a qualified financial expert before making investment decisions.',
              'הבהרה: עוזר ה-AI מספק ניתוח למטרות מידע בלבד ואינו מהווה ייעוץ פיננסי. תמיד התייעץ עם מומחה פיננסי מוסמך לפני קבלת החלטות השקעה.'
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <TextField
          fullWidth
          placeholder={t('Ask a question...', 'שאל שאלה...')}
          variant="outlined"
          size="small"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
        />
        <Button
          variant="contained"
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          endIcon={<SendIcon />}
        >
          {t('Send', 'שלח')}
        </Button>
      </DialogActions>
    </Dialog>

      {/* Profile Dialog */}
      <Dialog open={openProfile} onClose={() => setOpenProfile(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('User Financial Profile', 'פרופיל פיננסי אישי')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('Providing this information helps the AI give more personalized advice.', 'מסירת מידע זה תעזור ל-AI לתת עצות מותאמות אישית יותר.')}
            </Typography>
            {loadingProfile && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label={t('Age', 'גיל')}
                type="number"
                disabled={loadingProfile}
                value={userProfile.age ?? ''}
                onChange={(e) => setUserProfile({ ...userProfile, age: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                fullWidth
                size="small"
                placeholder={t('Not provided', 'לא צוין')}
              />
              <TextField
                label={t('Desired Retirement Age', 'גיל פרישה רצוי')}
                type="number"
                disabled={loadingProfile}
                value={userProfile.retirementAge ?? ''}
                onChange={(e) => setUserProfile({ ...userProfile, retirementAge: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                fullWidth
                size="small"
                placeholder={t('Not provided', 'לא צוין')}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label={t('Number of Children', 'מספר ילדים')}
                type="number"
                disabled={loadingProfile}
                value={userProfile.numChildren ?? ''}
                onChange={(e) => setUserProfile({ ...userProfile, numChildren: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                fullWidth
                size="small"
                placeholder={t('Not provided', 'לא צוין')}
              />
              <FormControl size="small" fullWidth>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  {t('Owns Primary Residence', 'בעל דירה למגורים')}
                </Typography>
                <Select
                  value={userProfile.ownsHome === undefined ? 'unknown' : (userProfile.ownsHome ? 'yes' : 'no')}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserProfile({
                      ...userProfile,
                      ownsHome: val === 'unknown' ? undefined : (val === 'yes')
                    });
                  }}
                  size="small"
                  disabled={loadingProfile}
                >
                  <MenuItem value="unknown">{t('Unknown / Not provided', 'לא ידוע / לא צוין')}</MenuItem>
                  <MenuItem value="yes">{t('Yes', 'כן')}</MenuItem>
                  <MenuItem value="no">{t('No', 'לא')}</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <TextField
              label={t('Avg. Yearly Net Earnings', 'הכנסה שנתית נטו ממוצעת')}
              type="number"
              disabled={loadingProfile}
              value={userProfile.netYearlyEarnings ?? ''}
              onChange={(e) => setUserProfile({ ...userProfile, netYearlyEarnings: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{ startAdornment: <Typography variant="caption" sx={{ mr: 1, opacity: 0.7 }}>$</Typography> }}
            />
            <TextField
              label={t('Avg. Yearly Spending', 'הוצאה שנתית ממוצעת')}
              type="number"
              disabled={loadingProfile}
              value={userProfile.yearlySpending ?? ''}
              onChange={(e) => setUserProfile({ ...userProfile, yearlySpending: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              fullWidth
              size="small"
              placeholder={t('Not provided', 'לא צוין')}
              InputProps={{ startAdornment: <Typography variant="caption" sx={{ mr: 1, opacity: 0.7 }}>$</Typography> }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={userProfile.ownsHome || false}
                  onChange={(e) => setUserProfile({ ...userProfile, ownsHome: e.target.checked })}
                />
              }
              label={t('Owns Primary Residence', 'בעל דירה למגורים')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenProfile(false)}>{t('Cancel', 'ביטול')}</Button>
          <Button onClick={handleSaveProfile} variant="contained" disabled={savingProfile}>
            {savingProfile ? <CircularProgress size={24} /> : t('Save', 'שמור')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
