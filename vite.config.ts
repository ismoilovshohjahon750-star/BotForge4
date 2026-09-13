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

const STATIC_COLOR_MAP: Record<string, string> = {
  'white': '255, 255, 255',
  '#fff': '255, 255, 255',
  '#ffffff': '255, 255, 255',
  'black': '0, 0, 0',
  '#000': '0, 0, 0',
  '#000000': '0, 0, 0',
  'currentcolor': '250, 250, 250',
  'currentColor': '250, 250, 250',
  'transparent': '0, 0, 0',

  // App Theme Vars
  'primary': '34, 197, 94',
  'primary-foreground': '255, 255, 255',
  'background': '9, 9, 11',
  'foreground': '250, 250, 250',
  'card': '18, 18, 21',
  'card-foreground': '250, 250, 250',
  'muted': '30, 30, 36',
  'muted-foreground': '161, 161, 170',
  'accent': '30, 30, 36',
  'accent-foreground': '250, 250, 250',
  'destructive': '239, 68, 68',
  'border': '255, 255, 255',
  'input': '255, 255, 255',
  'ring': '34, 197, 94',

  // Slate
  'color-slate-50': '248, 250, 252',
  'color-slate-100': '241, 245, 249',
  'color-slate-200': '226, 232, 240',
  'color-slate-300': '203, 213, 225',
  'color-slate-400': '148, 163, 184',
  'color-slate-500': '100, 116, 139',
  'color-slate-600': '71, 85, 105',
  'color-slate-700': '51, 65, 85',
  'color-slate-800': '30, 41, 59',
  'color-slate-900': '15, 23, 42',
  'color-slate-950': '2, 6, 23',

  // Gray & Zinc
  'color-gray-50': '249, 250, 251',
  'color-gray-100': '243, 244, 246',
  'color-gray-200': '229, 231, 235',
  'color-gray-300': '209, 213, 219',
  'color-gray-400': '156, 163, 175',
  'color-gray-500': '107, 114, 128',
  'color-gray-600': '75, 85, 99',
  'color-gray-700': '55, 65, 81',
  'color-gray-800': '31, 41, 55',
  'color-gray-900': '17, 24, 39',
  'color-gray-950': '3, 7, 18',

  'color-zinc-50': '250, 250, 250',
  'color-zinc-100': '244, 244, 245',
  'color-zinc-200': '228, 228, 231',
  'color-zinc-300': '212, 212, 216',
  'color-zinc-400': '161, 161, 170',
  'color-zinc-500': '113, 113, 122',
  'color-zinc-600': '82, 82, 91',
  'color-zinc-700': '63, 63, 70',
  'color-zinc-800': '39, 39, 42',
  'color-zinc-900': '24, 24, 27',
  'color-zinc-950': '9, 9, 11',

  // Emerald & Teal & Cyan
  'color-emerald-50': '236, 253, 245',
  'color-emerald-100': '209, 250, 229',
  'color-emerald-200': '167, 243, 208',
  'color-emerald-300': '110, 231, 183',
  'color-emerald-400': '52, 211, 153',
  'color-emerald-500': '16, 185, 129',
  'color-emerald-600': '5, 150, 105',
  'color-emerald-700': '4, 120, 87',
  'color-emerald-800': '6, 95, 70',
  'color-emerald-900': '6, 78, 59',
  'color-emerald-950': '2, 44, 34',

  'color-teal-50': '240, 253, 250',
  'color-teal-100': '204, 251, 241',
  'color-teal-200': '153, 246, 228',
  'color-teal-300': '94, 234, 212',
  'color-teal-400': '45, 212, 191',
  'color-teal-500': '20, 184, 166',
  'color-teal-600': '13, 148, 136',
  'color-teal-700': '15, 118, 110',
  'color-teal-800': '17, 94, 89',
  'color-teal-900': '19, 78, 74',
  'color-teal-950': '4, 47, 46',

  'color-cyan-50': '236, 254, 255',
  'color-cyan-100': '207, 250, 254',
  'color-cyan-200': '165, 243, 252',
  'color-cyan-300': '103, 232, 249',
  'color-cyan-400': '34, 211, 238',
  'color-cyan-500': '6, 182, 212',
  'color-cyan-600': '8, 145, 178',
  'color-cyan-700': '14, 116, 144',
  'color-cyan-800': '21, 94, 117',
  'color-cyan-900': '22, 78, 99',
  'color-cyan-950': '8, 51, 68',

  // Sky & Blue & Indigo
  'color-sky-50': '240, 249, 255',
  'color-sky-100': '224, 242, 254',
  'color-sky-200': '186, 230, 253',
  'color-sky-300': '125, 211, 252',
  'color-sky-400': '56, 189, 248',
  'color-sky-500': '14, 165, 233',
  'color-sky-600': '2, 132, 199',
  'color-sky-700': '3, 105, 161',
  'color-sky-800': '7, 89, 133',
  'color-sky-900': '12, 74, 110',
  'color-sky-950': '8, 47, 73',

  'color-blue-50': '239, 246, 255',
  'color-blue-100': '219, 234, 254',
  'color-blue-200': '191, 219, 254',
  'color-blue-300': '147, 197, 253',
  'color-blue-400': '96, 165, 250',
  'color-blue-500': '59, 130, 246',
  'color-blue-600': '37, 99, 235',
  'color-blue-700': '29, 78, 216',
  'color-blue-800': '30, 64, 175',
  'color-blue-900': '30, 58, 138',
  'color-blue-950': '23, 37, 84',

  'color-indigo-50': '238, 242, 255',
  'color-indigo-100': '224, 231, 255',
  'color-indigo-200': '199, 210, 254',
  'color-indigo-300': '165, 180, 252',
  'color-indigo-400': '129, 140, 248',
  'color-indigo-500': '99, 102, 241',
  'color-indigo-600': '79, 70, 229',
  'color-indigo-700': '67, 56, 202',
  'color-indigo-800': '55, 48, 163',
  'color-indigo-900': '49, 46, 129',
  'color-indigo-950': '30, 27, 75',

  // Violet & Purple
  'color-violet-500': '139, 92, 246',
  'color-purple-50': '250, 245, 255',
  'color-purple-100': '243, 232, 255',
  'color-purple-200': '233, 213, 255',
  'color-purple-300': '216, 180, 254',
  'color-purple-400': '192, 132, 252',
  'color-purple-500': '168, 85, 247',
  'color-purple-600': '147, 51, 234',
  'color-purple-700': '126, 34, 206',
  'color-purple-800': '107, 33, 168',
  'color-purple-900': '88, 28, 135',
  'color-purple-950': '59, 7, 100',

  // Pink & Rose
  'color-pink-400': '244, 114, 182',
  'color-pink-500': '236, 72, 153',
  'color-pink-600': '219, 39, 119',
  'color-rose-300': '253, 164, 175',
  'color-rose-400': '251, 113, 133',
  'color-rose-500': '244, 63, 94',
  'color-rose-600': '225, 29, 72',
  'color-rose-700': '190, 18, 60',
  'color-rose-950': '76, 5, 25',

  // Amber & Yellow
  'color-amber-300': '252, 211, 77',
  'color-amber-400': '251, 191, 36',
  'color-amber-500': '245, 158, 11',
  'color-amber-600': '217, 119, 6',
  'color-amber-900': '120, 53, 15',
  'color-yellow-400': '250, 204, 21',
  'color-yellow-500': '234, 179, 8',

  // Red & Green
  'color-red-400': '248, 113, 113',
  'color-red-500': '239, 68, 68',
  'color-red-600': '220, 38, 38',
  'color-red-700': '185, 28, 28',
  'color-red-900': '127, 29, 29',
  'color-red-950': '69, 10, 10',
  'color-green-400': '74, 222, 128',
  'color-green-500': '34, 197, 94',
  'color-green-600': '22, 163, 74',
};

