import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

export type OpenAppSettingsResult =
  | { status: 'opened' }
  | { status: 'unavailable' }
  | { status: 'failed' };

interface AppSettingsDependencies {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  isPluginAvailable: (pluginName: string) => boolean;
  openUrl: (options: { url: string }) => Promise<{ completed: boolean }>;
}

export interface AppSettingsController {
  isAvailable: () => boolean;
  open: () => Promise<OpenAppSettingsResult>;
}

export function createAppSettingsController(
  dependencies: AppSettingsDependencies,
): AppSettingsController {
  const isAvailable = () =>
    dependencies.isNativePlatform() &&
    dependencies.getPlatform() === 'ios' &&
    dependencies.isPluginAvailable('AppLauncher');

  return {
    isAvailable,
    async open() {
      if (!isAvailable()) return { status: 'unavailable' };

      try {
        const result = await dependencies.openUrl({ url: 'app-settings:' });
        return result.completed ? { status: 'opened' } : { status: 'failed' };
      } catch {
        return { status: 'failed' };
      }
    },
  };
}

export const appSettingsController = createAppSettingsController({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  getPlatform: () => Capacitor.getPlatform(),
  isPluginAvailable: (pluginName) => Capacitor.isPluginAvailable(pluginName),
  openUrl: (options) => AppLauncher.openUrl(options),
});
