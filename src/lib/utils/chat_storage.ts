import type { ExtendedChatMessage } from '../gemini';

export interface ChatSession {
  id: string; // uuid
  contextId: string; // e.g. "portfolio_main" or "ticker_NASDAQ_AAPL"
  title: string;
  contextUrl: string; // the path, e.g. "/dashboard" or "/ticker/NASDAQ/AAPL"
  updatedAt: number;
  messages: ExtendedChatMessage[];
}

export const loadSessions = (): ChatSession[] => {
  try {
    const data = localStorage.getItem('global_ai_chat_sessions');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveSessions = (sessions: ChatSession[]) => {
  localStorage.setItem('global_ai_chat_sessions', JSON.stringify(sessions));
};

export const getSession = (id: string): ChatSession | undefined => {
  return loadSessions().find(s => s.id === id);
};

export const saveSession = (session: ChatSession) => {
  const sessions = loadSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  session.updatedAt = Date.now();
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  saveSessions(sessions);
};

export const deleteSession = (id: string) => {
  const sessions = loadSessions().filter(s => s.id !== id);
  saveSessions(sessions);
};
