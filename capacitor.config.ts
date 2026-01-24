import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.satranc.oyunu',
  appName: 'Satranc',
  webDir: 'www',
  android: {
    allowMixedContent: true
  },
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
