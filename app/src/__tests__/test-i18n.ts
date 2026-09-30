import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    lng: 'en',
    parseMissingKeyHandler: (key) => key,
    resources: {
      en: {
        translation: {
          Common: {
            actions: 'Actions',
          },
        },
      },
    },
    returnNull: false,
  });
}

export { i18n as testI18n };
