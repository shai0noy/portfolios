"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageProvider = LanguageProvider;
exports.useLanguage = useLanguage;
const react_1 = require("react");
const LanguageContext = (0, react_1.createContext)(undefined);
function LanguageProvider({ children }) {
    const [language, setLanguage] = (0, react_1.useState)(() => {
        return localStorage.getItem('app_language') || 'en';
    });
    (0, react_1.useEffect)(() => {
        localStorage.setItem('app_language', language);
        // This handles the layout flipping (LTR <-> RTL) automatically for Flexbox
        document.dir = language === 'he' ? 'rtl' : 'ltr';
    }, [language]);
    const t = (en, he) => {
        return language === 'he' ? he : en;
    };
    const tTry = (en, he) => {
        if (language === 'he') {
            return he || en || '';
        }
        return en || he || '';
    };
    const toggleLanguage = () => {
        setLanguage(prev => prev === 'en' ? 'he' : 'en');
    };
    return (<LanguageContext.Provider value={{ language, setLanguage, t, tTry, isRtl: language === 'he', toggleLanguage }}>
      {children}
    </LanguageContext.Provider>);
}
function useLanguage() {
    const context = (0, react_1.useContext)(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