function resolveColorToRgb(str: string, varMap?: Record<string, string>, propName = ''): string {
  if (!str) {
    return propName.includes('bg') || propName.includes('background') ? '18, 18, 21' : '250, 250, 250';
  }
  let clean = str.trim();

  // Recursively resolve var(--...)
  let depth = 0;
  while ((clean.startsWith('var(') || clean.startsWith('--')) && depth < 6) {
    depth++;
    const varName = clean.startsWith('var(') ? clean.replace(/^var\(\s*|\s*\)$/g, '').split(',')[0].trim() : clean;
    const strippedName = varName.replace(/^--/, '');
    if (varMap && varMap[varName]) {
      clean = varMap[varName].trim();
    } else if (varMap && varMap[`--${strippedName}`]) {
      clean = varMap[`--${strippedName}`].trim();
    } else if (STATIC_COLOR_MAP[varName]) {
      return STATIC_COLOR_MAP[varName];
    } else if (STATIC_COLOR_MAP[strippedName]) {
      return STATIC_COLOR_MAP[strippedName];
    } else {
      break;
    }
  }

  const lower = clean.toLowerCase();
  if (STATIC_COLOR_MAP[lower]) return STATIC_COLOR_MAP[lower];
  if (STATIC_COLOR_MAP[clean]) return STATIC_COLOR_MAP[clean];

  if (clean.startsWith('#')) {
    let hex = clean.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return `${r}, ${g}, ${b}`;
      }
    }
  }

  const rgbaMatch = clean.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbaMatch) {
    return `${Math.round(parseFloat(rgbaMatch[1]))}, ${Math.round(parseFloat(rgbaMatch[2]))}, ${Math.round(parseFloat(rgbaMatch[3]))}`;
  }

  const oklchMatch = clean.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklchMatch) {
    return oklchToRgb(oklchMatch[1], oklchMatch[2], oklchMatch[3]);
  }

  if (propName.includes('bg') || propName.includes('background') || propName.includes('card')) {
    return '18, 18, 21';
  }
  if (propName.includes('border') || propName.includes('ring')) {
    return '255, 255, 255';
  }
  return '250, 250, 250';
}

