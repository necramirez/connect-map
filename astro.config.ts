import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://necramirez.github.io',
  base: '/connect-map',
  output: 'static',
  integrations: [react()],
});
