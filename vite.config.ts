import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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

function oklchToRgb(lStr: string, cStr: string, hStr: string, aStr?: string): string {
  let L = parseFloat(lStr);
  if (lStr.includes('%')) L = L / 100;
  if (L > 1) L = L / 100;
  const C = parseFloat(cStr);
  const hDeg = parseFloat(hStr);
  const hRad = (hDeg * Math.PI) / 180;

  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = Math.pow(l_, 3);
  const m3 = Math.pow(m_, 3);
  const s3 = Math.pow(s_, 3);

  const rLin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  function gamma(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  }

  const R = Math.round(gamma(rLin) * 255);
  const G = Math.round(gamma(gLin) * 255);
  const B = Math.round(gamma(bLin) * 255);

  let alpha = 1;
  if (aStr) {
    alpha = aStr.includes('%') ? parseFloat(aStr) / 100 : parseFloat(aStr);
  }

  if (alpha < 0.999) {
    return `rgba(${R}, ${G}, ${B}, ${alpha.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`;
  }
  return `rgb(${R}, ${G}, ${B})`;
}

function compatCssTransform(css: string): string {
  if (!css) return css;

  // 1. Unwrap @layer
  let result = unwrapCssLayers(css);

  // 2. Convert OKLCH to sRGB
  result = result.replace(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g, (_, l, c, h, a) =>
    oklchToRgb(l, c, h, a)
  );

  // 3. Fallbacks for color-mix declarations
  result = result.replace(
    /([a-zA-Z-]+)\s*:\s*color-mix\(in\s+oklab\s*,\s*([^,\s]+)\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
    (match, prop, color, pct) => {
      let fallback = color;
      const alpha = (parseFloat(pct) / 100).toFixed(2);
      if (color === 'var(--color-white)') fallback = `rgba(255, 255, 255, ${alpha})`;
      else if (color === 'var(--color-black)') fallback = `rgba(0, 0, 0, ${alpha})`;
      else if (color === 'var(--border)') fallback = `rgba(255, 255, 255, 0.12)`;
      else if (color === 'currentcolor' || color === 'currentColor') fallback = `rgba(160, 160, 160, ${alpha})`;
      return `${prop}:${fallback};${match}`;
    }
  );

  // 4. Unwrap :where(...) in selectors to standard selectors
  result = result.replace(/:where\(([^)]+)\)/g, '$1');

  // 5. Unwrap :is(...) simple wrappers
  result = result.replace(/:is\(([^)]+)\)/g, '$1');

  return result;
}

function legacyCssCompatPlugin(): Plugin {
  return {
    name: 'legacy-css-compat',
    enforce: 'post',
    transform(code: string, id: string) {
      if (id.includes('.css') || id.includes('index.css')) {
        return {
          code: compatCssTransform(code),
          map: null,
        };
      }
      return null;
    },
    generateBundle(_: any, bundle: any) {
      for (const fileName in bundle) {
        const file = bundle[fileName];
        if (file.type === 'asset' && fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = compatCssTransform(file.source);
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
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
