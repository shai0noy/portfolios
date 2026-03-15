import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, IconButton,
  CircularProgress, Paper, Tooltip, Select, MenuItem, FormControl,
  FormControlLabel, Chip, Stack, ToggleButton, ToggleButtonGroup, Switch, Alert, useTheme,
  useMediaQuery, Menu
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import LaunchIcon from '@mui/icons-material/Launch';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MenuIcon from '@mui/icons-material/Menu';
import PersonIcon from '@mui/icons-material/Person';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { useLanguage } from '../lib/i18n';
import { ProfileForm, type UserFinancialProfile } from './ProfileForm';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type ChatMessage, askGemini, fetchModels, type GeminiModel, getModelByCapability } from '../lib/gemini';
import { calculateDashboardSummary } from '../lib/dashboard_calc';
import { type Portfolio, type DashboardHolding, type ExchangeRates, Exchange } from '../lib/types';
import { type FinanceEngine } from '../lib/data/engine';
import { formatPercent } from '../lib/currencyUtils';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { getMetadataValue, setMetadataValue } from '../lib/sheets/api';
import { getTickerData } from '../lib/fetching';
import { useScrollShadows, ScrollShadows, useResponsiveDialogProps } from '../lib/ui-utils';
import toast from 'react-hot-toast';

interface ExtendedChatMessage extends ChatMessage {
  isError?: boolean;
  portfolioName?: string;
}



interface AiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  sheetId: string;
  holdings: DashboardHolding[];
  portfolios: Portfolio[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  engine: FinanceEngine | null;
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
              sx={{
                mx: 0.5,
                my: 0.5,
                textTransform: 'none',
                height: 'auto',
                minHeight: 26,
                py: 0.5,
                px: 1,
                fontSize: '0.75rem',
                display: 'inline-flex',
                verticalAlign: 'middle',
                whiteSpace: 'normal',
                textAlign: 'inherit',
                lineHeight: 1.2
              }}
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
        gap: 1.5,
        mb: 1,
        width: '100%',
        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
      }}
    >
      {!isMobile && (
        <Box sx={{ flexShrink: 0, mt: 1 }}>
          {msg.role === 'model' ? <SmartToyIcon color="primary" /> : <PersonIcon color="action" />}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1, maxWidth: isMobile ? 'calc(100% - 20px)' : '85%' }}>
        {msg.role === 'user' && msg.portfolioName && (
          <Typography variant="caption" sx={{ alignSelf: 'flex-end', opacity: 0.7, mr: 0.5 }}>
            {t('Context: ', 'הקשר: ')}{msg.portfolioName}
          </Typography>
        )}
        <Paper
          sx={{
            p: 1.5,
            bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
            color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            position: 'relative',
            overflow: 'visible',
            width: '100%',
            // Paddings to make space for the icon inside
            pl: isMobile && msg.role === 'model' ? '40px' : 1.5,
            pr: isMobile && msg.role === 'user' ? '40px' : 1.5,
          }}
        >
          {isMobile && (
            <Box sx={{
              position: 'absolute',
              top: -8,
              left: msg.role === 'model' ? -8 : 'auto',
              right: msg.role === 'user' ? -8 : 'auto',
              bgcolor: msg.role === 'model' ? 'primary.main' : 'background.paper',
              borderRadius: '50%',
              p: 0.5,
              display: 'flex',
              border: `2px solid ${theme.palette.text.primary}`,
              boxShadow: 2,
              opacity: 0.95
            }}>
              {msg.role === 'model' ?
                <SmartToyIcon sx={{ fontSize: 20, color: 'primary.contrastText' }} /> :
                <PersonIcon color="action" sx={{ fontSize: 20 }} />
              }
            </Box>
          )}
          <Typography component="div" variant="body2" sx={{
            whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
            '& ul, & ol': { m: 0, pl: 2, mb: 1 },
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              m: 0,
              mb: 1.5,
              fontWeight: 'bold',
              lineHeight: 1.3,
              '&:not(:first-of-type)': { mt: 2 }
            },
            '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace' },
            '& table': {
              display: 'block',
              width: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              borderCollapse: 'separate',
              borderSpacing: 0,
              mb: 2,
              borderRadius: 1,
              boxShadow: 2,
              border: '1px solid',
              borderColor: 'divider',
              direction: 'inherit',
              '& th, & td': {
                borderBottom: '1px solid',
                borderRight: '1px solid',
                borderColor: 'divider',
                p: 1.5,
                textAlign: 'inherit',
                minWidth: 80,
                fontSize: '0.8rem',
                '&:last-child': {
                  borderRight: 'none'
                }
              },
              '& tr:last-child td': {
                borderBottom: 'none'
              },
              '& th': {
                bgcolor: 'action.hover',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                color: 'text.secondary',
                textTransform: 'uppercase',
                fontSize: '0.7rem',
                letterSpacing: '0.05em'
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
                  a: ({ node, ...props }) => {
                    const href = props.href || '';
                    const childArr = Array.isArray(props.children) ? props.children : [props.children];
                    if (childArr[0] && typeof childArr[0] === 'string' && childArr[0].match(/^\[\[?\s*\d+\s*\]\]?$/)) {
                      // Note: the regex covers [[1]] or [1] or [[ 1 ]] formats
                      return (
                        <Tooltip title={href} arrow placement="top">
                          <Box component="a" href={href} target="_blank"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              verticalAlign: 'middle',
                              color: 'primary.main',
                              textDecoration: 'none',
                              mx: 0.3,
                              '&:hover': { color: 'primary.dark' }
                            }}
                          >
                            <LaunchIcon sx={{ fontSize: '0.75rem' }} />
                          </Box>
                        </Tooltip>
                      );
                    }
                    return (
                      <Box
                        component="a"
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                        sx={{
                          color: 'primary.main',
                          textDecoration: 'none',
                          fontWeight: 500,
                          borderBottom: '1px solid transparent',
                          transition: 'all 0.2s',
                          '&:hover': {
                            color: 'primary.dark',
                            borderBottomColor: 'currentcolor'
                          }
                        }}
                      />
                    );
                  }
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
      </Box>
    </Box>
  );
});

