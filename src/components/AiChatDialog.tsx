import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, IconButton,
  CircularProgress, Paper, Tooltip, Select, MenuItem, FormControl,
  FormControlLabel, Chip, Stack, ToggleButton, ToggleButtonGroup, Switch, Alert
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useLanguage } from '../lib/i18n';
import { ProfileForm, type UserFinancialProfile } from './ProfileForm';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type ChatMessage, askGemini, fetchModels, type GeminiModel, getModelByCapability } from '../lib/gemini';
import type { EnrichedDashboardHolding } from '../lib/dashboard_calc';
import type { DashboardSummaryData } from '../lib/types';
import { formatPercent } from '../lib/currencyUtils';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { getMetadataValue, setMetadataValue } from '../lib/sheets/api';
import { getTickerData } from '../lib/fetching';
import { Exchange } from '../lib/types';

interface AiChatDialogPortfolioData {
  holdings: EnrichedDashboardHolding[];
  summary: DashboardSummaryData;
  displayCurrency: string;
}

interface ExtendedChatMessage extends ChatMessage {
  isError?: boolean;
}



interface AiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  sheetId: string;
  portfolioData: AiChatDialogPortfolioData;
  onTickerClick?: (ticker: { exchange: string; symbol: string }) => void;
  onNavClick?: (path: string) => void;
  initialPrompt?: string;
}

function LinkParser({ children, t, onPromptClick, onTickerClick, onProfileClick, onNavClick }: {
  children: React.ReactNode,
  t: (e: string, h: string) => string,
  onPromptClick: (text: string) => void,
  onTickerClick: (exchange: string, symbol: string) => void,
  onProfileClick: () => void,
  onNavClick: (path: string) => void
}) {
  const process = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === 'string') {
      const parts: (string | React.ReactNode)[] = [];
      let lastIndex = 0;
      const regex = /\{(prompt|ticker|userinfo|url)(?:::([^}]+))?\}/g;
      let match;

      while ((match = regex.exec(node)) !== null) {
        if (match.index > lastIndex) {
          parts.push(node.substring(lastIndex, match.index));
        }
        const type = match[1];
        const value = match[2];

        if (type === 'prompt') {
          parts.push(
            <Button
              key={match.index}
              size="small"
              variant="outlined"
              onClick={() => onPromptClick(value)}
              sx={{ mx: 0.5, textTransform: 'none', py: 0, height: 24, fontSize: '0.75rem' }}
            >
              {value}
            </Button>
          );
        } else if (type === 'ticker') {
          const valStr = value || '';
          const [label, tickerStr] = valStr.includes('::') ? valStr.split('::') : [null, valStr];
          const actualTicker = tickerStr || valStr;
          const [ex, sym] = actualTicker.includes(':') ? actualTicker.split(':') : ['', actualTicker];
          parts.push(
            <Button
              key={match.index}
              size="small"
              onClick={() => onTickerClick(ex, sym)}
              sx={{
                mx: 0.2,
                textTransform: 'none',
                py: 0,
                height: 24,
                fontSize: '0.75rem',
                fontWeight: 700,
                minWidth: 'auto',
                color: 'primary.main',
                filter: 'saturate(1.6)'
              }}
            >
              {label || sym || actualTicker}
            </Button>
          );
        } else if (type === 'userinfo') {
          parts.push(
            <Button
              key={match.index}
              size="small"
              color="secondary"
              startIcon={<ManageAccountsIcon sx={{ fontSize: '1rem !important' }} />}
              onClick={() => onProfileClick()}
              sx={{ mx: 0.5, textTransform: 'none', py: 0, height: 24, fontSize: '0.75rem' }}
            >
              {value || t('Edit Profile', 'ערוך פרופיל')}
            </Button>
          );
        } else if (type === 'url') {
          const valStr = value || '';
          const [label, path] = valStr.includes('::') ? valStr.split('::') : [valStr, valStr];
          parts.push(
            <Button
              key={match.index}
              size="small"
              color="primary"
              variant="text"
              onClick={() => {
                if (path.startsWith('http') || path.startsWith('mailto:')) {
                  window.open(path, '_blank');
                } else {
                  onNavClick(path);
                }
              }}
              sx={{ mx: 0.5, textTransform: 'none', py: 0, height: 24, fontSize: '0.75rem', textDecoration: 'underline' }}
            >
              {label || path}
            </Button>
          );
        }
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < node.length) {
        parts.push(node.substring(lastIndex));
      }
      return parts.length > 0 ? parts : node;
    }

    if (React.isValidElement(node) && (node.props as any).children) {
      return React.cloneElement(node as any, {
        children: React.Children.map((node.props as any).children, process)
      });
    }

    if (Array.isArray(node)) {
      return node.map(process);
    }

    return node;
  };

  return <>{process(children)}</>;
};

