import { describe, expect, it, vi } from 'vitest';
import { createAppSettingsController } from '../appSettings';

type OpenUrl = (options: { url: string }) => Promise<{ completed: boolean }>;

function createController(options: {
  native?: boolean;
  platform?: string;
  pluginAvailable?: boolean;
  openUrl?: ReturnType<typeof vi.fn<OpenUrl>>;
} = {}) {
  const openUrl = options.openUrl ?? vi.fn<OpenUrl>().mockResolvedValue({ completed: true });
  return {
    controller: createAppSettingsController({
      isNativePlatform: () => options.native ?? true,
      getPlatform: () => options.platform ?? 'ios',
      isPluginAvailable: () => options.pluginAvailable ?? true,
      openUrl,
    }),
    openUrl,
  };
}

describe('app settings controller', () => {
  it.each([
    { native: false, platform: 'web' },
    { native: true, platform: 'android' },
    { native: true, platform: 'ios', pluginAvailable: false },
  ])('is unavailable and side-effect free outside native iOS', async (runtime) => {
    const { controller, openUrl } = createController(runtime);

    expect(controller.isAvailable()).toBe(false);
    await expect(controller.open()).resolves.toEqual({ status: 'unavailable' });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the current app settings on native iOS', async () => {
    const { controller, openUrl } = createController();

    expect(controller.isAvailable()).toBe(true);
    await expect(controller.open()).resolves.toEqual({ status: 'opened' });
    expect(openUrl).toHaveBeenCalledOnce();
    expect(openUrl).toHaveBeenCalledWith({ url: 'app-settings:' });
  });

  it.each([
    vi.fn<OpenUrl>().mockResolvedValue({ completed: false }),
    vi.fn<OpenUrl>().mockRejectedValue(new Error('native bridge failed')),
  ])('reports a failed open without throwing', async (openUrl) => {
    const { controller } = createController({ openUrl });

    await expect(controller.open()).resolves.toEqual({ status: 'failed' });
  });
});
