import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hms.saas',
  appName: 'Ozzyl HMS',
  webDir: 'dist',
  server: {
    // Use the live server URL in production so the app always has the latest data.
    // Remove or comment this out to bundle the web assets locally inside the native app.
    // url: 'https://your-production-url.workers.dev',
    // androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
