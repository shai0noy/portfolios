import React, { useMemo } from 'react';
import { Drawer, Box, Typography, List, ListItem, ListItemButton, ListItemText, IconButton, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AddCommentIcon from '@mui/icons-material/AddComment';
import { useLanguage } from '../../lib/i18n';
import type { ChatSession } from '../../lib/utils/chat_storage';
import { isToday, isYesterday } from 'date-fns';

interface ChatHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

export const ChatHistoryDrawer: React.FC<ChatHistoryDrawerProps> = ({
  open, onClose, sessions, activeSessionId, onSelectSession, onNewChat, onDeleteSession
}) => {
  const { t } = useLanguage();

  const groupedSessions = useMemo(() => {
    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const older: ChatSession[] = [];

    sessions.forEach(s => {
      if (isToday(s.updatedAt)) today.push(s);
      else if (isYesterday(s.updatedAt)) yesterday.push(s);
      else older.push(s);
    });

    return { today, yesterday, older };
  }, [sessions]);

  const renderList = (title: string, list: ChatSession[]) => {
    if (list.length === 0) return null;
    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: 'block', mb: 0.5 }}>
          {title}
        </Typography>
        <List disablePadding>
          {list.map(s => (
            <ListItem
              key={s.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" size="small" onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemButton
                selected={s.id === activeSessionId}
                onClick={() => onSelectSession(s)}
                sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}
              >
                <ChatBubbleOutlineIcon fontSize="small" sx={{ mr: 1.5, color: 'text.secondary' }} />
                <ListItemText
                  primary={s.title || t('New Chat', 'צ\'אט חדש')}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    );
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 100 }}
      PaperProps={{ sx: { width: { xs: '85vw', sm: 320 }, boxSizing: 'border-box' } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">{t('Chat History', 'היסטוריית צ\'אט')}</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2 }}>
        <ListItemButton
          onClick={onNewChat}
          sx={{
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            justifyContent: 'center',
            py: 1.5
          }}
        >
          <AddCommentIcon sx={{ mr: 1 }} fontSize="small" />
          <Typography variant="button">{t('New Chat', 'צ\'אט חדש')}</Typography>
        </ListItemButton>
      </Box>

      <Box sx={{ overflowY: 'auto', flexGrow: 1 }}>
        {renderList(t('Today', 'היום'), groupedSessions.today)}
        {renderList(t('Yesterday', 'אתמול'), groupedSessions.yesterday)}
        {renderList(t('Older', 'ישנים יותר'), groupedSessions.older)}

        {sessions.length === 0 && (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
            {t('No chat history yet.', 'אין עדיין היסטוריית צ\'אט.')}
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};