const ChatMessageItem = React.memo(({ msg, t, onRetry, lastPrompt, onPromptClick, onTickerClick, onProfileClick, onNavClick }: {
  msg: ExtendedChatMessage,
  t: (e: string, h: string) => string,
  onRetry: (prompt: string) => void,
  lastPrompt: string,
  onPromptClick: (text: string) => void,
  onTickerClick: (exchange: string, symbol: string) => void,
  onProfileClick: () => void,
  onNavClick: (path: string) => void
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
          '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace' },
          '& table': {
            width: '100%',
            borderCollapse: 'collapse',
            mb: 1,
            direction: 'inherit',
            '& th, & td': {
              border: '1px solid',
              borderColor: 'divider',
              p: 1,
              textAlign: 'inherit'
            },
            '& th': {
              bgcolor: 'action.hover',
              fontWeight: 'bold'
            },
            '& tr:nth-of-type(even)': {
              bgcolor: 'action.hover'
            }
          }
        }}>
          {msg.role === 'model' ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p><LinkParser t={t} onPromptClick={onPromptClick} onTickerClick={onTickerClick} onProfileClick={onProfileClick} onNavClick={onNavClick}>{children}</LinkParser></p>,
                li: ({ children }) => <li><LinkParser t={t} onPromptClick={onPromptClick} onTickerClick={onTickerClick} onProfileClick={onProfileClick} onNavClick={onNavClick}>{children}</LinkParser></li>,
                td: ({ children }) => <td><LinkParser t={t} onPromptClick={onPromptClick} onTickerClick={onTickerClick} onProfileClick={onProfileClick} onNavClick={onNavClick}>{children}</LinkParser></td>,
              }}
            >
              {msg.parts[0].text}
            </ReactMarkdown>
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

const ChatInputSection = React.memo(({ onSend, isLoading, t, initialValue }: {
  onSend: (val: string) => void,
  isLoading: boolean,
  t: (e: string, h: string) => string,
  initialValue: string
}) => {
  const [value, setValue] = useState(initialValue);

  // Sync when initialValue changes from outside (suggestion chips)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSend = () => {
    if (value.trim() && !isLoading) {
      onSend(value);
      setValue('');
    }
  };

  return (
    <DialogActions sx={{ p: 2 }}>
      <TextField
        fullWidth
        placeholder={t('Ask a question...', 'שאל שאלה...')}
        variant="outlined"
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        disabled={isLoading}
      />
      <Button
        variant="contained"
        onClick={handleSend}
        disabled={isLoading || !value.trim()}
        endIcon={<SendIcon sx={{ transform: useLanguage().isRtl ? 'rotate(180deg)' : 'none' }} />}
      >
        {t('Send', 'שלח')}
      </Button>
    </DialogActions>
  );
});



