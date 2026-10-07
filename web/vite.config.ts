import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 3000 on 127.0.0.1 matches auth.site_url in supabase/config.toml,
// so magic links and redirects come back to the app.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true },
});
