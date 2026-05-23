import { logger } from '@/shared/logger';
import { toErrorData } from '@/shared/safe-catch';

const OFFSCREEN_DOCUMENT_PATH: '/offscreen.html' = '/offscreen.html';

export async function ensureOffscreenDocument(): Promise<boolean> {
  try {
    if (await hasOffscreenDocument()) {
      return true;
    }

    await browser.offscreen.createDocument({
      url: browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
      reasons: [browser.offscreen.Reason.LOCAL_STORAGE, browser.offscreen.Reason.WORKERS],
      justification: 'Host on-device AI model sessions for HumanSignal.',
    });

    logger.info('background.offscreen', 'Offscreen document created');
    return true;
  } catch (error: unknown) {
    logger.error('background.offscreen.create', error);
    return false;
  }
}

/**
 * Closes the offscreen document.
 * @returns `true` if the document is now closed (or was never present), `false` if close failed.
 */
export async function closeOffscreenDocument(): Promise<boolean> {
  try {
    if (!(await hasOffscreenDocument())) {
      return true;
    }

    await browser.offscreen.closeDocument();
    logger.info('background.offscreen', 'Offscreen document closed');
    return true;
  } catch (error: unknown) {
    logger.error('background.offscreen.close', error);
    return !(await hasOffscreenDocument());
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    return await browser.offscreen.hasDocument();
  } catch (error: unknown) {
    logger.warn('background.offscreen.check', 'Unable to inspect offscreen contexts', toErrorData(error));
    return false;
  }
}
