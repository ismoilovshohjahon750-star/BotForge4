import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// Helper to unwrap CSS @layer, resolve calc(var(--spacing)), expand logical properties, and fix line heights for legacy browsers
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

  // 4. Resolve calc(var(--spacing) * <N>) directly to raw pixels for legacy browsers (where calc(var()) is ignored or yields 0)
  output = output.replace(/calc\(var\(--spacing\)\s*\*\s*([0-9.]+)\)/g, (_m, num) => {
    const px = Math.round(parseFloat(num) * 4 * 100) / 100;
    return px + 'px';
  });

  // Replace any standalone var(--spacing) with 4px
  output = output.replace(/var\(--spacing\)/g, '4px');

  // 5. Expand logical properties (padding-inline, margin-inline, padding-block, margin-block) which fail in older mobile WebViews
  output = output.replace(/padding-inline:([^;}]+)/g, 'padding-left:$1;padding-right:$1;padding-inline:$1');
  output = output.replace(/margin-inline:([^;}]+)/g, 'margin-left:$1;margin-right:$1;margin-inline:$1');
  output = output.replace(/padding-block:([^;}]+)/g, 'padding-top:$1;padding-bottom:$1;padding-block:$1');
  output = output.replace(/margin-block:([^;}]+)/g, 'margin-top:$1;margin-bottom:$1;margin-block:$1');

  // 6. Ensure font-size and line-height fallbacks so text never overlaps on older rendering engines
  const fontSizes: Record<string, { size: string; lh: string }> = {
    xs: { size: '12px', lh: '16px' },
    sm: { size: '14px', lh: '20px' },
    base: { size: '16px', lh: '24px' },
    lg: { size: '18px', lh: '28px' },
    xl: { size: '20px', lh: '28px' },
    '2xl': { size: '24px', lh: '32px' },
    '3xl': { size: '30px', lh: '36px' },
    '4xl': { size: '36px', lh: '42px' },
    '5xl': { size: '48px', lh: '54px' },
    '6xl': { size: '60px', lh: '66px' },
  };

  for (const [key, val] of Object.entries(fontSizes)) {
    const reg = new RegExp('(\\.text-' + key + '{[^}]*)}', 'g');
    output = output.replace(reg, (_m, body) => {
      return body + ';font-size:' + val.size + ';line-height:' + val.lh + '}';
    });
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

