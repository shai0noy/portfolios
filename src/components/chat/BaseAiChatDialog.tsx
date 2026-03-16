import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent,
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
import HistoryIcon from '@mui/icons-material/History';
import AddCommentIcon from '@mui/icons-material/AddComment';

import { useLanguage } from '../../lib/i18n';
import { loadSessions, saveSession, getSession, deleteSession } from '../../lib/utils/chat_storage';
import type { ChatSession } from '../../lib/utils/chat_storage';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatHistoryDrawer } from './ChatHistoryDrawer';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type ExtendedChatMessage, askGemini, fetchModels, type GeminiModel, getModelByCapability } from '../../lib/gemini';
import { type Portfolio } from '../../lib/types';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { useScrollShadows, ScrollShadows, useResponsiveDialogProps } from '../../lib/ui-utils';

export interface BaseAiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  chatId: string;
  contextUrl: string;

  title: React.ReactNode;
  headerIcon?: React.ReactNode;

  getSystemInstruction: () => string | Promise<string>;

  suggestions?: string[];
  emptyStateContent?: (onSend: (text: string) => void) => React.ReactNode;
  disclaimerText?: string;
  customDisclaimer?: React.ReactNode;

  headerMenuAddons?: React.ReactNode;

  portfolios?: Portfolio[];
  selectedPortfolioId?: string | null;
  onPortfolioChange?: (id: string | null) => void;

  onTickerClick?: (exchange: string, symbol: string) => void;
  onNavClick?: (path: string) => void;
  onProfileClick?: () => void;

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
}

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
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography component="span" variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.parts[0].text}
                </Typography>
                {msg.portfolioName && (
                  <Typography variant="caption" sx={{ alignSelf: 'flex-start', opacity: 0.6, mt: 0.5, fontSize: '0.65rem' }}>
                    {msg.portfolioName}
                  </Typography>
                )}
              </Box>
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
  const [isExpanded, setIsExpanded] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const hasPortfolios = portfolios && portfolios.length > 0;

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!inputContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 45) {
          setIsExpanded(true);
        }
      }
    });
    observer.observe(inputContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (value.trim() === '') {
      setIsExpanded(false);
    }
  }, [value]);

  const handleSend = () => {
    if (value.trim() && !isLoading) {
      onSend(value);
      setValue('');
    }
  };

  return (
    <Box sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'flex-end', position: 'relative' }}>
      {hasPortfolios && (
        <>
          <Box sx={{
            width: isExpanded ? 0 : { xs: 100, sm: 140 },
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0
          }} />

          <FormControl size="small" variant="outlined" sx={{
            position: 'absolute',
            bottom: isExpanded ? 60 : 18,
            ...(useLanguage().isRtl
              ? { right: isExpanded ? 'calc(100% - 52px)' : 16 }
              : { left: isExpanded ? 'calc(100% - 52px)' : 16 }
            ),
            width: isExpanded ? 36 : { xs: 100, sm: 140 },
            height: isExpanded ? 20 : 36,
            zIndex: 10,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            mb: isExpanded ? 0 : '2px'
          }}>
            <Select
              value={selectedPortfolioId || 'All'}
              onChange={(e) => setSelectedPortfolioId(e.target.value === 'All' ? null : e.target.value as string)}
              IconComponent={isExpanded ? () => null : undefined}
              renderValue={isExpanded ? () => (
                <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', alignItems: 'center', height: '100%' }}>
                  <MenuIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </Box>
              ) : undefined}
              sx={{
                fontSize: '0.75rem',
                height: isExpanded ? 20 : 36,
                borderRadius: 2,
                bgcolor: 'background.paper',
                '& .MuiSelect-select': isExpanded ? {
                  p: '0 !important',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%'
                } : {}
              }}
            >
              <MenuItem value="All" sx={{ fontSize: '0.8rem' }}><em>{t('All Portfolios', 'כל התיקים')}</em></MenuItem>
              {portfolios.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.8rem' }}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
        </>
      )}
      <Box ref={inputContainerRef} sx={{ flexGrow: 1 }}>
        <TextField
          fullWidth
          placeholder={t('Ask a question...', 'שאל שאלה...')}
          variant="outlined"
          size="small"
          multiline
          minRows={isExpanded ? 2 : 1}
          maxRows={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isLoading}
          sx={{ '& .MuiInputBase-root': { minHeight: 40, padding: '8.5px 14px' } }}
        />
      </Box>
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
          mb: '2px',
          flexShrink: 0,
          '&:hover': { bgcolor: 'primary.dark' },
          '&.Mui-disabled': { bgcolor: 'action.disabledBackground' }
        }}
      >
        <SendIcon sx={{ transform: useLanguage().isRtl ? 'rotate(180deg)' : 'none', fontSize: 20 }} />
      </IconButton>
    </Box>
  );
});

