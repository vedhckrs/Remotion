import {openBrowser} from '@remotion/renderer';

/** Reuse one renderer browser; retry only a runner-side connection timeout. */
export async function openFixtureBrowser(browserExecutable?: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await openBrowser('chrome', {browserExecutable, chromiumOptions: {gl: process.platform === 'darwin' ? 'angle' : 'swangle'}});
        } catch (error) {
            if (attempt || !(error instanceof Error) || !error.message.includes('while trying to connect to the browser')) throw error;
            console.warn('Browser connection timed out; retrying startup once');
        }
    }
    throw new Error('Browser startup failed');
}
