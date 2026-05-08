import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'HumanSignal',
    description: 'Signal intelligence for LinkedIn',
    permissions: ['storage', 'offscreen', 'activeTab'],
    host_permissions: ['https://www.linkedin.com/*'],
    action: {
      default_title: 'HumanSignal',
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