export const AiChatDialog: React.FC<AiChatDialogProps> = ({ open, onClose, apiKey, sheetId, portfolioData, onTickerClick: extOnTickerClick, onNavClick, initialPrompt }) => {
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
  const [marketOverview, setMarketOverview] = useState<string>('');

  useEffect(() => {
    if (open && apiKey) {
      const fetchMarketOverview = async () => {
        try {
          const symbols = [
            { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
            { ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100' },
            { ticker: '137', exchange: Exchange.TASE, name: 'TA-125', sid: 137 },
            { ticker: '120010', exchange: Exchange.CBS, name: 'Israel consumer price index (inflation)', sid: 120010 },
            { ticker: 'TCH-F91', exchange: Exchange.TASE, name: 'Israel 1Y government bond' },
          ];

          const results = await Promise.all(
            symbols.map(s => getTickerData(s.ticker, s.exchange, s.sid || null))
          );

          const overview = symbols.map((s, i) => {
            const data = results[i];
            if (!data) return `${s.name}: N/A`;
            const stats = [
              data.changePct1d !== undefined ? `1D: ${formatPercent(data.changePct1d)}` : null,
              data.changePctRecent !== undefined ? `1W: ${formatPercent(data.changePctRecent)}` : null,
              data.changePct1m !== undefined ? `1M: ${formatPercent(data.changePct1m)}` : null,
              data.changePct3m !== undefined ? `3M: ${formatPercent(data.changePct3m)}` : null,
              data.changePctYtd !== undefined ? `YTD: ${formatPercent(data.changePctYtd)}` : null,
              data.changePct1y !== undefined ? `1Y: ${formatPercent(data.changePct1y)}` : null,
              data.changePct5y !== undefined ? `5Y: ${formatPercent(data.changePct5y)}` : null,
            ].filter(Boolean).join(', ');

            return `${s.name}: ${stats}`;
          }).join('\n');

          setMarketOverview(overview);
        } catch (err) {
          console.error("Failed to fetch market overview", err);
        }
      };

      fetchMarketOverview();
    }
  }, [open, apiKey]);

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

  const handleSaveProfile = async (profile: UserFinancialProfile) => {
    if (!sheetId) return;
    setSavingProfile(true);
    try {
      await setMetadataValue(sheetId, 'user_financial_profile', JSON.stringify(profile));
      setUserProfile(profile);
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
  const triggeredPromptRef = useRef<string | null>(null);

  // Handle initial prompt from deep link
  useEffect(() => {
    if (open && initialPrompt && triggeredPromptRef.current !== initialPrompt) {
      triggeredPromptRef.current = initialPrompt;
      handleSend(initialPrompt);
    }
  }, [open, initialPrompt]);

  // Reset trigger when dialog closes
  useEffect(() => {
    if (!open) {
      triggeredPromptRef.current = null;
    }
  }, [open]);

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
      symbol: h.ticker,
      exchange: h.exchange,
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

  const handleSend = async (customPrompt?: string) => {
    if (!apiKey) return;
    // Use prompt if provided (chips/retry); otherwise use cached state if it was a chip, 
    // but ChatInputSection actually calls this with the text.
    const userMsg = (customPrompt || input).trim();
    if (!userMsg) return;

    setIsLoading(true);
    lastPromptRef.current = userMsg;
    if (input) setInput(''); // Clear suggestion if it was used

    if (customPrompt) {
      // Remove any existing error messages before retrying
      setMessages(prev => prev.filter(m => !m.isError));
    }

    if (!messages.some(m => m.parts[0].text === userMsg && m.role === 'user')) {
      setMessages(prev => [...prev, { role: 'user', parts: [{ text: userMsg }] }]);
    }

    try {
      // Ensure error messages are NOT sent to the model history
      const history = messages.filter((m) => !m.isError);

      const profileContext = userProfile && Object.keys(userProfile).length > 0
        ? `\nUser Profile: ${JSON.stringify(userProfile)}`
        : '';

      const systemInstruction = `
You are a financial assistant. Be professional, objective, and direct. Avoid excessive praise or flattery. Focus on data-driven analysis and facts. 
Please be careful in your wording around suggestions - you are just an AI.
- You can create interactive links in your response using these formats:
 * {prompt::Text to prefill} to suggest a new prompt for the user
 * {ticker::Label::EXCHANGE:SYMBOL} to link to a specific ticker e.g. {ticker::Google::NASDAQ:GOOGL}
 * {userinfo::Button Text} to link to the user profile info form
 * {url::Label::Path} to navigate to any URL

==User Context==
${profileContext}

==Current Portfolio Data==
${summarizePortfolio()}

==Market Overview Benchmarks==
${marketOverview}

==User Session Start==`;

      const response = await askGemini(apiKey, history, userMsg, selectedModel, systemInstruction);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: response }] }]);
    } catch (err: any) {
      console.error("Gemini Error:", err);
      let errorMsg = t('Sorry, I encountered an error while processing your request.', 'מצטער, נתקלתי בשגיאה בעיבוד הבקשה שלך.');

      const errMsg = err.message?.toLowerCase() || '';
      if (errMsg.includes('quota') || errMsg.includes('rate limit') || errMsg.includes('exceeded')) {
        errorMsg = t(
          'Quota exceeded for this model. Try switching to "Fast" mode for higher limits.',
          'חריגה ממכסת המודל. נסה לעבור למצב "מהיר" לקבלת מגבלות גבוהות יותר.'
        );
      } else if (errMsg.includes('high demand')) {
        errorMsg = t(
          'The model is currently experiencing high demand. Please try again in a few moments.',
          'המודל חווה כרגע עומס גבוה. אנא נסה שוב בעוד מספר רגעים.'
        );
      }

      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: errorMsg }],
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
              <Button
                onClick={() => setOpenProfile(true)}
                size="small"
                color="inherit"
                startIcon={<ManageAccountsIcon />}
                sx={{ mr: 1, textTransform: 'none', opacity: 0.7 }}
              >
                {t('Profile', 'פרופיל')}
              </Button>
            </Tooltip>
            <Tooltip title={t('Clear History', 'נקה היסטוריה')}>
              <Button
                onClick={clearHistory}
                size="small"
                color="inherit"
                startIcon={<DeleteOutlineIcon />}
                sx={{ mr: 1, textTransform: 'none', opacity: 0.7 }}
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
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, mb: 3 }}>
                  <SmartToyIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                      {t('Hello! I can help you analyze your portfolio.', 'שלום! אני יכול לעזור לך לנתח את התיק שלך.')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('Try asking one of these:', 'נסה לשאול את אחת השאלות הבאות:')}
                    </Typography>
                  </Box>
                </Box>
                <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" sx={{ maxWidth: '100%', mx: 'auto', px: 2 }}>
                  {[
                    t("Perform a FIRE (Financial Independence) analysis", "בצע ניתוח FIRE (עצמאות כלכלית)"),
                    t("What are the key risks in my portfolio?", "מהם הסיכונים המרכזיים בתיק?"),
                    t("How is my asset allocation distributed?", "איך נראית הקצאת הנכסים שלי?"),
                    t("Check for sector over-exposure", "בדוק חשיפת יתר למגזרים מסוימים"),
                    t("Stress test: What if the market drops 20%?", "בדיקת עמידות: מה אם השוק יירד ב-20%?"),
                    t("Suggest 3 improvements for my portfolio", "הצע 3 שיפורים לתיק שלי"),
                    t("Compare my performance to the market", "השווה את הביצועים שלי לשוק"),
                  ].map((text, i) => (
                    <Chip
                      key={i}
                      label={text}
                      onClick={() => handleSend(text)}
                      clickable
                      color="primary"
                      variant="outlined"
                      size="small"
                      sx={{ py: 1.5, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', px: 2 } }}
                    />
                  ))}
                </Stack>

                {(!userProfile.netYearlyEarnings || !userProfile.yearlySpending || !userProfile.age) && (
                  <Paper variant="outlined" sx={{
                    mt: 4, px: 2, py: 1,
                    bgcolor: 'action.hover',
                    borderStyle: 'dashed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    textAlign: 'left'
                  }}>
                    <Typography variant="body2" color="text.secondary">
                      {t(
                        "Tip: Complete your financial profile to get personalized analysis and retirement projections.",
                        "טיפ: השלם את הפרופיל הפיננסי שלך כדי לקבל ניתוח ותחזיות פרישה מותאמות אישית."
                      )}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setOpenProfile(true)}
                      startIcon={<ManageAccountsIcon />}
                      sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                    >
                      {t("Complete Profile", "השלם פרופיל")}
                    </Button>
                  </Paper>
                )}
              </Box>
            )}
            {messages.map((msg, i) => (
              <ChatMessageItem
                key={i}
                msg={msg}
                t={t}
                onRetry={handleSend}
                lastPrompt={lastPromptRef.current}
                onPromptClick={(text) => setInput(text)}
                onTickerClick={(ex, sym) => extOnTickerClick?.({ exchange: ex, symbol: sym })}
                onProfileClick={() => setOpenProfile(true)}
                onNavClick={(path) => onNavClick?.(path)}
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
        <ChatInputSection
          onSend={handleSend}
          isLoading={isLoading}
          t={t}
          initialValue={input}
        />
      </Dialog>


      {/* Profile Dialog */}
      {openProfile && (
        <ProfileForm
          open={openProfile}
          initialProfile={userProfile}
          loadingProfile={loadingProfile}
          displayCurrency={portfolioData.displayCurrency}
          onSave={handleSaveProfile}
          onCancel={() => setOpenProfile(false)}
          savingProfile={savingProfile}
        />
      )}
    </>
  );
};
