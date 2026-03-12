import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: import.meta.env.DEV,

    // Each namespace corresponds to a feature area / file
    ns: ['common', 'sidebar', 'dashboard', 'auth', 'patients', 'billing',
         'pharmacy', 'laboratory', 'appointments', 'staff', 'accounting',
         'reports', 'settings', 'telemedicine', 'ipd', 'notifications'],
    defaultNS: 'common',

    interpolation: {
      escapeValue: false, // React already escapes
    },

    backend: {
      // Public folder: /locales/en/sidebar.json, /locales/bn/sidebar.json
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'hms_language',
    },
  });

export default i18n;
