import { logger } from '@/shared/logger';

const OFFSCREEN_DOCUMENT_PATH: '/offscreen.html' = '/offscreen.html';

export async function ensureOffscreenDocument(): Promise<boolean> {
  try {
    if (await hasOffscreenDocument()) {
      return true;
    }

    await browser.offscreen.createDocument({
      url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
      reasons: [browser.offscreen.Reason.LOCAL_STORAGE],
      justification: 'Host on-device AI model sessions for HumanSignal.',
    });

    logger.info('background.offscreen', 'Offscreen document created');
    return true;
  } catch (error: unknown) {
    logger.error('background.offscreen.create', error);
    return false;
  }
}

export async function closeOffscreenDocument(): Promise<boolean> {
  try {
    if (!(await hasOffscreenDocument())) {
      return false;
    }

    await browser.offscreen.closeDocument();
    logger.info('background.offscreen', 'Offscreen document closed');
    return false;
  } catch (error: unknown) {
    logger.error('background.offscreen.close', error);
    return await hasOffscreenDocument();
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    return await browser.offscreen.hasDocument();
  } catch (error: unknown) {
    logger.warn('background.offscreen.check', 'Unable to inspect offscreen contexts', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
