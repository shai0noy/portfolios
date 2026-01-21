// src/lib/SessionContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface SessionContextType {
  isSessionExpired: boolean;
  showLoginModal: () => void;
  hideLoginModal: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  const showLoginModal = () => {
    console.log("Session expired, showing login modal.");
    setIsSessionExpired(true);
  };

  const hideLoginModal = () => {
    setIsSessionExpired(false);
  };
  
  const value = { isSessionExpired, showLoginModal, hideLoginModal };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
