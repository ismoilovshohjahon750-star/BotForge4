import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function unwrapCssLayers(css: string): string {
  if (!css || !css.includes('@layer')) return css;
  // 1. Remove `@layer name, other;` or `@layer name;`
  let result = css.replace(/@layer\s+[^;{]+;/g, '');
  // 2. Unwrap `@layer [name] { ... }`
  const out: string[] = [];
  let i = 0;
  const n = result.length;
  while (i < n) {
    if (result.startsWith('@layer', i)) {
      const bracePos = result.indexOf('{', i);
      if (bracePos !== -1) {
        let depth = 1;
        let j = bracePos + 1;
        while (j < n && depth > 0) {
          const ch = result[j];
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          j++;
        }
        if (depth === 0) {
          const inner = result.slice(bracePos + 1, j - 1);
          out.push(unwrapCssLayers(inner));
          i = j;
          continue;
        }
      }
    }
    out.push(result[i]);
    i++;
  }
  return out.join('');
}

function legacyCssCompatPlugin(): Plugin {
  return {
    name: 'legacy-css-compat',
    enforce: 'post',
    transform(code: string, id: string) {
      if ((id.includes('.css') || id.includes('index.css')) && code.includes('@layer')) {
        return {
          code: unwrapCssLayers(code),
          map: null,
        };
      }
      return null;
    },
    generateBundle(_: any, bundle: any) {
      for (const fileName in bundle) {
        const file = bundle[fileName];
        if (file.type === 'asset' && fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = unwrapCssLayers(file.source);
        }
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      legacyCssCompatPlugin(),
      legacy({
        targets: ['chrome >= 49', 'android >= 6', 'defaults'],
        renderLegacyChunks: true,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
