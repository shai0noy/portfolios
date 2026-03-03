import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, IconButton,
  CircularProgress, Paper, Tooltip, Select, MenuItem, FormControl,
  FormControlLabel, Checkbox, Chip, Stack
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useLanguage } from '../lib/i18n';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReactMarkdown from 'react-markdown';
import { type ChatMessage, askGemini, fetchModels, type GeminiModel } from '../lib/gemini';

interface AiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  portfolioData: {
    holdings: any[];
    summary: any;
    displayCurrency: string;
  };
}

export const AiChatDialog: React.FC<AiChatDialogProps> = ({ open, onClose, apiKey, portfolioData }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('ai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [showAllModels, setShowAllModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(localStorage.getItem('gemini_selected_model') || 'models/gemini-1.5-flash');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPromptRef = useRef<string>('');

  useEffect(() => {
    if (open && apiKey) {
      if (!availableModels || availableModels.length === 0) {
        fetchModels(apiKey).then(models => {
          setAvailableModels(models);
        });
      }
    }
  }, [open, apiKey]);

  // Ensure initial model selection is valid
  useEffect(() => {
    if (!availableModels.length) return;
    const currentExists = availableModels.some(m => m.name === selectedModel);
    if (!currentExists) {
      // If current selection is invalid, try to find a Gemini model
      const defaultModel = availableModels.find(m => m.name.includes('gemini-1.5-flash'))
        || availableModels.find(m => m.name.includes('gemini-pro'))
        || availableModels[0];

      if (defaultModel) setSelectedModel(defaultModel.name);
    }
  }, [availableModels, selectedModel]);

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
      qty: h.qtyTotal,
      price: h.currentPrice,
      value: h.display.marketValue,
      gain: h.display.totalGain,
      gainPct: h.display.totalGainPct,
      weight: h.display.weightInGlobal
    }));

    return JSON.stringify({
      totalValue: portfolioData.summary.aum,
      totalGain: portfolioData.summary.totalGain,
      currency: portfolioData.displayCurrency,
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
      const history = messages.filter((m: any) => !m.isError);

      const systemInstruction = `You are a professional financial advisor assistant. Analyze the following portfolio data and provide insights.\nCurrent Portfolio Data: ${summarizePortfolio()}.\nUser Session Start.`;

      const response = await askGemini(apiKey, history, userMsg, selectedModel, systemInstruction);
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: response }] }]);
    } catch (err) {
      console.error("Gemini Error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        parts: [{ text: t('Sorry, I encountered an error while processing your request.', 'מצטער, נתקלתי בשגיאה בעיבוד הבקשה שלך.') }],
        isError: true
      } as any]);
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon color="primary" /> {t('AI Portfolio Assistant', 'עוזר תיק השקעות AI')}
          </Box>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              sx={{ height: 32, fontSize: '0.8rem' }}
              displayEmpty
            >
              {availableModels.length > 0 ? (
                availableModels
                  .filter(m => showAllModels || m.name.toLowerCase().includes('gemini'))
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
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={showAllModels}
                onChange={(e) => setShowAllModels(e.target.checked)}
                sx={{ p: 0.5 }}
              />
            }
            label={<Typography variant="caption">{t('Show all', 'הצג הכל')}</Typography>}
            sx={{ ml: 0, mr: 0 }}
          />
        </Box>
        <Box>
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
              <Stack direction="column" spacing={1} alignItems="center">
                  <Chip 
                    label={t("How is my portfolio performing?", "איך הביצועים של התיק שלי?")} 
                    onClick={() => setInput(t("How is my portfolio performing?", "איך הביצועים של התיק שלי?"))}
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                  <Chip 
                    label={t("What are my riskiest holdings?", "מהן ההחזקות הכי מסוכנות שלי?")} 
                    onClick={() => setInput(t("What are my riskiest holdings?", "מהן ההחזקות הכי מסוכנות שלי?"))}
                    clickable
                    color="primary"
                    variant="outlined"
                  />
              </Stack>
            </Box>
          )}
          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 1
              }}
            >
              {msg.role === 'model' && <SmartToyIcon color="primary" sx={{ mt: 1 }} />}
              <Paper
                sx={{
                  p: 1.5,
                  maxWidth: '80%',
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
                {(msg as any).isError && (
                  <Button
                    startIcon={<RefreshIcon />}
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => handleSend(lastPromptRef.current)}
                    sx={{ mt: 1, textTransform: 'none', py: 0, fontSize: '0.7rem' }}
                  >
                    {t('Retry', 'נסה שוב')}
                  </Button>
                )}
              </Paper>
              {msg.role === 'user' && <PersonIcon color="action" sx={{ mt: 1 }} />}
            </Box>
          ))}
          {isLoading && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <SmartToyIcon color="primary" sx={{ mt: 1 }} />
              <Paper sx={{ p: 1.5, borderRadius: 2 }}>
                <CircularProgress size={20} />
              </Paper>
            </Box>
          )}
        </Box>
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
  );
};