export const BaseAiChatDialog: React.FC<BaseAiChatDialogProps> = ({
  open, onClose, apiKey, chatId, contextUrl, title, headerIcon,
  getSystemInstruction, suggestions = [], emptyStateContent,
  disclaimerText, customDisclaimer, headerMenuAddons,
  portfolios = [], selectedPortfolioId = null, onPortfolioChange = () => { },
  onTickerClick, onNavClick, onProfileClick, initialPrompt
}) => {
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const location = useLocation();

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    if (location.state && (location.state as any).openAiChatId) {
      return (location.state as any).openAiChatId;
    }
    if (window.history.state && window.history.state.openAiChatId) {
      return window.history.state.openAiChatId;
    }
    const sess = loadSessions().filter(s => s.contextId === chatId).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return sess ? sess.id : uuidv4();
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);

  // Load active session messages & all sessions on mount / sessionId change
  useEffect(() => {
    setSessions(loadSessions());
    if (activeSessionId) {
      const sess = getSession(activeSessionId);
      setMessages(sess ? sess.messages : []);
    }
  }, [activeSessionId, open]);

  // Save session when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const messageText = messages[0].parts[0].text || '';
      const sessTitle = messageText.substring(0, 40) + (messageText.length > 40 ? '...' : '');
      const newSession: ChatSession = {
        id: activeSessionId,
        contextId: chatId,
        title: sessTitle,
        contextUrl: contextUrl,
        updatedAt: Date.now(),
        messages: messages,
      };
      saveSession(newSession);
      setSessions(loadSessions());
    }
  }, [messages, activeSessionId, chatId, contextUrl]);

  const handleNewChat = () => {
    setActiveSessionId(uuidv4());
    setMessages([]);
    setIsHistoryOpen(false);
  };

  const handleSelectSession = (session: ChatSession) => {
    if (session.contextId === chatId) {
      setActiveSessionId(session.id);
      setIsHistoryOpen(false);
    } else {
      navigate(session.contextUrl, { state: { openAiChatId: session.id } });
    }
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    setSessions(loadSessions());
    if (id === activeSessionId) {
      handleNewChat();
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(localStorage.getItem('gemini_selected_model') || 'models/gemini-1.5-flash');
  const { containerRef: scrollRef, showTop, showBottom, showLeft, showRight } = useScrollShadows('both');
  const responsiveDialogProps = useResponsiveDialogProps();
  const lastPromptRef = useRef<string>('');

  const [chatMode, setChatMode] = useState<'fast' | 'thinking'>('fast');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [input, setInput] = useState(initialPrompt || '');

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
      handleMenuClose();
    }
  };

  const [isExpertMode, setIsExpertMode] = useState(false);
  const [openDisclaimer, setOpenDisclaimer] = useState(true);
  // Placeholder to remove the unused state line

  const [enableGrounding, setEnableGrounding] = useState<boolean>(true);

  useEffect(() => {
    if (open && apiKey) {
      if (!availableModels || availableModels.length === 0) {
        fetchModels(apiKey).then(models => setAvailableModels(models)).catch(console.error);
      }
    }
  }, [open, apiKey]);

  useEffect(() => {
    if (!isExpertMode && availableModels.length > 0) {
      const bestModel = getModelByCapability(availableModels, chatMode, enableGrounding);
      if (bestModel !== selectedModel) {
        setSelectedModel(bestModel);
      }
    }
  }, [chatMode, availableModels, isExpertMode, enableGrounding]);

  const triggeredPromptRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && initialPrompt && triggeredPromptRef.current !== initialPrompt) {
      triggeredPromptRef.current = initialPrompt;
      handleSend(initialPrompt);
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    if (!open) {
      triggeredPromptRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!availableModels.length) return;
    const currentExists = availableModels.some(m => m.name === selectedModel);

    if (!currentExists && !isExpertMode) {
      const bestModel = getModelByCapability(availableModels, chatMode);
      setSelectedModel(bestModel);
    }
  }, [availableModels]);

  useEffect(() => {
    localStorage.setItem('gemini_selected_model', selectedModel);
  }, [selectedModel]);

  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (scrollRef.current) {
      if (isLoading) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else if (messages.length > prevMessagesLengthRef.current) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'model') {
          const el = document.getElementById(`chat-msg-${messages.length - 1}`);
          if (el) {
            const containerTop = scrollRef.current.getBoundingClientRect().top;
            const elTop = el.getBoundingClientRect().top;
            const currentScrollTop = scrollRef.current.scrollTop;
            scrollRef.current.scrollTo({ top: currentScrollTop + (elTop - containerTop) - 16, behavior: 'smooth' });
          }
        } else {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isLoading]);

  const handleSend = async (customPrompt?: string | any, searchToggle?: boolean) => {
    if (!apiKey) return;

    const actualPrompt = typeof customPrompt === 'string' ? customPrompt : '';
    const shouldSearch = (typeof searchToggle === 'boolean') ? searchToggle : enableGrounding;

    const userMsg = (actualPrompt || input).trim();
    if (!userMsg) return;

    setIsLoading(true);
    lastPromptRef.current = userMsg;
    if (input) setInput('');

    if (actualPrompt) {
      setMessages(prev => prev.filter(m => !m.isError));
    }

    if (!messages.some(m => m.parts[0].text === userMsg && m.role === 'user')) {
      const portName = portfolios.length > 0 && selectedPortfolioId ? portfolios.find(p => p.id === selectedPortfolioId)?.name : '';
      setMessages(prev => [...prev, { role: 'user', parts: [{ text: userMsg }], portfolioName: portName }]);
    }

    try {
      const history = messages.filter((m) => !m.isError).map(m => ({ role: m.role, parts: [...m.parts] }));
      const systemInstruction = await getSystemInstruction();

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

      setMessages(prev => [...prev, { role: 'model', parts: [{ text: errorMsg }], isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <ChatHistoryDrawer
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
      />
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
              {headerIcon || <AutoAwesomeIcon color="primary" />}
              <Typography sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>
                {title}
              </Typography>

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
                      {t('Live web search', 'חיפוש חי ברשת')}
                    </Typography>
                  }
                  sx={{ ml: 1, mr: 1 }}
                />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                <IconButton onClick={handleMenuOpen} sx={{ color: 'text.primary' }}>
                  <MenuIcon />
                </IconButton>
                <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
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
                        <Typography variant="body2">{t('Live web search', 'חיפוש חי ברשת')}</Typography>
                      }
                      sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', ml: 0, width: '100%' }}
                    />

                    {isExpertMode && (
                      <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                        <Select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); handleMenuClose(); }}>
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

              {headerMenuAddons}

              {onProfileClick && (
                <Tooltip title={t('User Financial Profile', 'פרופיל משתמש')}>
                  <IconButton onClick={onProfileClick} size="small" sx={{ color: 'text.primary' }}>
                    <ManageAccountsIcon />
                  </IconButton>
                </Tooltip>
              )}
              {sessions.length > 0 && (
                <Tooltip title={t('Chat History', 'היסטוריית צ\'אט')}>
                  <IconButton onClick={() => setIsHistoryOpen(true)} size="small" sx={{ color: 'text.primary' }}>
                    <HistoryIcon />
                  </IconButton>
                </Tooltip>
              )}
              {messages.length > 0 && (
                <Tooltip title={t('New Chat', 'צ\'אט חדש')}>
                  <IconButton onClick={handleNewChat} size="small" sx={{ color: 'text.primary' }}>
                    <AddCommentIcon />
                  </IconButton>
                </Tooltip>
              )}
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
                emptyStateContent ? emptyStateContent(handleSend) : (
                  <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.8 }}>
                    <SmartToyIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
                    <Typography variant="body1" align="center" gutterBottom>
                      {t('How can I help you today?', 'איך אוכל לעזור לך היום?')}
                    </Typography>
                  </Box>
                )
              )}

              {messages.length === 0 && suggestions.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" sx={{ maxWidth: '100%', mx: 'auto', px: 2, mt: 2 }}>
                  {suggestions.map((sg, idx) => (
                    <Chip key={idx} label={sg} onClick={() => handleSend(sg)} clickable color="primary" variant="outlined" size="small" sx={{ py: 1.5, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', px: 2 } }} />
                  ))}
                </Stack>
              )}

              {messages.map((msg, i) => (
                <Box key={i} id={`chat-msg-${i}`}>
                  <ChatMessageItem
                    msg={msg} t={t} onRetry={handleSend} lastPrompt={lastPromptRef.current}
                    onPromptClick={setInput}
                    onTickerClick={onTickerClick || (() => { })}
                    onProfileClick={onProfileClick || (() => { })}
                    onNavClick={onNavClick || (() => { })}
                  />
                </Box>
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
                        position: 'absolute', top: -8, left: -8, bgcolor: 'primary.main', borderRadius: '50%',
                        p: 0.5, display: 'flex', border: `2px solid ${theme.palette.text.primary}`, boxShadow: 2, opacity: 0.95
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

          {customDisclaimer ? customDisclaimer : (openDisclaimer && disclaimerText && (
            <Alert severity="info" onClose={() => setOpenDisclaimer(false)} sx={{ mt: 0, mb: 0, py: 0, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
              {disclaimerText}
            </Alert>
          ))}
        </DialogContent>
        <ChatInputSection
          onSend={(text) => handleSend(text)}
          isLoading={isLoading}
          t={t}
          initialValue={input}
          selectedPortfolioId={selectedPortfolioId}
          setSelectedPortfolioId={onPortfolioChange}
          portfolios={portfolios}
        />
      </Dialog>
    </>
  );
};