function unwrapSupportsRule(css: string, keyword: string): string {
  if (!css || !css.includes(keyword)) return css;
  const pattern = new RegExp(`@supports\\s*\\([^{]*${keyword}[^{]*\\)\\s*\\{`, 'g');
  let result = css;
  while (true) {
    pattern.lastIndex = 0;
    const match = pattern.exec(result);
    if (!match) break;
    const start = match.index;
    const bracePos = match.index + match[0].length - 1;
    let depth = 1;
    let j = bracePos + 1;
    const n = result.length;
    while (j < n && depth > 0) {
      const ch = result[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      j++;
    }
    if (depth === 0) {
      const inner = result.slice(bracePos + 1, j - 1);
      result = result.slice(0, start) + inner + result.slice(j);
    } else {
      break;
    }
  }
  return result;
}

function compatCssTransform(css: string): string {
  if (!css) return css;

  // 1. Extract all CSS variables in CSS to build dynamic dictionary
  const varMap: Record<string, string> = {};
  const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g;
  let varMatch: RegExpExecArray | null;
  while ((varMatch = varRegex.exec(css)) !== null) {
    varMap[varMatch[1].trim()] = varMatch[2].trim();
  }

  // 2. Unwrap @layer
  let result = unwrapCssLayers(css);

  // 3. Unwrap @supports color-mix and backdrop-filter
  result = unwrapSupportsRule(result, 'color-mix');
  result = unwrapSupportsRule(result, 'backdrop-filter');

  // 4. Convert OKLCH to sRGB
  result = result.replace(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g, (_, l, c, h, a) =>
    oklchToRgb(l, c, h, a)
  );

  // 5. Transform color-mix declarations into valid rgba fallbacks
  result = result.replace(
    /([a-zA-Z-]+)\s*:\s*color-mix\(\s*in\s+[a-zA-Z-]+\s*,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
    (match, prop, colorStr, pct) => {
      const alpha = (parseFloat(pct) / 100).toFixed(2);
      const rgb = resolveColorToRgb(colorStr, varMap, prop);
      const fallbackRgba = `rgba(${rgb}, ${alpha})`;
      return `${prop}:${fallbackRgba};${match}`;
    }
  );

  // 6. Transform standalone color-mix calls inside any remaining declarations
  result = result.replace(
    /color-mix\(\s*in\s+[a-zA-Z-]+\s*,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
    (_, colorStr, pct) => {
      const alpha = (parseFloat(pct) / 100).toFixed(2);
      const rgb = resolveColorToRgb(colorStr, varMap);
      return `rgba(${rgb}, ${alpha})`;
    }
  );

  // 7. Unwrap :where(...) in selectors to standard selectors
  result = result.replace(/:where\(([^)]+)\)/g, '$1');

  // 8. Unwrap :is(...) simple wrappers
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
      legacy({
        targets: ['defaults', 'not IE 11', 'chrome >= 49', 'safari >= 9', 'android >= 4.4', 'edge >= 15'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      }),
    ],
    esbuild: {
      target: 'es2015',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'es2015',
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
