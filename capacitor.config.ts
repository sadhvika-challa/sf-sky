import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sadhvika.soleil',
  appName: 'Soleil',
  webDir: 'dist',
  backgroundColor: '#D4E6F1',
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
  },
};

export default config;
