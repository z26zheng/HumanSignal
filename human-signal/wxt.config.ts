import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'HumanSignal',
    description: 'Detect AI-generated posts and comments on LinkedIn with on-device analysis. No data leaves your browser.',
    version: '1.0.0.0',
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
