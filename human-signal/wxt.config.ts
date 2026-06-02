import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// Base version lives here; CI appends the GitHub run number as the 4th
// segment so every published build gets a unique, strictly-increasing
// Chrome version (e.g. 1.1.0.42). Local builds fall back to .0.
const VERSION_BASE = '1.2.0';
const BUILD_NUMBER = process.env.GITHUB_RUN_NUMBER ?? '0';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'HumanSignal',
    description: 'See which LinkedIn posts feel genuinely human. On-device AI detection. No data leaves your browser.',
    version: `${VERSION_BASE}.${BUILD_NUMBER}`,
    permissions: ['storage', 'offscreen', 'activeTab'],
    host_permissions: [
      'https://www.linkedin.com/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: {
      default_title: 'HumanSignal',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
