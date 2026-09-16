// Comprehensive Polyfills for Legacy Browsers & WebViews (Android 5/6, Chrome 44-50, Safari 9+)

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

  // 15. Array.prototype.flatMap
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function(callback: any, thisArg?: any) {
      return Array.prototype.map.call(this, callback, thisArg).flat(1);
    };
  }

  // 16. Object.values & Object.entries
  if (!Object.values) {
    (Object as any).values = function(obj: any) {
      return Object.keys(obj).map(function(k) { return obj[k]; });
    };
  }
  if (!Object.entries) {
    (Object as any).entries = function(obj: any) {
      return Object.keys(obj).map(function(k) { return [k, obj[k]]; });
    };
  }

  // 17. Promise.allSettled
  if (!Promise.allSettled) {
    (Promise as any).allSettled = function(promises: Iterable<any>) {
      return Promise.all(
        Array.from(promises).map(function(item) {
          return Promise.resolve(item).then(
            function(value) { return { status: 'fulfilled' as const, value: value }; },
            function(reason) { return { status: 'rejected' as const, reason: reason }; }
          );
        })
      );
    };
  }

  // 18. crypto.randomUUID fallback
  if (typeof window.crypto === 'undefined') {
    (window as any).crypto = {};
  }
  if (typeof window.crypto.randomUUID !== 'function') {
    window.crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }) as any;
    };
  }

  // 19. CSS Cascade Layers (@layer) & @property Unwrapper for Legacy Browsers (Chrome < 99, Android 5/6/7 WebView, Safari < 16)
  const isLayerSupported = typeof (window as any).CSSLayerBlockRule !== 'undefined';
  
  const unwrapCss = (css: string): string => {
    if (!css) return css;
    // Strip standalone layer declarations
    let res = css.replace(/@layer\s+[^;{]+;/g, '');
    // Strip @property which breaks older browser parsers
    res = res.replace(/@property\s+--tw-[^{]+{[^}]+}/g, '');

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
                output += unwrapCss(inner);
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

    // Resolve calc(var(--spacing) * <N>) for older mobile browsers
    output = output.replace(/calc\(var\(--spacing\)\s*\*\s*([0-9.]+)\)/g, (_m, num) => {
      const px = Math.round(parseFloat(num) * 4 * 100) / 100;
      return px + 'px';
    });
    output = output.replace(/var\(--spacing\)/g, '4px');

    // Expand logical padding/margin
    output = output.replace(/padding-inline:([^;}]+)/g, 'padding-left:$1;padding-right:$1;padding-inline:$1');
    output = output.replace(/margin-inline:([^;}]+)/g, 'margin-left:$1;margin-right:$1;margin-inline:$1');
    output = output.replace(/padding-block:([^;}]+)/g, 'padding-top:$1;padding-bottom:$1;padding-block:$1');
    output = output.replace(/margin-block:([^;}]+)/g, 'margin-top:$1;margin-bottom:$1;margin-block:$1');

    return output;
  };

  const processAllStyles = () => {
    const styles = document.querySelectorAll('style');
    styles.forEach((s) => {
      if (!(s as any).__unwrapped && s.textContent && (s.textContent.indexOf('@layer') !== -1 || s.textContent.indexOf('@property') !== -1)) {
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
  const timer = setInterval(processAllStyles, 400);
  setTimeout(() => clearInterval(timer), 12000);
})();
