import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  APP_DEFAULT_LANGUAGE,
  getAppSettingsSnapshot,
  setLanguageSetting,
} from '@/lib/settings';
import enTranslation from './locales/en';
import frTranslation from './locales/fr';

// Default language
const DEFAULT_LANGUAGE = APP_DEFAULT_LANGUAGE;
const INITIAL_LANGUAGE = getAppSettingsSnapshot().language ?? DEFAULT_LANGUAGE;

// Initialize i18n instance
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    fr: { translation: frTranslation },
  },
  lng: INITIAL_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

// Function to change language and store in app settings
export const changeLanguage = (language: string) => {
  i18n.changeLanguage(language);
  setLanguageSetting(language);
};

export default i18n;