const ChatInputSection = React.memo(({ onSend, isLoading, t, initialValue, selectedPortfolioId, setSelectedPortfolioId, portfolios }: {
  onSend: (val: string) => void,
  isLoading: boolean,
  t: (e: string, h: string) => string,
  initialValue: string,
  selectedPortfolioId: string | null,
  setSelectedPortfolioId: (val: string | null) => void,
  portfolios: Portfolio[]
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
    <Box sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
      <FormControl size="small" variant="outlined" sx={{ minWidth: { xs: 100, sm: 140 }, flexShrink: 0 }}>
        <Select
          value={selectedPortfolioId || 'All'}
          onChange={(e) => setSelectedPortfolioId(e.target.value === 'All' ? null : e.target.value as string)}
          sx={{ fontSize: '0.75rem', height: 36, borderRadius: 2, bgcolor: 'background.paper' }}
        >
          <MenuItem value="All" sx={{ fontSize: '0.8rem' }}><em>{t('All', 'הכל')}</em></MenuItem>
          {portfolios.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.8rem' }}>{p.name}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        placeholder={t('Ask a question...', 'שאל שאלה...')}
        variant="outlined"
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        disabled={isLoading}
        sx={{ '& .MuiInputBase-root': { height: 36 } }}
      />
      <IconButton
        color="primary"
        onClick={handleSend}
        disabled={isLoading || !value.trim()}
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          height: 36,
          width: 36,
          '&:hover': { bgcolor: 'primary.dark' },
          '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }
        }}
      >
        <SendIcon sx={{ transform: useLanguage().isRtl ? 'rotate(180deg)' : 'none', fontSize: 20 }} />
      </IconButton>
    </Box>
  );
});



