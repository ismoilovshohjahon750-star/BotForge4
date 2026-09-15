import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// Helper to unwrap CSS @layer and strip unsupported @property rules for legacy browsers
function unwrapLegacyCss(css: string): string {
  if (!css) return css;

  // 1. Remove standalone layer declarations (e.g. @layer theme, base, components, utilities;)
  let res = css.replace(/@layer\s+[^;{]+;/g, '');

  // 2. Remove @property rules which break older browser CSS engines
  res = res.replace(/@property\s+--tw-[^{]+{[^}]+}/g, '');

  // 3. Balanced unwrap for any @layer ... { ... }
  let output = '';
  let i = 0;
  const n = res.length;

  while (i < n) {
    if (res.startsWith('@layer', i)) {
      const openBrace = res.indexOf('{', i);
      if (openBrace !== -1) {
        let depth = 1;
        let j = openBrace + 1;
        let insideQuote: string | null = null;
        let escaped = false;

        while (j < n && depth > 0) {
          const char = res[j];
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (insideQuote) {
            if (char === insideQuote) insideQuote = null;
          } else if (char === '"' || char === "'") {
            insideQuote = char;
          } else if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              const inner = res.slice(openBrace + 1, j);
              output += unwrapLegacyCss(inner);
              i = j + 1;
              break;
            }
          }
          j++;
        }
        if (depth === 0) continue;
      }
    }
    output += res[i];
    i++;
  }
  return output;
}

function legacyCssCompatPlugin(): Plugin {
  return {
    name: 'legacy-css-compat',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('.css') || id.includes('tailwindcss')) {
        return {
          code: unwrapLegacyCss(code),
          map: null,
        };
      }
    },
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        if (fileName.endsWith('.css')) {
          const chunk = bundle[fileName];
          if (chunk && chunk.type === 'asset' && typeof chunk.source === 'string') {
            chunk.source = unwrapLegacyCss(chunk.source);
          }
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      legacyCssCompatPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: ['es2017', 'chrome60', 'edge79', 'firefox60', 'safari12'],
      cssTarget: ['chrome60', 'edge79', 'firefox60', 'safari12'],
      chunkSizeWarningLimit: 1500,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

