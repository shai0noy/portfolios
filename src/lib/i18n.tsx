import { createContext, useState, useContext, useEffect, type ReactNode } from 'react';

type Language = 'en' | 'he';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (en: string, he: string) => string;
  tTry: (en: string | undefined | null, he: string | undefined | null) => string;
  isRtl: boolean;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('app_language') as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    // This handles the layout flipping (LTR <-> RTL) automatically for Flexbox
    document.dir = language === 'he' ? 'rtl' : 'ltr';
  }, [language]);

  const t = (en: string, he: string) => {
    return language === 'he' ? he : en;
  };

  const tTry = (en: string | undefined | null, he: string | undefined | null) => {
    if (language === 'he') {
      return he || en || '';
    }
    return en || he || '';
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'he' : 'en');
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tTry, isRtl: language === 'he', toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}