// Comprehensive Polyfills for Legacy Browsers & WebViews (Android 5/6, Chrome 44-50, Safari 9+)
import cssVars from 'css-vars-ponyfill';

(function() {
  if (typeof window === 'undefined') return;

  // 1. globalThis
  if (typeof window.globalThis === 'undefined') {
    (window as any).globalThis = window;
  }

  // 2. Proxy Polyfill (specifically to prevent framer-motion / motion.div crash on legacy browsers)
  if (typeof window.Proxy === 'undefined') {
    (window as any).Proxy = function(target: any, handler: any) {
      const fn: any = typeof target === 'function' ? function(this: any) {
        if (handler && typeof handler.apply === 'function') {
          return handler.apply(target, this, Array.prototype.slice.call(arguments));
        }
        return target.apply(this, arguments);
      } : {};

      const allTags = [
        'div', 'span', 'p', 'a', 'button', 'ul', 'li', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'section', 'header', 'footer', 'nav', 'main', 'form', 'input', 'textarea', 'label',
        'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'img', 'table', 'tr',
        'td', 'th', 'tbody', 'thead', 'article', 'aside', 'figure', 'figcaption', 'i', 'b',
        'strong', 'em', 'hr', 'br', 'canvas', 'video', 'audio', 'iframe'
      ];

      allTags.forEach(function(tag) {
        Object.defineProperty(fn, tag, {
          get: function() {
            if (handler && typeof handler.get === 'function') {
              return handler.get(target, tag);
            }
            return target;
          },
          set: function(val) {
            if (handler && typeof handler.set === 'function') {
              handler.set(target, tag, val);
            }
          },
          enumerable: true,
          configurable: true,
        });
      });

      Object.defineProperty(fn, 'create', {
        get: function() {
          if (handler && typeof handler.get === 'function') {
            return handler.get(target, 'create');
          }
          return undefined;
        },
        enumerable: true,
        configurable: true,
      });

      return fn;
    };
  }

  // 3. Object.assign
  if (typeof Object.assign !== 'function') {
    Object.assign = function(target: any) {
      if (target === undefined || target === null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      const output = Object(target);
      for (let index = 1; index < arguments.length; index++) {
        const source = arguments[index];
        if (source !== undefined && source !== null) {
          for (const nextKey in source) {
            if (Object.prototype.hasOwnProperty.call(source, nextKey)) {
              output[nextKey] = source[nextKey];
            }
          }
        }
      }
      return output;
    };
  }

  // 4. Object.fromEntries
  if (typeof (Object as any).fromEntries !== 'function') {
    (Object as any).fromEntries = function(entries: any) {
      if (!entries || !entries[Symbol.iterator]) {
        throw new TypeError('Object.fromEntries requires an iterable object');
      }
      const obj: Record<string, any> = {};
      for (const pair of entries) {
        if (Object(pair) !== pair) {
          throw new TypeError('Iterator value is not an entry object');
        }
        obj[pair[0]] = pair[1];
      }
      return obj;
    };
  }

  // 5. Array.prototype.includes
  if (!Array.prototype.includes) {
    Array.prototype.includes = function(searchElement: any, fromIndex?: number) {
      const O = Object(this);
      const len = parseInt(O.length, 10) || 0;
      if (len === 0) return false;
      const n = parseInt(String(fromIndex || 0), 10) || 0;
      let k = n >= 0 ? n : Math.max(0, len + n);
      while (k < len) {
        const currentElement = O[k];
        if (searchElement === currentElement || (searchElement !== searchElement && currentElement !== currentElement)) {
          return true;
        }
        k++;
      }
      return false;
    };
  }

  // 6. Array.prototype.find & findIndex
  if (!Array.prototype.find) {
    Array.prototype.find = function(predicate: any, thisArg?: any) {
      if (this === null) throw new TypeError('Array.prototype.find called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      const list = Object(this);
      const length = list.length >>> 0;
      for (let i = 0; i < length; i++) {
        const value = list[i];
        if (predicate.call(thisArg, value, i, list)) return value;
      }
      return undefined;
    };
  }
  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function(predicate: any, thisArg?: any) {
      if (this === null) throw new TypeError('Array.prototype.findIndex called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      const list = Object(this);
      const length = list.length >>> 0;
      for (let i = 0; i < length; i++) {
        if (predicate.call(thisArg, list[i], i, list)) return i;
      }
      return -1;
    };
  }

  // 7. Array.prototype.flat
  if (!(Array.prototype as any).flat) {
    (Array.prototype as any).flat = function(depth?: number) {
      const d = depth === undefined ? 1 : Math.floor(depth);
      if (d < 1) return Array.prototype.slice.call(this);
      return (function flatten(arr: any[], currentDepth: number): any[] {
        let result: any[] = [];
        for (let i = 0; i < arr.length; i++) {
          if (Array.isArray(arr[i]) && currentDepth > 0) {
            result = result.concat(flatten(arr[i], currentDepth - 1));
          } else if (arr[i] !== undefined) {
            result.push(arr[i]);
          }
        }
        return result;
      })(this, d);
    };
  }

  // 8. String methods: startsWith, endsWith, includes, replaceAll
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(search: string, pos?: number) {
      return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    };
  }
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(search: string, this_len?: number) {
      if (this_len === undefined || this_len > this.length) {
        this_len = this.length;
      }
      return this.substring(this_len - search.length, this_len) === search;
    };
  }
  if (!String.prototype.includes) {
    String.prototype.includes = function(search: string, start?: number) {
      return this.indexOf(search, start) !== -1;
    };
  }
  if (!(String.prototype as any).replaceAll) {
    (String.prototype as any).replaceAll = function(str: string | RegExp, newStr: string) {
      if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
        return this.replace(str, newStr);
      }
      return this.replace(new RegExp(String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newStr);
    };
  }

  // 9. structuredClone
  if (typeof (window as any).structuredClone !== 'function') {
    (window as any).structuredClone = function(obj: any) {
      if (obj === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch (e) {
        return obj;
      }
    };
  }

  // 10. queueMicrotask
  if (typeof (window as any).queueMicrotask !== 'function') {
    (window as any).queueMicrotask = function(callback: () => void) {
      Promise.resolve().then(callback).catch(err => setTimeout(() => { throw err; }, 0));
    };
  }

  // 11. ResizeObserver fallback shim
  if (typeof (window as any).ResizeObserver === 'undefined') {
    (window as any).ResizeObserver = function(this: any, callback: any) {
      this.callback = callback;
      const self = this;
      this.observe = function(target: any) {
        if (self.callback && target) {
          setTimeout(function() {
            const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { width: 300, height: 200, top: 0, left: 0 };
            try {
              self.callback([{
                target: target,
                contentRect: rect,
                borderBoxSize: [{ inlineSize: rect.width || 300, blockSize: rect.height || 200 }],
                contentBoxSize: [{ inlineSize: rect.width || 300, blockSize: rect.height || 200 }]
              }], self);
            } catch (e) {}
          }, 0);
        }
      };
      this.unobserve = function() {};
      this.disconnect = function() {};
    };
  }

  // 12. IntersectionObserver fallback shim
  if (typeof (window as any).IntersectionObserver === 'undefined') {
    (window as any).IntersectionObserver = function(this: any, callback: any) {
      this.callback = callback;
      const self = this;
      this.observe = function(target: any) {
        if (self.callback && target) {
          setTimeout(function() {
            const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { width: 100, height: 100, top: 0, left: 0 };
            try {
              self.callback([{
                isIntersecting: true,
                intersectionRatio: 1,
                target: target,
                boundingClientRect: rect,
                intersectionRect: rect,
                rootBounds: null,
                time: Date.now()
              }], self);
            } catch (e) {}
          }, 0);
        }
      };
      this.unobserve = function() {};
      this.disconnect = function() {};
    };
  }

  // 13. matchMedia fallback
  if (typeof window.matchMedia !== 'function') {
    (window as any).matchMedia = function(query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: function() {},
        removeListener: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return false; },
      };
    };
  }

  // 14. requestAnimationFrame & cancelAnimationFrame fallback
  if (!window.requestAnimationFrame) {
    (window as any).requestAnimationFrame = function(callback: FrameRequestCallback) {
      return setTimeout(function() {
        callback(Date.now());
      }, 1000 / 60);
    };
  }
  if (!window.cancelAnimationFrame) {
    (window as any).cancelAnimationFrame = function(id: number) {
      clearTimeout(id);
    };
  }

  // 15. CSS Cascade Layers (@layer) Unwrapper for Legacy Browsers (Chrome < 99, Android 5/6 WebView)
  if (typeof (window as any).CSSLayerBlockRule === 'undefined') {
    const unwrapCss = (css: string): string => {
      if (!css || css.indexOf('@layer') === -1) return css;
      const res = css.replace(/@layer\s+[^;{]+;/g, '');
      const out: string[] = [];
      let i = 0;
      const n = res.length;
      while (i < n) {
        if (res.indexOf('@layer', i) === i) {
          const b = res.indexOf('{', i);
          if (b !== -1) {
            let depth = 1;
            let j = b + 1;
            while (j < n && depth > 0) {
              const c = res.charAt(j);
              if (c === '{') depth++;
              else if (c === '}') depth--;
              j++;
            }
            if (depth === 0) {
              out.push(unwrapCss(res.slice(b + 1, j - 1)));
              i = j;
              continue;
            }
          }
        }
        out.push(res.charAt(i));
        i++;
      }
      return out.join('');
    };

    const processAllStyles = () => {
      const styles = document.querySelectorAll('style');
      styles.forEach((s) => {
        if (!(s as any).__unwrapped && s.textContent && s.textContent.indexOf('@layer') !== -1) {
          (s as any).__unwrapped = true;
          s.textContent = unwrapCss(s.textContent);
        }
      });
    };

    processAllStyles();
    if (typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => processAllStyles());
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    const timer = setInterval(processAllStyles, 500);
    setTimeout(() => clearInterval(timer), 10000);
  }

  // 16. CSS Custom Properties (Variables) Ponyfill for Chrome < 49
  const supportsNativeVars = window.CSS && typeof window.CSS.supports === 'function' && window.CSS.supports('(--foo: red)');
  if (!supportsNativeVars) {
    try {
      if (typeof cssVars === 'function') {
        cssVars({
          watch: true,
          onlyLegacy: true,
          shadowDOM: false,
        });
      }
    } catch (e) {
      console.warn('[css-vars-ponyfill error]:', e);
    }
  }
})();
