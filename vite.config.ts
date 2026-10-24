process.env.XDG_CONFIG_HOME ??= `${process.cwd()}/.wrangler`;
process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';

import net from 'node:net';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

// Workaround for Vite 8 / Linux issue where probing wildcard addresses (0.0.0.0, ::, 0000:...)
// immediately before binding 127.0.0.1 leaves the socket in kernel TIME_WAIT, causing EADDRINUSE.
const origListen = net.Server.prototype.listen;
(net.Server.prototype as unknown as { listen: (...args: unknown[]) => net.Server }).listen =
  function (this: net.Server, ...args: unknown[]) {
    const host =
      typeof args[0] === 'object' && args[0] !== null
        ? (args[0] as { host?: string }).host
        : args[1];
    if (host === '0.0.0.0' || host === '::' || host === '0000:0000:0000:0000:0000:0000:0000:0000') {
      process.nextTick(() => {
        this.emit('listening');
      });
      return this;
    }
    return origListen.apply(this, args as never);
  };

export default defineConfig({
  plugins: [vue(), tailwindcss(), cloudflare({ inspectorPort: false })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: false },
});