export const AiChatDialog: React.FC<AiChatDialogProps> = ({
  open, onClose, apiKey, sheetId,
  holdings, portfolios, displayCurrency, exchangeRates, engine,
  onTickerClick: extOnTickerClick, onNavClick, initialPrompt
}) => {
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState<ExtendedChatMessage[]>(() => {
    const saved = localStorage.getItem('ai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(localStorage.getItem('gemini_selected_model') || 'models/gemini-1.5-flash');
  const { containerRef: scrollRef, showTop, showBottom, showLeft, showRight } = useScrollShadows('both');
  const responsiveDialogProps = useResponsiveDialogProps();
  const lastPromptRef = useRef<string>('');

  const [chatMode, setChatMode] = useState<'fast' | 'thinking'>('fast');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null); // For mobile menu
  const [input, setInput] = useState(initialPrompt || ''); // For ChatInputSection

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleChatModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: 'fast' | 'thinking' | null,
  ) => {
    if (newMode !== null) {
      setChatMode(newMode);
      handleMenuClose(); // Close menu after selection
    }
  };

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  const portfolioData = React.useMemo(() => {
    const filteredHoldings = selectedPortfolioId
      ? holdings.filter(h => h.portfolioId === selectedPortfolioId)
      : holdings;
    const newPortMap = new Map(portfolios.map(p => [p.id, p]));
    const calc = calculateDashboardSummary(filteredHoldings, displayCurrency, exchangeRates, newPortMap, engine);
    return {
      holdings: calc.holdings,
      summary: calc.summary,
      displayCurrency
    };
  }, [holdings, selectedPortfolioId, portfolios, displayCurrency, exchangeRates, engine]);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [openDisclaimer, setOpenDisclaimer] = useState(true);
  const [openProfile, setOpenProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserFinancialProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [openClearConfirm, setOpenClearConfirm] = useState(false);
  const [marketOverview, setMarketOverview] = useState<string>('');
  const [enableGrounding, setEnableGrounding] = useState<boolean>(false);

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
      toast.error(t('Failed to save profile', 'שמירת הפרופיל נכשלה'));
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
      weightInAllHoldings: formatPercent(h.display.weightInGlobal),
      portfolioId: h.portfolioId,
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

    const getTaxPolicyDesc = (policy?: string) => {
      switch (policy) {
        case 'TAX_FREE': return 'Tax Exempt / Keren Hishtalmut (0% Capital Gains Tax)';
        case 'IL_REAL_GAIN': return 'Israeli Real Gain (Taxed only on capital gains that exceed inflation/CPI)';
        case 'NOMINAL_GAIN': return 'Nominal Gain (Taxed on absolute value of capital gains)';
        case 'PENSION': return 'Pension / Providence Fund (Subject to special retirement fund tax rules, usually after retirement age)';
        case 'RSU_ACCOUNT': return 'RSU Account (Vesting taxed as income tax; subsequent gains taxed as capital gains)';
        default: return 'NA';
      }
    };

    const portfoliosInfo = (selectedPortfolioId
      ? portfolios.filter(p => p.id === selectedPortfolioId)
      : portfolios).map(p => {
        const portMap = new Map([[p.id, p]]);
        const portHoldings = holdings.filter(h => h.portfolioId === p.id);
        const calcObj = calculateDashboardSummary(portHoldings, displayCurrency, exchangeRates, portMap, engine);

        return {
          id: p.id,
          name: p.name,
          currency: p.currency,
          taxLevel: formatPercent(p.cgt),
          taxPolicy: getTaxPolicyDesc(p.taxPolicy),
          incomeTaxLevel: p.incTax ? formatPercent(p.incTax) : undefined,
          mgmtFee: p.mgmtVal ? `${p.mgmtType === 'percentage' ? formatPercent(p.mgmtVal) : p.mgmtVal} ${p.mgmtFreq || ''}`.trim() : 'None',
          totalValue: calcObj.summary.aum,
          valueAfterTax: calcObj.summary.valueAfterTax
        };
      });

    return JSON.stringify({
      activePortfolios: portfoliosInfo,
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

  const handleSend = async (customPrompt?: string | any, searchToggle?: boolean) => {
    if (!apiKey) return;

    const actualPrompt = typeof customPrompt === 'string' ? customPrompt : '';
    const shouldSearch = (typeof searchToggle === 'boolean') ? searchToggle : enableGrounding;

    // Use prompt if provided (chips/retry); otherwise use cached state if it was a chip,
    // but ChatInputSection actually calls this with the text.
    const userMsg = (actualPrompt || input).trim();
    if (!userMsg) return;

    setIsLoading(true);
    lastPromptRef.current = userMsg;
    if (input) setInput(''); // Clear suggestion if it was used

    if (actualPrompt) {
      // Remove any existing error messages before retrying
      setMessages(prev => prev.filter(m => !m.isError));
    }

    if (!messages.some(m => m.parts[0].text === userMsg && m.role === 'user')) {
      const portName = selectedPortfolioId ? portfolios.find(p => p.id === selectedPortfolioId)?.name : t('All Portfolios', 'כל התיקים');
      setMessages(prev => [...prev, { role: 'user', parts: [{ text: userMsg }], portfolioName: portName }]);
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
- DO NOT list sources at the end of your response.
- You can create interactive links in your response using these formats:
 * {prompt::Text to prefill} to suggest a new prompt for the user
 * {ticker::Label::EXCHANGE:SYMBOL} to link to a specific ticker e.g. {ticker::Google::NASDAQ:GOOGL}
 * {userinfo::Button Text} to link to the user profile info form
 * {url::Label::Path} to navigate to any URL
 * Not supported! - {portfolio::XYZ}

==User Context==
${profileContext}

==Current Portfolio Data==
${summarizePortfolio()}

==Market Overview Benchmarks==
${marketOverview}

==User Session Start==`;

      const response = await askGemini(apiKey, history, userMsg, selectedModel, systemInstruction, shouldSearch);
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
    setOpenClearConfirm(true);
  };

  const confirmClearHistory = () => {
    setMessages([]);
    localStorage.removeItem('ai_chat_history');
    setOpenClearConfirm(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        {...responsiveDialogProps}
        sx={{
          '& .MuiDialog-paper': {
            height: isMobile ? '100%' : '90%',
            maxHeight: isMobile ? '100%' : '800px'
          }
        }}
      >
        <DialogTitle sx={{ p: { xs: 1, sm: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, overflow: 'hidden' }}>
              <AutoAwesomeIcon color="primary" />
              <Typography sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>
                {t('AI Portfolio Assistant', 'עוזר תיק השקעות AI')}
              </Typography>

              {/* Desktop Controls */}
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 2, ml: 2 }}>
                {!isExpertMode ? (
                  <ToggleButtonGroup
                    value={chatMode}
                    exclusive
                    onChange={handleChatModeChange}
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
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <Select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        sx={{ height: 32, fontSize: '0.8rem' }}
                      >
                        {availableModels.map(m => (
                          <MenuItem key={m.name} value={m.name} sx={{ fontSize: '0.8rem' }}>
                            {m.displayName}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                )}
                <FormControlLabel
                  control={<Switch size="small" checked={isExpertMode} onChange={(e) => setIsExpertMode(e.target.checked)} />}
                  label={<Typography variant="caption">{t('Expert Mode', 'מצב מומחה')}</Typography>}
                  sx={{ ml: 0 }}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={enableGrounding} onChange={(e) => setEnableGrounding(e.target.checked)} color="primary" />}
                  label={
                    <Typography variant="caption" sx={{ color: enableGrounding ? 'text.primary' : 'text.secondary', display: { xs: 'none', md: 'block' } }}>
                      {t('Live Web', 'רשת חיה')}
                    </Typography>
                  }
                  sx={{ ml: 1, mr: 1 }}
                />
              </Box>

            </Box>


            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
              {/* Mobile Burger Menu */}
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                <IconButton onClick={handleMenuOpen} sx={{ color: 'text.primary' }}>
                  <MenuIcon />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                >
                  <Box sx={{ px: 2, py: 1 }}>
                    <Typography variant='caption' color='textSecondary' sx={{ display: 'block', mb: 1 }}>
                      {t('Response Mode', 'מצב תגובה')}
                    </Typography>
                    <ToggleButtonGroup
                      value={chatMode}
                      exclusive
                      onChange={handleChatModeChange}
                      size="small"
                      orientation='vertical'
                      sx={{ width: '100%' }}
                    >
                      <ToggleButton value="fast" sx={{ textTransform: 'none', gap: 1, justifyContent: 'flex-start' }}>
                        <BoltIcon fontSize="small" /> {t('Fast', 'מהיר')}
                      </ToggleButton>
                      <ToggleButton value="thinking" sx={{ textTransform: 'none', gap: 1, justifyContent: 'flex-start' }}>
                        <PsychologyIcon fontSize="small" /> {t('Thinking', 'חושב')}
                      </ToggleButton>
                    </ToggleButtonGroup>

                    <FormControlLabel
                      control={<Switch checked={isExpertMode} onChange={(e) => { setIsExpertMode(e.target.checked); handleMenuClose(); }} />}
                      label={t('Expert Mode', 'מצב מומחה')}
                      sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', ml: 0, width: '100%' }}
                    />

                    <FormControlLabel
                      control={<Switch checked={enableGrounding} onChange={(e) => { setEnableGrounding(e.target.checked); }} color="primary" />}
                      label={
                        <Typography variant="body2">{t('Include Live Web Data', 'כלול נתוני רשת חיים')}</Typography>
                      }
                      sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', ml: 0, width: '100%' }}
                    />

                    {isExpertMode && (
                      <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                        <Select
                          value={selectedModel}
                          onChange={(e) => { setSelectedModel(e.target.value); handleMenuClose(); }}
                        >
                          {availableModels.map(m => (
                            <MenuItem key={m.name} value={m.name} sx={{ fontSize: '0.8rem' }}>
                              {m.displayName}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                  </Box>
                </Menu>
              </Box>

              <Tooltip title={t('User Financial Profile', 'פרופיל משתמש')}>
                <IconButton onClick={() => setOpenProfile(true)} size="small" sx={{ color: 'text.primary' }}>
                  <ManageAccountsIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('Clear History', 'נקה היסטוריה')}>
                <IconButton onClick={clearHistory} size="small" sx={{ color: 'text.primary' }}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Tooltip>
              <IconButton onClick={onClose} size="small" sx={{ color: 'text.primary' }}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ position: 'relative', flex: '1 1 auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box
              ref={scrollRef}
              sx={{
                flex: '1 1 auto',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 2,
                '&::-webkit-scrollbar-corner': { background: 'transparent' }
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
                      t("Predict my future portfolio growth", "חזה את צמיחת העתיד של התיק שלי"),
                      t("What are my top and worst performers?", "מהם הביצועים הטובים והגרועים ביותר שלי?"),
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
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', width: '100%' }}>
                  {!isMobile && <SmartToyIcon color="primary" sx={{ mt: 1, flexShrink: 0 }} />}
                  <Paper sx={{
                    p: 1.5,
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'visible',
                    flexGrow: 1,
                    maxWidth: isMobile ? 'calc(100% - 20px)' : 'fit-content',
                    pl: isMobile ? '40px' : 1.5
                  }}>
                    {isMobile && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        bgcolor: 'primary.main',
                        borderRadius: '50%',
                        p: 0.5,
                        display: 'flex',
                        border: `2px solid ${theme.palette.text.primary}`,
                        boxShadow: 2,
                        opacity: 0.95
                      }}>
                        <SmartToyIcon sx={{ fontSize: 20, color: 'primary.contrastText' }} />
                      </Box>
                    )}
                    <CircularProgress size={20} />
                  </Paper>
                </Box>
              )}
              <Box sx={{ minHeight: 20 }} />
            </Box>
            <ScrollShadows top={showTop} bottom={showBottom} left={showLeft} right={showRight} theme={theme} />
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
          onSend={(text) => handleSend(text)}
          isLoading={isLoading}
          t={t}
          initialValue={input}
          selectedPortfolioId={selectedPortfolioId}
          setSelectedPortfolioId={setSelectedPortfolioId}
          portfolios={portfolios}
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

      {/* Clear History Confirmation */}
      <Dialog
        open={openClearConfirm}
        onClose={() => setOpenClearConfirm(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteOutlineIcon color="error" />
          {t('Clear History', 'נקה היסטוריה')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t(
              'Are you sure you want to clear the entire chat history? This action cannot be undone.',
              'האם אתה בטוח שברצונך למחוק את כל היסטוריית הצ׳אט? פעולה זו אינה הפיכה.'
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setOpenClearConfirm(false)} color="inherit" variant="text">
            {t('Cancel', 'ביטול')}
          </Button>
          <Button onClick={confirmClearHistory} color="error" variant="contained" disableElevation>
            {t('Clear', 'נקה')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
