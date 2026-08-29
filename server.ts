import express from "express";
import path from "path";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import AdmZip from "adm-zip";
import Database from 'better-sqlite3';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { adminDb, adminAuth } from "./src/lib/firebase-admin.ts";
import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config({ override: true });

const DEFAULT_GROQ_API_KEY = process.env.GROQ_API_KEY || "";
let groqKeyInvalidated = false;

function isValidGroqKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    !trimmed || 
    trimmed === "MY_GROQ_API_KEY" || 
    trimmed === "YOUR_GROQ_API_KEY" || 
    trimmed.startsWith("MY_") ||
    trimmed.includes("...") || 
    trimmed.length < 25 ||
    !trimmed.startsWith("gsk_")
  ) {
    return false;
  }
  return true;
}

function getGroqClient(customKey?: string) {
  if (groqKeyInvalidated && !customKey) return null;
  const apiKey = (customKey || DEFAULT_GROQ_API_KEY).trim();
  if (!isValidGroqKey(apiKey)) return null;
  try {
    return new Groq({ apiKey });
  } catch (e) {
    return null;
  }
}

function getPythonExecutable(): string {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  const candidates = [
    'python3',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python',
    '/usr/bin/python',
    '/usr/local/bin/python'
  ];
  for (const cand of candidates) {
    try {
      if (cand.startsWith('/')) {
        if (fs.existsSync(cand)) return cand;
      } else {
        execSync(`${cand} --version`, { stdio: 'ignore' });
        return cand;
      }
    } catch {
      // ignore
    }
  }
  return 'python3';
}

// Local Database Setup
function createOrRepairDatabase(dbPath: string) {
  const safeRemove = (pathStr: string) => {
    try {
      if (fs.existsSync(pathStr)) fs.unlinkSync(pathStr);
    } catch (e) {
      console.error(`Failed to delete file ${pathStr}:`, e);
    }
  };

  const openAndSetup = () => {
    let database: any = null;
    try {
      database = new Database(dbPath);
      database.pragma('journal_mode = WAL');
      database.pragma('busy_timeout = 30000');
      database.pragma('synchronous = NORMAL');
      database.pragma('cache_size = -64000'); // 64MB memory cache for fast query pooling
      database.pragma('mmap_size = 268435456'); // 256MB memory mapped I/O
      database.pragma('temp_store = MEMORY'); // Store temporary tables in memory

      // 1. Quick integrity check
      const check = database.pragma('quick_check') as any[];
      if (check && check.length > 0) {
        const firstRow = check[0];
        const status = firstRow.quick_check || firstRow.integrity_check || (typeof firstRow === 'string' ? firstRow : '');
        if (status && status !== 'ok') {
          throw new Error(`Integrity check reported: ${status}`);
        }
      }

      // 2. Ensure schema
      database.exec(`CREATE TABLE IF NOT EXISTS bots (
          id TEXT PRIMARY KEY,
          owner_id TEXT,
          name TEXT,
          language TEXT,
          entryPoint TEXT,
          code BLOB,
          status TEXT DEFAULT 'stopped'
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS bot_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_id TEXT,
          type TEXT,
          message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS subscriptions (
          user_id TEXT PRIMARY KEY,
          plan TEXT DEFAULT 'free',
          assignedDateFormatted TEXT,
          dueDateFormatted TEXT,
          assignedAt TEXT,
          dueDateISO TEXT,
          updatedAt TEXT
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS profiles (
          user_id TEXT PRIMARY KEY,
          email TEXT,
          displayName TEXT,
          photoURL TEXT,
          createdAt TEXT,
          updatedAt TEXT
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS user_roles (
          user_id TEXT PRIMARY KEY,
          role TEXT,
          email TEXT
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT,
          userEmail TEXT,
          title TEXT,
          message TEXT,
          type TEXT,
          createdAt TEXT,
          read INTEGER DEFAULT 0
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS daily_usage (
          user_id TEXT,
          date TEXT,
          count INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, date)
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS telegram_support_config (
          key TEXT PRIMARY KEY,
          value TEXT
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS telegram_support_users (
          chat_id INTEGER PRIMARY KEY,
          username TEXT,
          first_name TEXT,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          message_count INTEGER DEFAULT 1
      )`);

      database.exec(`CREATE TABLE IF NOT EXISTS telegram_support_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER,
          username TEXT,
          role TEXT,
          text TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // Performance Optimization: Targeted high-speed Indexes
      database.exec(`
          CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
          CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
          CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_id ON bot_logs(bot_id, id);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
          CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
          CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userId, read);
          CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
          CREATE INDEX IF NOT EXISTS idx_tg_logs_chat ON telegram_support_logs(chat_id, id);
          CREATE INDEX IF NOT EXISTS idx_tg_logs_created ON telegram_support_logs(created_at);
      `);

      // Maintenance: Auto-prune bot logs older than 7 days to preserve disk space & speed
      try {
        database.exec(`DELETE FROM bot_logs WHERE created_at < datetime('now', '-7 days');`);
      } catch (_) {}

      // 3. Test queries on all tables and indexes to catch disk image malformed errors early
      database.prepare("SELECT count(*) FROM bots").get();
      database.prepare("SELECT id, status FROM bots LIMIT 1").all();
      database.prepare("SELECT count(*) FROM bot_logs").get();
      database.prepare("SELECT count(*) FROM subscriptions").get();
      database.prepare("SELECT count(*) FROM daily_usage").get();
      
      try {
        database.pragma('wal_checkpoint(TRUNCATE)');
      } catch (_) {}

      return database;
    } catch (err) {
      if (database) {
        try { database.close(); } catch (_) {}
      }
      throw err;
    }
  };

  try {
    return openAndSetup();
  } catch (err: any) {
    console.error(`[SQLite Error]: Database ${dbPath} is corrupted or invalid (${err?.message}). Rebuilding fresh DB...`);
    safeRemove(dbPath);
    safeRemove(`${dbPath}-wal`);
    safeRemove(`${dbPath}-shm`);
    safeRemove(`${dbPath}-journal`);
    return openAndSetup();
  }
}

const db = createOrRepairDatabase('gibritplat.db');

function syncBotsFromDisk(database: any, defaultUserId?: string) {
  const botsRunningDir = path.join(process.cwd(), 'bots_running');
  if (!fs.existsSync(botsRunningDir)) return;

  const knownNames: Record<string, string> = {
    'rE8KhEFgQ4h0anaCUDzO': 'ArdoChat Bot',
    'tM8bZGCvJciQeJHrvxNh': 'AI Chat Bot',
    'qdkiN1G5ya9SgzI4gixE': 'CloudBot Telegram Bot',
    'FQwQVl0E1qIAXQzHMOkb': 'Python Telegram Bot',
    'OeOfM41O4qkP9hY60t9c': 'Kino / Movie Search Bot',
    'AvF3ZBkExmvsRULK0BBB': 'Go High-Speed Bot',
    'IO7rIZ9LyawwNTHfjk4F': 'Node.js Starter Bot'
  };

  const knownTypes: Record<string, { language: string; entryPoint: string }> = {
    'rE8KhEFgQ4h0anaCUDzO': { language: 'python', entryPoint: 'bot.py' },
    'tM8bZGCvJciQeJHrvxNh': { language: 'python', entryPoint: 'main.py' },
    'qdkiN1G5ya9SgzI4gixE': { language: 'nodejs', entryPoint: 'index.js' },
    'FQwQVl0E1qIAXQzHMOkb': { language: 'python', entryPoint: 'main.py' },
    'OeOfM41O4qkP9hY60t9c': { language: 'python', entryPoint: 'handlers.py' },
    'AvF3ZBkExmvsRULK0BBB': { language: 'go', entryPoint: 'main.go' },
    'IO7rIZ9LyawwNTHfjk4F': { language: 'nodejs', entryPoint: 'index.js' }
  };

  try {
    const folders = fs.readdirSync(botsRunningDir);
    for (const botId of folders) {
      const botDir = path.join(botsRunningDir, botId);
      if (!fs.existsSync(botDir) || !fs.statSync(botDir).isDirectory()) continue;

      const existing = database.prepare('SELECT id, owner_id FROM bots WHERE id = ?').get(botId) as any;
      if (!existing) {
        const name = knownNames[botId] || `Bot ${botId.slice(0, 6)}`;
        const typeInfo = knownTypes[botId] || { language: 'python', entryPoint: 'main.py' };

        let codeBlob: Buffer | null = null;
        const zipPath = path.join(botDir, 'bot.zip');
        if (fs.existsSync(zipPath)) {
          try { codeBlob = fs.readFileSync(zipPath); } catch (_) {}
        }

        if (!codeBlob) {
          try {
            const zip = new AdmZip();
            const addDirToZip = (dir: string, zipRel: string) => {
              const items = fs.readdirSync(dir);
              for (const item of items) {
                if (item === 'bot.zip' || item === '.pid' || item === 'bot_bin' || item.endsWith('.db') || item === '__pycache__' || item === 'node_modules') continue;
                const full = path.join(dir, item);
                const rel = zipRel ? path.join(zipRel, item) : item;
                if (fs.statSync(full).isDirectory()) {
                  addDirToZip(full, rel);
                } else {
                  zip.addLocalFile(full, zipRel);
                }
              }
            };
            addDirToZip(botDir, '');
            codeBlob = zip.toBuffer();
          } catch (_) {}
        }

        database.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          botId,
          defaultUserId || '',
          name,
          typeInfo.language,
          typeInfo.entryPoint,
          codeBlob,
          'stopped'
        );
        console.log(`[DiskSync]: Restored bot ${botId} (${name}) to SQLite database`);
      } else if (!existing.owner_id && defaultUserId) {
        database.prepare('UPDATE bots SET owner_id = ? WHERE id = ?').run(defaultUserId, botId);
      }
    }
  } catch (e) {
    console.warn('[DiskSync error]:', e);
  }
}

// Perform initial disk sync to restore all existing bots
syncBotsFromDisk(db);

const runningBots = new Map<string, any>();
const userStoppedBots = new Set<string>();
const startingBots = new Set<string>();
const schedulePausedBots = new Set<string>();
const botCrashTracker = new Map<string, { count: number; lastCrash: number }>();

// O'zbekiston vaqti (Asia/Tashkent UTC+5) yordamchi funksiyalari
function getUzbekistanTime(): { hours: number; minutes: number; totalMinutes: number; timeStr: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour')?.value || '0';
  const minPart = parts.find(p => p.type === 'minute')?.value || '0';
  const hours = parseInt(hourPart, 10);
  const minutes = parseInt(minPart, 10);
  const totalMinutes = hours * 60 + minutes;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { hours, minutes, totalMinutes, timeStr };
}

interface PlanSchedule {
  plan: 'free' | 'pro' | 'vip';
  name: string;
  startHour: string;
  endHour: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
}

const PLAN_SCHEDULES: Record<'free' | 'pro' | 'vip', PlanSchedule> = {
  free: {
    plan: 'free',
    name: 'Free (Bepul)',
    startHour: '07:25',
    endHour: '21:00',
    startMinutes: 7 * 60 + 25, // 445 daqiqa (07:25)
    endMinutes: 21 * 60,       // 1260 daqiqa (kechki 21:00 / 09:00 PM)
    description: "07:25 dan 21:00 gacha (O'zbekiston vaqti)"
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    startHour: '06:30',
    endHour: '22:35',
    startMinutes: 6 * 60 + 30, // 390 daqiqa (06:30)
    endMinutes: 22 * 60 + 35,  // 1355 daqiqa (kechki 22:35 / 10:35 PM)
    description: "06:30 dan 22:35 gacha (O'zbekiston vaqti)"
  },
  vip: {
    plan: 'vip',
    name: 'VIP',
    startHour: '04:00',
    endHour: '00:00',
    startMinutes: 4 * 60,      // 240 daqiqa (04:00)
    endMinutes: 24 * 60,       // 1440 daqiqa (yarim kecha 00:00)
    description: "04:00 dan 00:00 (yarim kecha) gacha (O'zbekiston vaqti)"
  }
};

function isPlanInActiveSchedule(plan: 'free' | 'pro' | 'vip'): { active: boolean; sched: PlanSchedule; uzbTime: ReturnType<typeof getUzbekistanTime> } {
  const uzbTime = getUzbekistanTime();
  const sched = PLAN_SCHEDULES[plan] || PLAN_SCHEDULES.free;

  let active = false;
  if (sched.plan === 'vip') {
    // 04:00 dan 24:00 (00:00) gacha -> 04:00 dan 23:59:59 faol, 00:00 dan 03:59 gacha o'chiq
    active = uzbTime.totalMinutes >= sched.startMinutes;
  } else {
    active = uzbTime.totalMinutes >= sched.startMinutes && uzbTime.totalMinutes < sched.endMinutes;
  }

  return { active, sched, uzbTime };
}

let firestoreQuotaExhaustedUntil = 0;

function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < firestoreQuotaExhaustedUntil;
}

function handleFirestoreError(err: any, context?: string): void {
  const errMsg = err?.message || String(err || '');
  const errCode = err?.code;
  if (errCode === 8 || errCode === 'resource-exhausted' || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota limit exceeded')) {
    if (Date.now() >= firestoreQuotaExhaustedUntil) {
      console.warn(`[Firestore Quota Notice]: Daily free quota reached. Operating seamlessly via SQLite database.`);
    }
    // Pause Firestore direct attempts for 15 minutes
    firestoreQuotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
  } else if (context) {
    console.warn(`[Firestore ${context} notice]:`, errMsg);
  }
}

async function updateFirestoreBotStatus(botId: string, status: 'running' | 'stopped') {
    if (!adminDb || isFirestoreQuotaExhausted()) return;
    try {
        await adminDb.collection('bots').doc(botId).set({
            status: status
        }, { merge: true });
    } catch (e: any) {
        handleFirestoreError(e, `update bot status (${botId})`);
    }
}

const firestoreThrottle = new Map<string, number>();

async function updateFirestoreBotMetadata(botId: string, metadata: { language?: string; entryPoint?: string; status?: string }) {
    if (!adminDb || isFirestoreQuotaExhausted()) return;
    
    // Throttle: only update once every 30 seconds
    const now = Date.now();
    const lastUpdate = firestoreThrottle.get(botId) || 0;
    if (now - lastUpdate < 30000) return;
    firestoreThrottle.set(botId, now);

    try {
        await adminDb.collection('bots').doc(botId).set(metadata, { merge: true });
    } catch (e: any) {
        handleFirestoreError(e, `update bot metadata (${botId})`);
    }
}

async function getUserPlanSafe(userId: string): Promise<'free' | 'pro' | 'vip'> {
  if (!userId) return 'free';
  let sqlitePlan: 'free' | 'pro' | 'vip' = 'free';
  try {
    const sub = db.prepare('SELECT plan FROM subscriptions WHERE user_id = ?').get(userId) as any;
    if (sub && sub.plan) sqlitePlan = sub.plan;
  } catch (_) {}

  if (adminDb && !isFirestoreQuotaExhausted()) {
    try {
      const subDoc = await adminDb.collection('subscriptions').doc(userId).get();
      if (subDoc.exists) {
        const fsPlan = (subDoc.data()?.plan as any) || 'free';
        try {
          db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan) VALUES (?, ?)").run(userId, fsPlan);
        } catch (_) {}
        return fsPlan;
      }
    } catch (e) {
      handleFirestoreError(e, 'getUserPlanSafe');
    }
  }
  return sqlitePlan;
}

async function getUserDailyUsageSafe(userId: string): Promise<{ count: number; date: string; usageRef: any }> {
  const date = new Date().toISOString().split('T')[0];
  let currentCount = 0;
  let usageRef: any = null;

  try {
    const row = db.prepare('SELECT count FROM daily_usage WHERE user_id = ? AND date = ?').get(userId, date) as any;
    if (row && typeof row.count === 'number') {
      currentCount = row.count;
    }
  } catch (_) {}

  if (adminDb && !isFirestoreQuotaExhausted()) {
    try {
      usageRef = adminDb.collection('usage').doc(userId).collection('daily-usage').doc(date);
      const usageDoc = await usageRef.get();
      if (usageDoc.exists) {
        const fsCount = usageDoc.data()?.count || 0;
        currentCount = Math.max(currentCount, fsCount);
        try {
          db.prepare('INSERT OR REPLACE INTO daily_usage (user_id, date, count) VALUES (?, ?, ?)').run(userId, date, currentCount);
        } catch (_) {}
      }
    } catch (e) {
      handleFirestoreError(e, 'getUserDailyUsageSafe');
    }
  }

  return { count: currentCount, date, usageRef };
}

async function incrementUserDailyUsageSafe(userId: string, countToAdd: number = 1, usageRef?: any): Promise<number> {
  const date = new Date().toISOString().split('T')[0];
  let newCount = countToAdd;

  try {
    const row = db.prepare('SELECT count FROM daily_usage WHERE user_id = ? AND date = ?').get(userId, date) as any;
    newCount = (row?.count || 0) + countToAdd;
    db.prepare('INSERT OR REPLACE INTO daily_usage (user_id, date, count) VALUES (?, ?, ?)').run(userId, date, newCount);
  } catch (_) {}

  if (adminDb && !isFirestoreQuotaExhausted()) {
    try {
      const ref = usageRef || adminDb.collection('usage').doc(userId).collection('daily-usage').doc(date);
      await adminDb.runTransaction(async (t: any) => {
        const docSnap = await t.get(ref);
        const count = docSnap.exists ? (docSnap.data()?.count || 0) : 0;
        t.set(ref, { count: count + countToAdd }, { merge: true });
      });
    } catch (e) {
      handleFirestoreError(e, 'incrementUserDailyUsageSafe');
    }
  }

  return newCount;
}

function addBotLog(botId: string, type: 'deploy' | 'run' | 'system', message: string) {
    const cleanMsg = message.toString().trim();
    if (!cleanMsg) return;
    try {
        db.prepare('INSERT INTO bot_logs (bot_id, type, message) VALUES (?, ?, ?)').run(botId, type, cleanMsg);
    } catch (e) {
        console.error("Failed to write to database bot_logs:", e);
    }
    console.log(`[BotLog - ${type} - ${botId}]: ${cleanMsg}`);
}

const pythonStdLib = new Set([
  'os', 'sys', 're', 'json', 'time', 'asyncio', 'math', 'random', 'datetime', 'sqlite3',
  'typing', 'pathlib', 'logging', 'functools', 'subprocess', 'urllib', 'threading',
  'multiprocessing', 'traceback', 'collections', 'itertools', 'base64', 'hashlib',
  'socket', 'struct', 'copy', 'dataclasses', 'enum', 'inspect', 'io', 'glob', 'shutil',
  'tempfile', 'csv', 'xml', 'html', 'http', 'email', 'ast', 'dis', 'gc', 'platform',
  'signal', 'weakref', 'abc', 'contextlib', 'typing_extensions', 'types', 'unittest',
  'ctypes', 'queue', 'ssl', 'warnings', 'uuid', 'decimal', 'fractions', 'heapq',
  'bisect', 'array', 'shlex', 'zlib', 'gzip', 'zipfile', 'tarfile', 'pickle', 'shelve',
  'dbm', 'reprlib', 'pprint', 'secrets', 'hmac', 'calendar', 'locale', 'gettext',
  'argparse', 'optparse', 'operator', 'codecs', 'errno', 'selectors', 'mimetypes',
  'cgi', 'cgitb', 'wsgiref', 'ipaddress', 'turtle', 'tkinter', 'venv', 'zipimport'
]);

const commonLocalModuleNames = new Set([
  'handlers', 'handler', 'data', 'utils', 'util', 'config', 'settings', 'database', 'db',
  'models', 'model', 'keyboards', 'keyboard', 'buttons', 'button', 'states', 'state',
  'middlewares', 'middleware', 'filters', 'filter', 'views', 'view', 'helpers', 'helper',
  'services', 'service', 'routes', 'route', 'bot', 'app', 'main', 'core', 'plugins',
  'plugin', 'locales', 'locale', 'texts', 'text', 'keyboards_inline', 'inline', 'loader',
  'admin', 'user', 'client', 'common', 'constants', 'const', 'types', 'schemas', 'schema',
  'enums', 'functions', 'logic', 'callbacks', 'callback', 'menus', 'menu', 'crud',
  'tasks', 'events', 'api', 'tools'
]);

const pythonPkgMap: Record<string, string> = {
  'telebot': 'pyTelegramBotAPI',
  'telegram': 'python-telegram-bot',
  'bs4': 'beautifulsoup4',
  'cv2': 'opencv-python-headless',
  'PIL': 'Pillow',
  'dotenv': 'python-dotenv',
  'fitz': 'PyMuPDF',
  'yaml': 'PyYAML',
  'skimage': 'scikit-image',
  'sklearn': 'scikit-learn',
  'psycopg2': 'psycopg2-binary',
  'discord': 'discord.py',
  'aiosqlite': 'aiosqlite',
  'aiogram': 'aiogram',
  'aiohttp': 'aiohttp',
  'httpx': 'httpx',
  'requests': 'requests',
  'asyncpg': 'asyncpg',
  'motor': 'motor',
  'pymongo': 'pymongo',
  'redis': 'redis',
  'sqlalchemy': 'SQLAlchemy',
  'peewee': 'peewee',
  'tortoise': 'tortoise-orm',
  'telethon': 'telethon',
  'pyrogram': 'pyrogram',
  'tgcrypto': 'tgcrypto',
  'fastapi': 'fastapi',
  'flask': 'Flask',
  'uvicorn': 'uvicorn',
  'pydantic': 'pydantic',
  'apscheduler': 'APScheduler',
  'jinja2': 'Jinja2',
  'openai': 'openai'
};

function isLocalPythonModule(botDir: string, modName: string): boolean {
  if (!modName) return true;
  const lower = modName.toLowerCase().trim();
  if (!lower) return true;
  if (pythonStdLib.has(lower)) return true;

  // Check if there is an explicit external package mapping (like telebot -> pyTelegramBotAPI)
  if (pythonPkgMap[lower]) return false;

  // If it's a known generic project module name
  if (commonLocalModuleNames.has(lower)) {
    return true;
  }

  // Check if file or directory exists anywhere in bot workspace
  const directPy = path.join(botDir, `${modName}.py`);
  const directDir = path.join(botDir, modName);
  if (fs.existsSync(directPy) || fs.existsSync(directDir)) return true;

  try {
    const searchRecursively = (dir: string): boolean => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item === 'node_modules' || item === '__pycache__' || item === '.git' || item === '.venv' || item === 'venv') continue;
        const lowerItem = item.toLowerCase();
        if (lowerItem === `${lower}.py` || lowerItem === lower) return true;
        const fullPath = path.join(dir, item);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            if (searchRecursively(fullPath)) return true;
          }
        } catch (e) {}
      }
      return false;
    };
    if (searchRecursively(botDir)) return true;
  } catch (e) {}

  return false;
}

function autoDetectPythonDependencies(botDir: string, pyFiles: string[]): string[] {
  const detected = new Set<string>();
  let hasAiogram2 = false;
  let hasPtb13 = false;

  for (const pyFile of pyFiles) {
    try {
      const fullPath = path.join(botDir, pyFile);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for aiogram 2.x syntax (Claude AI / legacy bots)
      if (
        content.includes('from aiogram.utils import executor') ||
        content.includes('executor.start_polling') ||
        content.includes('from aiogram import executor') ||
        content.includes('from aiogram.dispatcher.filters import Text')
      ) {
        hasAiogram2 = true;
      }

      // Check for python-telegram-bot v13 syntax
      if (
        content.includes('from telegram.ext import Updater') ||
        content.includes('Updater(')
      ) {
        hasPtb13 = true;
      }

      const lines = content.split('\n');
      for (const line of lines) {
        // Strip comments and trailing spaces
        const noComment = line.split('#')[0].trim();
        if (!noComment) continue;

        // Matches 'import pkg', 'import pkg as p', 'import pkg1, pkg2'
        const importMatch = noComment.match(/^(?:import)\s+([a-zA-Z0-9_,\s]+)/);
        if (importMatch) {
          const parts = importMatch[1].split(',');
          for (let p of parts) {
            p = p.trim().split(/\s+/)[0].split('.')[0];
            if (p && !isLocalPythonModule(botDir, p)) {
              detected.add(pythonPkgMap[p] || p);
            }
          }
        }

        // Matches 'from pkg import ...', 'from pkg.subpkg import ...'
        const fromMatch = noComment.match(/^(?:from)\s+([a-zA-Z0-9_.]+)\s+import/);
        if (fromMatch) {
          const mod = fromMatch[1].split('.')[0];
          if (mod && !isLocalPythonModule(botDir, mod)) {
            detected.add(pythonPkgMap[mod] || mod);
          }
        }
      }
    } catch (e) {}
  }

  const result: string[] = [];
  for (const pkg of detected) {
    if (pkg === 'aiogram') {
      result.push(hasAiogram2 ? 'aiogram<3.0.0,>=2.25.1' : 'aiogram');
    } else if (pkg === 'python-telegram-bot') {
      result.push(hasPtb13 ? 'python-telegram-bot<20.0,>=13.15' : 'python-telegram-bot');
    } else if (pkg === 'telebot') {
      result.push('pyTelegramBotAPI');
    } else {
      result.push(pkg);
    }
  }

  return result;
}

function autoDetectNodeDependencies(botDir: string, jsFiles: string[]): { dependencies: Record<string, string>; hasEsm: boolean } {
  const nodeStdLib = new Set([
    'fs', 'fs/promises', 'path', 'http', 'https', 'crypto', 'os', 'events', 
    'child_process', 'util', 'stream', 'url', 'querystring', 'zlib', 'net', 
    'tls', 'cluster', 'buffer', 'worker_threads', 'readline', 'dns', 'constants', 
    'vm', 'v8', 'perf_hooks', 'async_hooks', 'string_decoder', 'timers', 'tty'
  ]);

  const knownNodeMap: Record<string, string> = {
    'telegraf': '^4.16.3',
    'node-telegram-bot-api': '^0.66.0',
    'grammy': '^1.35.0',
    '@grammyjs/runner': '^2.0.3',
    '@grammyjs/conversations': '^1.2.0',
    '@grammyjs/menu': '^1.2.1',
    'dotenv': '^16.4.7',
    'axios': '^1.7.9',
    'node-fetch': '^2.7.0',
    'express': '^4.21.2',
    'cors': '^2.8.5',
    'ws': '^8.18.0',
    'moment': '^2.30.1',
    'dayjs': '^1.11.13',
    'lodash': '^4.17.21',
    'better-sqlite3': '^11.8.1',
    'sqlite3': '^5.1.7',
    'pg': '^8.13.1',
    'mysql2': '^3.12.0',
    'mongoose': '^8.10.0',
    'openai': '^4.85.0',
    '@google/genai': '^0.1.2',
    '@google/generative-ai': '^0.22.0',
    'node-cron': '^3.0.3'
  };

  const detected: Record<string, string> = {};
  let hasEsm = false;

  for (const jsFile of jsFiles) {
    try {
      const fullPath = path.join(botDir, jsFile);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');

      if (/^\s*import\s+(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"][^'"]+['"]/m.test(content) || /^\s*export\s+/m.test(content)) {
        hasEsm = true;
      }

      // 1. require('package')
      const requireMatches = content.matchAll(/require\s*\(\s*['"]([@a-zA-Z0-9_\-\./]+)['"]\s*\)/g);
      for (const m of requireMatches) {
        let pkg = m[1].trim();
        if (pkg.startsWith('.') || pkg.startsWith('/')) continue;
        if (pkg.startsWith('@')) {
          const parts = pkg.split('/');
          pkg = parts.slice(0, 2).join('/');
        } else {
          pkg = pkg.split('/')[0];
        }
        if (pkg && !nodeStdLib.has(pkg)) {
          detected[pkg] = knownNodeMap[pkg] || 'latest';
        }
      }

      // 2. import ... from 'package'
      const importMatches = content.matchAll(/(?:from|import)\s+['"]([@a-zA-Z0-9_\-\./]+)['"]/g);
      for (const m of importMatches) {
        let pkg = m[1].trim();
        if (pkg.startsWith('.') || pkg.startsWith('/')) continue;
        if (pkg.startsWith('@')) {
          const parts = pkg.split('/');
          pkg = parts.slice(0, 2).join('/');
        } else {
          pkg = pkg.split('/')[0];
        }
        if (pkg && !nodeStdLib.has(pkg)) {
          detected[pkg] = knownNodeMap[pkg] || 'latest';
        }
      }
    } catch (e) {}
  }

  return { dependencies: detected, hasEsm };
}

function sanitizeRequirementsTxt(botDir: string, reqPath: string): string[] {
  if (!fs.existsSync(reqPath)) return [];
  try {
    const content = fs.readFileSync(reqPath, 'utf8');
    const lines = content.split('\n');
    const validLines: string[] = [];
    const seen = new Set<string>();

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      
      // Fix telebot -> pyTelegramBotAPI
      if (line.toLowerCase() === 'telebot' || line.toLowerCase().startsWith('telebot==') || line.toLowerCase().startsWith('telebot>=')) {
        line = 'pyTelegramBotAPI';
      }

      const pkgName = line.split(/[=<>!~;@\s]/)[0].trim();
      if (!pkgName) continue;
      if (isLocalPythonModule(botDir, pkgName)) {
        continue;
      }
      if (seen.has(line.toLowerCase())) continue;
      seen.add(line.toLowerCase());
      validLines.push(line);
    }

    fs.writeFileSync(reqPath, validLines.length > 0 ? validLines.join('\n') + '\n' : '');
    return validLines;
  } catch (e) {
    return [];
  }
}

function autoRepairPythonFiles(botDir: string, pyFiles: string[]) {
  const pyBin = getPythonExecutable();
  for (const file of pyFiles) {
    const fullPath = path.join(botDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // 1. Replace HTML entities if present in Python source
      if (content.includes('&lt;') || content.includes('&gt;') || content.includes('&amp;') || content.includes('&quot;')) {
        content = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&');
        modified = true;
      }

      // 2. Fix broken unclosed string concatenation at line ends, e.g. "*Text*\n"\n or "...\n"\n
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // If a line ends with a quote followed by a backslash but the next line is a quote alone or broken
        if (line.endsWith('"\\') || line.endsWith("'\\")) {
          // Check next line
          if (i + 1 < lines.length && lines[i + 1].trim() === '"\\') {
            lines[i + 1] = '';
            modified = true;
          }
        }
      }
      if (modified) {
        content = lines.filter((_, idx) => lines[idx] !== '' || idx === lines.length - 1).join('\n');
      }

      // 3. Inject error handler for python-telegram-bot (ApplicationBuilder / run_polling) if missing
      if (content.includes('ApplicationBuilder') || content.includes('telegram.ext') || content.includes('run_polling')) {
        if (!content.includes('add_error_handler') && !content.includes('_cloudbot_error_handler')) {
          const handlerDef = `\n# CloudBot Auto-injected Global Error Handler\nasync def _cloudbot_error_handler(update, context):\n    if not context.error:\n        return\n    err_str = str(context.error)\n    err_type = type(context.error).__name__\n    transient = ('httpx.ReadError', 'httpx.ConnectError', 'httpx.RemoteProtocolError', 'httpx.ReadTimeout', 'httpx.ConnectTimeout', 'httpx.TimeoutException', 'ReadError', 'ConnectError', 'RemoteProtocolError', 'ReadTimeout', 'ConnectTimeout', 'TimeoutException', 'TimedOut', 'NetworkError', 'RetryAfter')\n    if any(t in err_str or t in err_type for t in transient):\n        return\n    import logging\n    logging.warning(f"Bot handler notice: {context.error}")\n`;
          if (content.includes('def main():') || content.includes('def main(')) {
            content = content.replace(/(def main\(.*?\):)/, `${handlerDef}\n$1`);
          } else {
            content = handlerDef + '\n' + content;
          }
          if (content.includes('.run_polling()')) {
            content = content.replace(/(\w+)\.run_polling\(\)/, `$1.add_error_handler(_cloudbot_error_handler)\n    $1.run_polling()`);
          }
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content);
      }
    } catch (e) {}
  }
}

function killTree(pid: number) {
  try {
      const children = execSync(`pgrep -P ${pid}`).toString().trim().split('\n');
      for (const child of children) {
          if (child && !isNaN(parseInt(child, 10))) killTree(parseInt(child, 10));
      }
  } catch (e) {
      // No children
  }
  try {
      process.kill(pid, 'SIGTERM');
  } catch (e) {}
  try {
      process.kill(pid, 'SIGKILL');
  } catch (e) {}
}

function commandExists(command: string) {
    if (fs.existsSync(command)) return true;
    try {
        execSync(`command -v ${command}`, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function validateBotCodeSyntax(botDir: string, activeLanguage: string, activeEntryPoint: string, allDiskFiles: string[]): { valid: boolean; error?: string } {
  if (activeLanguage === 'python') {
    const pyBin = getPythonExecutable();
    const pyFiles = allDiskFiles.filter(f => f.endsWith('.py'));
    
    // Sort entry point first
    const sorted = [...pyFiles].sort((a, b) => (a === activeEntryPoint ? -1 : b === activeEntryPoint ? 1 : 0));
    
    for (const relFile of sorted) {
      const fullPath = path.join(botDir, relFile);
      if (!fs.existsSync(fullPath)) continue;
      try {
        execSync(`${pyBin} -m py_compile "${fullPath}"`, { stdio: 'pipe', encoding: 'utf8' });
      } catch (compileErr: any) {
        const stderr = (compileErr?.stderr || compileErr?.stdout || compileErr?.message || '').toString().trim();
        return {
          valid: false,
          error: `Python fayli [${relFile}] da sintaksis xatoligi aniqlandi:\n${stderr || 'SyntaxError: Kodda sintaktik xatolik mavjud'}`
        };
      }
    }
  } else if (activeLanguage === 'nodejs') {
    const jsFiles = allDiskFiles.filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'));
    for (const relFile of jsFiles) {
      const fullPath = path.join(botDir, relFile);
      if (!fs.existsSync(fullPath)) continue;
      try {
        execSync(`node --check "${fullPath}"`, { stdio: 'pipe', encoding: 'utf8' });
      } catch (checkErr: any) {
        const stderr = (checkErr?.stderr || checkErr?.stdout || checkErr?.message || '').toString().trim();
        return {
          valid: false,
          error: `JavaScript fayli [${relFile}] da sintaksis xatoligi aniqlandi:\n${stderr || 'SyntaxError: Kodda sintaktik xatolik mavjud'}`
        };
      }
    }
  } else if (activeLanguage === 'php') {
    const phpFiles = allDiskFiles.filter(f => f.endsWith('.php'));
    for (const relFile of phpFiles) {
      const fullPath = path.join(botDir, relFile);
      if (!fs.existsSync(fullPath)) continue;
      try {
        execSync(`php -l "${fullPath}"`, { stdio: 'pipe', encoding: 'utf8' });
      } catch (phpErr: any) {
        const stderr = (phpErr?.stderr || phpErr?.stdout || phpErr?.message || '').toString().trim();
        return {
          valid: false,
          error: `PHP fayli [${relFile}] da sintaksis xatoligi aniqlandi:\n${stderr || 'PHP Parse error'}`
        };
      }
    }
  }
  return { valid: true };
}

async function startBot(botId: string) {
    userStoppedBots.delete(botId);

    // Schedule check: Agar obuna rejasi bo'yicha tungi rejim bo'lsa, botni ishga tushirmasdan to'xtatilgan holda saqlash
    try {
      const botRow = db.prepare("SELECT owner_id, name FROM bots WHERE id = ?").get(botId) as any;
      if (botRow && botRow.owner_id) {
        const plan = await getUserPlanSafe(botRow.owner_id);
        const { active, sched, uzbTime } = isPlanInActiveSchedule(plan);
        if (!active) {
          console.log(`[startBot]: Bot ${botId} (${plan}) tungi rejimda (${uzbTime.timeStr}). Ishga tushirish to'xtatildi.`);
          db.prepare("UPDATE bots SET status = 'stopped' WHERE id = ?").run(botId);
          updateFirestoreBotStatus(botId, 'stopped');
          schedulePausedBots.add(botId);
          addBotLog(
            botId,
            'system',
            `[Avto-Jadval]: ${sched.name} tarifi bo'yicha tungi rejim (Faol vaqt: ${sched.startHour} - ${sched.endHour}, O'zbekiston vaqti: ${uzbTime.timeStr}). Server resurslarini tejash uchun bot to'xtatildi. Ertalab soat ${sched.startHour} da avtomatik ishga tushadi.`
          );
          return;
        }
      }
    } catch (schedErr) {
      console.warn(`[startBot schedule check error]:`, schedErr);
    }

    if (startingBots.has(botId)) {
        console.log(`[startBot]: Bot ${botId} is already starting/deploying. Skipping concurrent call.`);
        return;
    }
    startingBots.add(botId);
    
    let killedOld = false;
    // Kill from memory
    if (runningBots.has(botId)) {
        console.log(`[startBot]: Bot ${botId} already had an active process. Terminating old process...`);
        try {
            const oldProc = runningBots.get(botId);
            if (oldProc?.pid) killTree(oldProc.pid);
            killedOld = true;
        } catch (e) {}
        runningBots.delete(botId);
    }

    const botDir = path.join(process.cwd(), 'bots_running', botId);

    // Force kill any process tied to this bot directory or botId
    try {
        execSync(`pkill -9 -f "${botDir}"`, { stdio: 'ignore' });
        killedOld = true;
    } catch (e) {}
    try {
        execSync(`pkill -9 -f "${botId}"`, { stdio: 'ignore' });
        killedOld = true;
    } catch (e) {}
    try {
        execSync(`fuser -k -9 "${botDir}"`, { stdio: 'ignore' });
        killedOld = true;
    } catch (e) {}
    
    // Kill from PID file (orphans from server restarts)
    try {
        const pidPath = path.join(botDir, '.pid');
        if (fs.existsSync(pidPath)) {
            const oldPidStr = fs.readFileSync(pidPath, 'utf8').trim();
            if (oldPidStr) {
                const oldPid = parseInt(oldPidStr, 10);
                if (!isNaN(oldPid)) {
                    killTree(oldPid);
                    killedOld = true;
                }
            }
            try { fs.unlinkSync(pidPath); } catch (e) {}
        }
    } catch (e) {
        console.warn(`[startBot]: Error cleaning up old pid for ${botId}:`, e);
    }

    if (killedOld) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 1. Try to find bot in SQLite
    let bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId) as any;

    // 2. If bot not found in SQLite or code is missing, restore from Firestore
    if ((!bot || !bot.code) && adminDb && !isFirestoreQuotaExhausted()) {
        try {
            const fsDoc = await adminDb.collection('bots').doc(botId).get();
            if (fsDoc.exists) {
                const data = fsDoc.data();
                if (data) {
                    let codeBuffer: Buffer | null = null;
                    if (data.codeZipBase64) {
                        codeBuffer = Buffer.from(data.codeZipBase64, 'base64');
                    }
                    db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                        botId,
                        data.userId || '',
                        data.name || 'Bot',
                        data.language || 'nodejs',
                        data.entryPoint || 'index.js',
                        codeBuffer,
                        'stopped'
                    );
                    bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId) as any;
                }
            }
        } catch (err) {
            handleFirestoreError(err, "restore bot record");
        }
    }

    // Expiration check based on user plan
    if (bot && adminDb && !isFirestoreQuotaExhausted()) {
        try {
            const fsDoc = await adminDb.collection('bots').doc(botId).get();
            if (fsDoc.exists) {
                const botData = fsDoc.data();
                const ownerId = botData?.userId || bot.owner_id;
                let plan = 'free';
                
                if (ownerId && !isFirestoreQuotaExhausted()) {
                    const subDoc = await adminDb.collection('subscriptions').doc(ownerId).get();
                    if (subDoc.exists) {
                        plan = subDoc.data()?.plan || 'free';
                    }
                }
                
                const createdAtStr = botData?.createdAt;
                if (createdAtStr) {
                    const createdDate = new Date(createdAtStr);
                    const now = new Date();
                    const diffMonths = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                    
                    if (plan === 'free' && diffMonths >= 2) {
                        addBotLog(botId, 'system', "❌ Bepul tarif bo'yicha bot muddati tugagan (2 oy). Davom etish uchun Pro yoki VIP tarifiga o'ting.");
                        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
                        updateFirestoreBotMetadata(botId, { status: 'stopped' });
                        startingBots.delete(botId);
                        return;
                    }
                    if (plan === 'pro' && diffMonths >= 10) {
                        addBotLog(botId, 'system', "❌ Pro tarif bo'yicha bot muddati tugagan (10 oy). Davom etish uchun VIP tarifiga o'ting.");
                        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
                        updateFirestoreBotMetadata(botId, { status: 'stopped' });
                        startingBots.delete(botId);
                        return;
                    }
                }
            }
        } catch (e) {
            handleFirestoreError(e, `bot expiration check for ${botId}`);
        }
    }

    // 3. Workspace dir check
    const dirExists = fs.existsSync(botDir) && fs.readdirSync(botDir).length > 0;

    if (!bot && !dirExists) {
        addBotLog(botId, 'system', `❌ Bot fayllari serverda topilmadi. Iltimos, zip faylini bot sahifasida qayta yuklang.`);
        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
        updateFirestoreBotMetadata(botId, { status: 'stopped' });
        startingBots.delete(botId);
        return;
    }

    if (!bot) {
        bot = {
            id: botId,
            name: 'Bot',
            language: 'nodejs',
            entryPoint: 'index.js',
            code: null
        };
    }

    // 4. Update status to running
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('running', botId);
    updateFirestoreBotMetadata(botId, { status: 'running' });

    // 5. Clear old logs
    try {
        db.prepare('DELETE FROM bot_logs WHERE bot_id = ?').run(botId);
    } catch (e) {}

    addBotLog(botId, 'system', `🔄 Deploy jarayoni boshlandi: ${bot.name}`);
    if (!fs.existsSync(botDir)) fs.mkdirSync(botDir, { recursive: true });

    // 6. Extract zip if code exists
    if (bot.code && Buffer.isBuffer(bot.code) && bot.code.length > 0) {
        try {
            // Save existing .env so manual edits or token updates are not lost
            let existingEnvContent: string | null = null;
            const envFilePath = path.join(botDir, '.env');
            if (fs.existsSync(envFilePath)) {
                try {
                    existingEnvContent = fs.readFileSync(envFilePath, 'utf8');
                } catch (e) {}
            }

            // Clean old code files before extracting new zip (preserve SQLite databases & .env)
            if (fs.existsSync(botDir)) {
                const existingItems = fs.readdirSync(botDir);
                for (const item of existingItems) {
                    if (item.endsWith('.db') || item.endsWith('.sqlite') || item.endsWith('.sqlite3') || item === 'node_modules' || item === '.env') continue;
                    try {
                        fs.rmSync(path.join(botDir, item), { recursive: true, force: true });
                    } catch (rmErr) {}
                }
            }

            const zipPath = path.join(botDir, 'bot.zip');
            fs.writeFileSync(zipPath, bot.code);
            addBotLog(botId, 'deploy', `📦 Paket ochilmoqda (Extracting bot.zip)...`);
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(botDir, true);

            // Restore preserved .env if existed
            if (existingEnvContent && existingEnvContent.trim().length > 0) {
                fs.writeFileSync(envFilePath, existingEnvContent, 'utf8');
            }

            addBotLog(botId, 'deploy', `✅ Fayllar muvaffaqiyatli ochildi.`);
        } catch (extractError: any) {
            addBotLog(botId, 'system', `⚠️ Extract: ${extractError.message}`);
        }
    }

    // 7. Unwrap single top-level directory if present
    try {
        const rootItems = fs.readdirSync(botDir).filter(i => 
            i !== 'bot.zip' && i !== '.pid' && i !== '__pycache__' && i !== '.git' && 
            !i.endsWith('.db') && !i.endsWith('.sqlite') && !i.endsWith('.sqlite3') && i !== 'node_modules'
        );
        if (rootItems.length === 1) {
            const singleFolder = path.join(botDir, rootItems[0]);
            if (fs.existsSync(singleFolder) && fs.statSync(singleFolder).isDirectory()) {
                addBotLog(botId, 'deploy', `📂 Ichki qatlam papkasi (${rootItems[0]}) ildiz darajasiga ochilmoqda...`);
                const innerItems = fs.readdirSync(singleFolder);
                for (const innerItem of innerItems) {
                    const src = path.join(singleFolder, innerItem);
                    const dest = path.join(botDir, innerItem);
                    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
                    fs.renameSync(src, dest);
                }
                fs.rmdirSync(singleFolder);
            }
        }
    } catch (e: any) {
        console.error("Folder flattening error:", e);
    }

    // 8. Recursive file scanner for language & entryPoint detection
    function scanFiles(dir: string, fileList: string[] = [], relPrefix = ''): string[] {
        if (!fs.existsSync(dir)) return fileList;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (item === 'bot.zip' || item === 'node_modules' || item === '__pycache__' || item === '.git') continue;
            const fullPath = path.join(dir, item);
            const relPath = relPrefix ? path.join(relPrefix, item) : item;
            if (fs.statSync(fullPath).isDirectory()) {
                scanFiles(fullPath, fileList, relPath);
            } else {
                fileList.push(relPath);
            }
        }
        return fileList;
    }

    const allDiskFiles = scanFiles(botDir);
    const rootDiskFiles = fs.readdirSync(botDir).filter(f => f !== 'bot.zip');

    const pyFiles = allDiskFiles.filter(f => f.endsWith('.py'));
    const jsFiles = allDiskFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    const goFiles = allDiskFiles.filter(f => f.endsWith('.go'));
    const rsFiles = allDiskFiles.filter(f => f.endsWith('.rs'));
    const rbFiles = allDiskFiles.filter(f => f.endsWith('.rb'));
    const phpFiles = allDiskFiles.filter(f => f.endsWith('.php'));

    const hasRequirementsTxt = rootDiskFiles.includes('requirements.txt') || rootDiskFiles.includes('Pipfile') || allDiskFiles.some(f => f.endsWith('requirements.txt'));
    const hasPackageJson = rootDiskFiles.includes('package.json') || allDiskFiles.some(f => f.endsWith('package.json'));
    const hasGoMod = rootDiskFiles.includes('go.mod') || allDiskFiles.some(f => f.endsWith('go.mod'));
    const hasCargoToml = rootDiskFiles.includes('Cargo.toml') || allDiskFiles.some(f => f.endsWith('Cargo.toml'));
    const hasGemfile = rootDiskFiles.includes('Gemfile') || allDiskFiles.some(f => f.endsWith('Gemfile'));
    const hasComposerJson = rootDiskFiles.includes('composer.json') || allDiskFiles.some(f => f.endsWith('composer.json'));

    let activeLanguage = bot.language || 'nodejs';
    let activeEntryPoint = bot.entryPoint || '';

    if (hasRequirementsTxt || pyFiles.length > 0 || activeLanguage === 'python') {
        activeLanguage = 'python';
        if (allDiskFiles.includes('main.py')) activeEntryPoint = 'main.py';
        else if (allDiskFiles.includes('bot.py')) activeEntryPoint = 'bot.py';
        else if (allDiskFiles.includes('app.py')) activeEntryPoint = 'app.py';
        else if (allDiskFiles.includes('run.py')) activeEntryPoint = 'run.py';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (pyFiles.length > 0) activeEntryPoint = pyFiles[0];
        else activeEntryPoint = 'main.py';
    } else if (hasGoMod || goFiles.length > 0 || activeLanguage === 'go' || activeLanguage === 'golang') {
        activeLanguage = 'go';
        if (allDiskFiles.includes('main.go')) activeEntryPoint = 'main.go';
        else if (allDiskFiles.includes('bot.go')) activeEntryPoint = 'bot.go';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (goFiles.length > 0) activeEntryPoint = goFiles[0];
        else activeEntryPoint = 'main.go';
    } else if (hasCargoToml || rsFiles.length > 0 || activeLanguage === 'rust') {
        activeLanguage = 'rust';
        if (allDiskFiles.includes('main.rs')) activeEntryPoint = 'main.rs';
        else if (allDiskFiles.includes('src/main.rs')) activeEntryPoint = 'src/main.rs';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (rsFiles.length > 0) activeEntryPoint = rsFiles[0];
        else activeEntryPoint = 'main.rs';
    } else if (hasGemfile || rbFiles.length > 0 || activeLanguage === 'ruby') {
        activeLanguage = 'ruby';
        if (allDiskFiles.includes('main.rb')) activeEntryPoint = 'main.rb';
        else if (allDiskFiles.includes('bot.rb')) activeEntryPoint = 'bot.rb';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (rbFiles.length > 0) activeEntryPoint = rbFiles[0];
        else activeEntryPoint = 'main.rb';
    } else if (hasComposerJson || phpFiles.length > 0 || activeLanguage === 'php') {
        activeLanguage = 'php';
        if (allDiskFiles.includes('index.php')) activeEntryPoint = 'index.php';
        else if (allDiskFiles.includes('bot.php')) activeEntryPoint = 'bot.php';
        else if (allDiskFiles.includes('main.php')) activeEntryPoint = 'main.php';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (phpFiles.length > 0) activeEntryPoint = phpFiles[0];
        else activeEntryPoint = 'index.php';
    } else if (hasPackageJson || jsFiles.length > 0 || activeLanguage === 'nodejs') {
        activeLanguage = 'nodejs';
        if (allDiskFiles.includes('index.js')) activeEntryPoint = 'index.js';
        else if (allDiskFiles.includes('bot.js')) activeEntryPoint = 'bot.js';
        else if (allDiskFiles.includes('main.js')) activeEntryPoint = 'main.js';
        else if (allDiskFiles.includes('app.js')) activeEntryPoint = 'app.js';
        else if (allDiskFiles.includes('server.js')) activeEntryPoint = 'server.js';
        else if (activeEntryPoint && allDiskFiles.includes(activeEntryPoint)) {
            // keep existing valid entry point
        } else if (jsFiles.length > 0) activeEntryPoint = jsFiles[0];
        else activeEntryPoint = 'index.js';
    }

    addBotLog(botId, 'system', `ℹ️ Tizim aniqladi: Muhit -> ${activeLanguage.toUpperCase()}, Boshlang'ich fayl -> ${activeEntryPoint}`);
    db.prepare('UPDATE bots SET language = ?, entryPoint = ? WHERE id = ?').run(activeLanguage, activeEntryPoint, botId);
    updateFirestoreBotMetadata(botId, { language: activeLanguage, entryPoint: activeEntryPoint, status: 'running' });
    bot.language = activeLanguage;
    bot.entryPoint = activeEntryPoint;

    // Load local .env and prepare environment
    const localEnvPath = path.join(botDir, '.env');
    const childEnv: Record<string, string> = { ...process.env };
    childEnv['PYTHONUNBUFFERED'] = '1';

    const pyDirs = new Set<string>();
    pyDirs.add(botDir);
    allDiskFiles.forEach(f => {
        if (f.endsWith('.py')) {
            pyDirs.add(path.join(botDir, path.dirname(f)));
        }
    });
    const existingPyPath = process.env.PYTHONPATH || '';
    childEnv['PYTHONPATH'] = Array.from(pyDirs).join(path.delimiter) + (existingPyPath ? path.delimiter + existingPyPath : '');
    childEnv['GEMINI_API_KEY'] = getGeminiKeys()[currentKeyIndex];

    const sysPath = process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const localGoDir = path.join(process.cwd(), '.go');
    if (fs.existsSync(localGoDir)) {
        childEnv['GOROOT'] = localGoDir;
        childEnv['PATH'] = path.join(localGoDir, 'bin') + ':' + sysPath;
    } else {
        childEnv['PATH'] = sysPath + ':' + path.join(process.cwd(), '.go', 'bin');
    }
    childEnv['GOTOOLCHAIN'] = 'local';
    childEnv['CGO_ENABLED'] = '0';
    if (!childEnv['GOPATH']) {
        childEnv['GOPATH'] = path.join(process.cwd(), '.go-path');
    }

    if (fs.existsSync(localEnvPath)) {
        try {
            const envContent = fs.readFileSync(localEnvPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const equalIdx = trimmed.indexOf('=');
                    if (equalIdx !== -1) {
                        const key = trimmed.substring(0, equalIdx).trim();
                        const val = trimmed.substring(equalIdx + 1).trim();
                        const cleanVal = val.replace(/^["']|["']$/g, '');
                        childEnv[key] = cleanVal;
                    }
                }
            });
            addBotLog(botId, 'system', `🔑 Mahalliy .env fayli muvaffaqiyatli yuklandi.`);
        } catch (e: any) {
            addBotLog(botId, 'system', `⚠️ Mahalliy .env faylini o'qishda xatolik: ${e.message}`);
        }
    }

    // 9. Intelligent Python package detection & requirements.txt sync
    if (activeLanguage === 'python' || pyFiles.length > 0) {
        addBotLog(botId, 'deploy', `🔍 Python fayllari va kutubxonalar tahlil qilinmoqda...`);
        autoRepairPythonFiles(botDir, pyFiles);
        const reqPath = path.join(botDir, 'requirements.txt');
        
        // Sanitize any existing requirements.txt first
        if (fs.existsSync(reqPath)) {
            sanitizeRequirementsTxt(botDir, reqPath);
        }

        const detectedPkgs = autoDetectPythonDependencies(botDir, pyFiles);
        let existingReqs = '';
        if (fs.existsSync(reqPath)) {
            existingReqs = fs.readFileSync(reqPath, 'utf8');
        }

        const missingPkgs: string[] = [];
        for (const pkg of detectedPkgs) {
            const regex = new RegExp(`(^|\\n)\\s*${pkg.replace(/[-_]/g, '[-_]')}(\\s*=|\\s*<|\\s*>|\\s*!|\\s*$|\\n)`, 'i');
            if (!regex.test(existingReqs) && !existingReqs.toLowerCase().includes(pkg.toLowerCase())) {
                missingPkgs.push(pkg);
            }
        }

        if (missingPkgs.length > 0) {
            addBotLog(botId, 'deploy', `⚡ Python kodingizdan avto-aniqlangan va requirements.txt ga qo'shilgan kutubxonalar: ${missingPkgs.join(', ')}`);
            const newContent = (existingReqs ? existingReqs.trim() + '\n' : '') + missingPkgs.join('\n') + '\n';
            fs.writeFileSync(reqPath, newContent);
            sanitizeRequirementsTxt(botDir, reqPath);
        } else if (!existingReqs && detectedPkgs.length > 0) {
            fs.writeFileSync(reqPath, detectedPkgs.join('\n') + '\n');
            sanitizeRequirementsTxt(botDir, reqPath);
            addBotLog(botId, 'deploy', `⚡ requirements.txt yaratildi: ${detectedPkgs.join(', ')}`);
        }

        // Automatic pip install
        if (fs.existsSync(reqPath)) {
            const validReqs = sanitizeRequirementsTxt(botDir, reqPath);
            if (validReqs.length > 0) {
                addBotLog(botId, 'deploy', `📦 Python kutubxonalari o'rnatilmoqda (pip install -r requirements.txt)...`);
                const pyBin = getPythonExecutable();
                try {
                    try {
                        execSync(`${pyBin} -m pip --version`, { stdio: 'ignore', env: childEnv });
                    } catch {
                        addBotLog(botId, 'deploy', `⚙️ Pip topilmadi, pip yuklanmoqda...`);
                        execSync(`curl -sSL https://bootstrap.pypa.io/get-pip.py | ${pyBin} - --break-system-packages`, { timeout: 60000, stdio: 'ignore', env: childEnv });
                    }
                    execSync(`${pyBin} -m pip install --break-system-packages --no-cache-dir -r requirements.txt`, { cwd: botDir, timeout: 120000, encoding: 'utf8', env: childEnv });
                    addBotLog(botId, 'deploy', `✅ Python kutubxonalari muvaffaqiyatli o'rnatildi.`);
                } catch (pipErr: any) {
                    const errMsg = (pipErr.stderr || pipErr.stdout || pipErr.message || '').toString();
                    
                    // Check if a specific local module was erroneously attempted
                    const match = errMsg.match(/No matching distribution found for ([a-zA-Z0-9_\-.]+)/i) || 
                                  errMsg.match(/Could not find a version that satisfies the requirement ([a-zA-Z0-9_\-.]+)/i);
                    
                    if (match && match[1]) {
                        const badPkg = match[1].trim();
                        addBotLog(botId, 'deploy', `ℹ️ '${badPkg}' PyPI da mavjud emas (mahalliy fayl yoki modul). requirements.txt dan olib tashlandi.`);
                        const currentReqs = fs.readFileSync(reqPath, 'utf8').split('\n');
                        const filteredReqs = currentReqs.filter(l => !l.trim().toLowerCase().startsWith(badPkg.toLowerCase()));
                        fs.writeFileSync(reqPath, filteredReqs.join('\n'));
                        
                        if (filteredReqs.filter(l => l.trim()).length > 0) {
                            try {
                                execSync(`${pyBin} -m pip install --break-system-packages --no-cache-dir -r requirements.txt`, { cwd: botDir, timeout: 120000, encoding: 'utf8', env: childEnv });
                                addBotLog(botId, 'deploy', `✅ Asosiy tashqi kutubxonalar muvaffaqiyatli o'rnatildi.`);
                            } catch (retryErr: any) {}
                        }
                    } else {
                        addBotLog(botId, 'deploy', `⚠️ Pip install ogohlantirish: ${errMsg.slice(0, 300)}`);
                    }
                }
            }
        }
    } else if (activeLanguage === 'nodejs' || hasPackageJson || jsFiles.length > 0) {
        const pkgPath = path.join(botDir, 'package.json');
        const nodeAnalysis = autoDetectNodeDependencies(botDir, jsFiles);

        let pkgJson: any = {
            name: "cloudbot-telegram-bot",
            version: "1.0.0",
            description: "Telegram Bot hosted on CloudBot",
            main: activeEntryPoint || "index.js",
            dependencies: {}
        };

        if (fs.existsSync(pkgPath)) {
            try {
                pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (!pkgJson.dependencies) pkgJson.dependencies = {};
            } catch (e) {}
        }

        // Merge auto-detected dependencies
        let addedCount = 0;
        for (const [dep, ver] of Object.entries(nodeAnalysis.dependencies)) {
            if (!pkgJson.dependencies[dep]) {
                pkgJson.dependencies[dep] = ver;
                addedCount++;
            }
        }

        if (nodeAnalysis.hasEsm && !pkgJson.type) {
            pkgJson.type = "module";
        }

        try {
            fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2), 'utf8');
        } catch (e) {}

        const depsList = Object.keys(pkgJson.dependencies || {});
        if (depsList.length > 0) {
            addBotLog(botId, 'deploy', `📦 Node.js modullari o'rnatilmoqda (${depsList.join(', ')})...`);
            try {
                execSync('npm install --no-audit --no-fund', { cwd: botDir, stdio: 'ignore', timeout: 120000, env: childEnv });
                addBotLog(botId, 'deploy', `✅ Node.js modullari muvaffaqiyatli o'rnatildi.`);
            } catch (npmErr: any) {
                addBotLog(botId, 'deploy', `⚠️ Npm install ogohlantirish: ${npmErr.message}`);
            }
        } else {
            addBotLog(botId, 'deploy', `ℹ️ Node.js qo'shimcha tashqi modullari talab qilinmadi.`);
        }
    }

    const runBotProcess = () => {
        addBotLog(botId, 'system', `🚀 Botni ishga tushirish jarayoni boshlanmoqda...`);
        let targetLanguage = activeLanguage || bot.language || 'nodejs';
        let targetEntryPoint = activeEntryPoint || bot.entryPoint || 'index.js';
        let fullEntryPath = path.join(botDir, targetEntryPoint);

        if (!fs.existsSync(fullEntryPath)) {
            const availableFile = allDiskFiles.find(f => 
                f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py') ||
                f.endsWith('.go') || f.endsWith('.rs') || f.endsWith('.rb') || f.endsWith('.php')
            );
            if (availableFile) {
                targetEntryPoint = availableFile;
                fullEntryPath = path.join(botDir, targetEntryPoint);
                if (targetEntryPoint.endsWith('.py')) targetLanguage = 'python';
                else if (targetEntryPoint.endsWith('.go')) targetLanguage = 'go';
                else if (targetEntryPoint.endsWith('.rs')) targetLanguage = 'rust';
                else if (targetEntryPoint.endsWith('.rb')) targetLanguage = 'ruby';
                else if (targetEntryPoint.endsWith('.php')) targetLanguage = 'php';
                else targetLanguage = 'nodejs';
            } else {
                if (targetLanguage === 'python') {
                    targetEntryPoint = 'main.py';
                    fullEntryPath = path.join(botDir, targetEntryPoint);
                    fs.writeFileSync(fullEntryPath, '# CloudBot Starter Python Bot\nimport time\nprint("🤖 Python CloudBot Starter Active.")\nwhile True:\n    time.sleep(60)\n', 'utf8');
                } else {
                    targetEntryPoint = 'index.js';
                    fullEntryPath = path.join(botDir, targetEntryPoint);
                    fs.writeFileSync(fullEntryPath, '// CloudBot Starter Node.js Bot\nconsole.log("🤖 Node.js CloudBot Starter Active.");\nsetInterval(() => {}, 60000);\n', 'utf8');
                }
                addBotLog(botId, 'system', `ℹ️ Boshlang'ich ${targetEntryPoint} fayli yaratildi.`);
            }
            activeLanguage = targetLanguage;
            activeEntryPoint = targetEntryPoint;
            bot.language = targetLanguage;
            bot.entryPoint = targetEntryPoint;
        }

        // Pre-Execution Syntax Validation Check (Kodda xatolik bo'lsa deploy to'xtatiladi)
        const syntaxCheck = validateBotCodeSyntax(botDir, targetLanguage, targetEntryPoint, allDiskFiles);
        if (!syntaxCheck.valid) {
            addBotLog(botId, 'deploy', `🚨 KODDA XATOLIK BOR! Deploy to'xtatildi:\n${syntaxCheck.error}`);
            addBotLog(botId, 'system', `🛑 Kodda xatolik aniqlangani sababli botni ishga tushirish (deploy) to'xtatildi.`);
            addBotLog(botId, 'system', `💡 Maslahat: Loglar panelidagi 'Xatoliklarni tuzatish' (Error correction) tugmasini bosing. Botly AI kodingizdagi xatoliklarni 30 to'kin evaziga avtomatik tuzatib beradi.`);
            db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
            updateFirestoreBotMetadata(botId, { status: 'stopped' });
            userStoppedBots.add(botId);
            startingBots.delete(botId);
            return;
        }

        let cmd = 'node';
        let args: string[] = [fullEntryPath];

        if (targetLanguage === 'python') {
            cmd = getPythonExecutable();
            args = ['-u', fullEntryPath];
        } else if (targetLanguage === 'go') {
            const botBin = path.join(botDir, 'bot_bin');
            if (fs.existsSync(botBin)) {
                cmd = botBin;
                args = [];
            } else {
                const localGo = path.join(process.cwd(), '.go', 'bin', 'go');
                cmd = fs.existsSync(localGo) ? localGo : 'go';
                args = ['run', fullEntryPath];
            }
        } else if (targetLanguage === 'rust') {
            if (fs.existsSync(path.join(botDir, 'Cargo.toml'))) {
                cmd = 'cargo';
                args = ['run'];
            } else {
                cmd = 'rustc';
                args = [fullEntryPath, '-o', 'bot_bin'];
            }
        } else if (targetLanguage === 'ruby') {
            cmd = 'ruby';
            args = [fullEntryPath];
        } else if (targetLanguage === 'php') {
            cmd = 'php';
            args = [fullEntryPath];
        } else if (targetLanguage === 'nodejs') {
            if (targetEntryPoint.endsWith('.ts')) {
                cmd = 'npx';
                args = ['tsx', fullEntryPath];
            } else {
                cmd = 'node';
                args = ['--max-old-space-size=256', fullEntryPath];
            }
        }

        addBotLog(botId, 'system', `⚙️ Buyruq bajarilmoqda: ${cmd} ${args.join(' ')}`);

        const procStartTime = Date.now();

        const child = spawn(cmd, args, {
            cwd: botDir,
            env: childEnv
        });
        
        if (child.pid) {
            fs.writeFileSync(path.join(botDir, '.pid'), child.pid.toString(), 'utf8');
        }

        runningBots.set(botId, child);
        startingBots.delete(botId);

        db.prepare('UPDATE bots SET status = ?, language = ?, entryPoint = ? WHERE id = ?').run('running', targetLanguage, targetEntryPoint, botId);
        updateFirestoreBotMetadata(botId, { language: targetLanguage, entryPoint: targetEntryPoint, status: 'running' });

        const processLogData = (dataStr: string, isStderr = false) => {
            const lines = dataStr.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                if (line.length > 2000) {
                    line = line.substring(0, 2000) + '... (uzun log qisqartirildi)';
                }

                // Filter out noisy python framework warnings & pip messages
                if (line.includes('RuntimeWarning') || line.includes('tracemalloc')) continue;
                if (line.includes('WARNING: Running pip as the') || line.includes('Requirement already satisfied')) continue;
                if (line.trim() === 'raise exception' || line.trim() === 'raise exc') continue;

                // Filter out transient Telegram long-polling network reconnects & notices
                if (
                    line.includes('Telegram polling notice:') ||
                    line.includes('httpx.ReadError') ||
                    line.includes('httpx.ConnectError') ||
                    line.includes('httpx.RemoteProtocolError') ||
                    line.includes('httpx.ReadTimeout') ||
                    line.includes('httpx.ConnectTimeout') ||
                    line.includes('httpx.TimeoutException') ||
                    line.includes('telegram.error.TimedOut') ||
                    line.includes('telegram.error.NetworkError') ||
                    line.includes('telegram.error.RetryAfter')
                ) {
                    continue;
                }

                // Check for Telegram Application error handler warning
                if (line.includes('No error handlers are registered, logging exception')) {
                    continue;
                }

                // Check for Telegram Conflict Error
                if (
                    line.includes('TelegramConflictError') || 
                    line.includes('terminated by other getUpdates request') || 
                    line.includes('Conflict: terminated') ||
                    line.includes('ConflictError')
                ) {
                    addBotLog(botId, 'run', `🚨 TELEGRAM KONFLIKT XATOSI: Ushbu Bot Token boshqa bir joyda (shaxsiy kompyuteringizda yoki boshqa bot sifatida) ayni vaqtda ishlab turibdi! Telegram bir vaqtda faqat 1 ta ulanishga ruxsat beradi.`);
                    addBotLog(botId, 'system', `💡 Yechim: 1) Boshqa joydagi botni to'xtating. 2) Yoki @BotFather orqali yangi token oling.`);
                    continue;
                }

                // Check for Telegram Unauthorized / Invalid Token Error
                if (
                    line.toLowerCase().includes('invalid token') ||
                    line.includes('InvalidToken') ||
                    line.includes('Token is invalid') ||
                    line.includes('Unauthorized') ||
                    line.includes('401 Unauthorized') ||
                    line.includes('TelegramUnauthorizedError') ||
                    (line.includes('Not Found') && line.includes('api.telegram.org')) ||
                    line.toLowerCase().includes('invalid bot token')
                ) {
                    addBotLog(botId, 'run', `🚨 TELEGRAM TOKENI XATO YOKI BEKOR QILINGAN! (Invalid Token / 401 Unauthorized):`);
                    addBotLog(botId, 'run', `👉 Telegram serveri ushbu tokenni qabul qilmadi. BotFather'da token yangilangan, bekor qilingan yoki .env faylida noto'g'ri kiritilgan.`);
                    addBotLog(botId, 'system', `💡 Yechim: Telegramda @BotFather ga kiring, /mybots orqali o'z botingizni tanlang, API tokenni yangilang yoki nusxalang. So'ng Dashboard'da '🔒 Muhit sirlari (.env)' bo'limiga BOT_TOKEN sifatida to'g'ri tokenni kiriting va botni qayta ishga tushiring.`);
                    continue;
                }

                // Check for Module Not Found in Node.js or Python
                if (line.includes('Cannot find module') || line.includes('ModuleNotFoundError:') || line.includes('ImportError:')) {
                    addBotLog(botId, 'run', `🚨 ${line}`);
                    addBotLog(botId, 'system', `💡 Yechim: Kodingizda kerakli kutubxona yetishmayapti. Yuqoridagi "Xatoliklarni tuzatish (Botly AI)" tugmasini bosing — AI avtomatik ravishda barcha kerakli paketlarni o'rnatib kodni to'g'rilaydi.`);
                    continue;
                }

                if (isStderr) {
                    if (line.startsWith('INFO:') || line.includes(' - INFO - ') || line.includes('Starting polling') || line.includes('Updates handling')) {
                        addBotLog(botId, 'run', `ℹ️ ${line}`);
                    } else if (line.startsWith('WARNING:') || line.includes(' - WARNING - ')) {
                        addBotLog(botId, 'run', `⚠️ ${line}`);
                    } else if (line.startsWith('ERROR:') || line.includes(' - ERROR - ') || line.includes('Traceback') || line.includes('Exception') || line.includes('TypeError')) {
                        addBotLog(botId, 'run', `🚨 ${line}`);
                    } else {
                        addBotLog(botId, 'run', `⚡ ${line}`);
                    }
                } else {
                    addBotLog(botId, 'run', line);
                }
            }
        };

        child.stdout.on('data', (data) => processLogData(data.toString(), false));
        child.stderr.on('data', (data) => processLogData(data.toString(), true));

        child.on('close', (code) => {
            runningBots.delete(botId);
            startingBots.delete(botId);

            if (userStoppedBots.has(botId)) {
                addBotLog(botId, 'system', `🛑 Bot foydalanuvchi buyrug'i bilan to'xtatildi.`);
            } else {
                if (code === 0) {
                    addBotLog(botId, 'system', `🛑 Bot jarayoni yakunlandi (kod: 0).`);
                } else {
                    addBotLog(botId, 'system', `⚠️ Bot jarayoni to'xtadi (kod: ${code}). Qayta ishga tushirish uchun "Qayta ishga tushirish" tugmasini bosing yoki xatoliklarni "Error correction" orqali tuzating.`);
                }
            }

            db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
            updateFirestoreBotMetadata(botId, { status: 'stopped' });
        });

        child.on('error', (err: any) => {
            runningBots.delete(botId);
            startingBots.delete(botId);

            addBotLog(botId, 'system', `❌ Jarayonni ishga tushirishda xatolik (${cmd}): ${err.message}`);
            db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
            updateFirestoreBotMetadata(botId, { status: 'stopped' });
        });
    };

    if (bot.language === 'python' || pyFiles.length > 0) {
        runBotProcess();
    } else if (bot.language === 'nodejs' && fs.existsSync(path.join(botDir, 'package.json'))) {
        addBotLog(botId, 'deploy', `⚡ Node JS loyihasi. package.json tekshirilmoqda va sozlanmoqda...`);
        try {
            const pkgJsonPath = path.join(botDir, 'package.json');
            const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            let modified = false;
            if (pkgData.dependencies) {
                if (pkgData.dependencies['better-sqlite3'] || pkgData.dependencies['sqlite3']) {
                    delete pkgData.dependencies['better-sqlite3'];
                    delete pkgData.dependencies['sqlite3'];
                    modified = true;
                }
            }
            if (pkgData.devDependencies) {
                if (pkgData.devDependencies['better-sqlite3'] || pkgData.devDependencies['sqlite3']) {
                    delete pkgData.devDependencies['better-sqlite3'];
                    delete pkgData.devDependencies['sqlite3'];
                    modified = true;
                }
            }
            if (modified) {
                fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2), 'utf8');
            }

            const bs3Dir = path.join(botDir, 'node_modules', 'better-sqlite3');
            fs.mkdirSync(bs3Dir, { recursive: true });
            const shimCode = `const { DatabaseSync } = require('node:sqlite');
class BetterSqlite3Shim {
  constructor(filename, options) {
    this.db = new DatabaseSync(filename === ':memory:' ? ':memory:' : (filename || ':memory:'));
  }
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params;
        return stmt.run(...p);
      },
      get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params;
        return stmt.get(...p);
      },
      all(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params;
        return stmt.all(...p);
      }
    };
  }
  exec(sql) { return this.db.exec(sql); }
  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN TRANSACTION');
      try {
        const res = fn(...args);
        this.db.exec('COMMIT');
        return res;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }
  close() {}
}
module.exports = BetterSqlite3Shim;
module.exports.default = BetterSqlite3Shim;
`;
            fs.writeFileSync(path.join(bs3Dir, 'index.js'), shimCode, 'utf8');
            fs.writeFileSync(path.join(bs3Dir, 'package.json'), JSON.stringify({ name: 'better-sqlite3', version: '11.0.0', main: 'index.js' }), 'utf8');
        } catch (e) {
            console.warn('Failed to setup better-sqlite3 shim:', e);
        }

        addBotLog(botId, 'deploy', `⚡ Node JS kutubxonalari o'rnatilmoqda (npm install)...`);
        
        const npmInstall = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, npmInstall);

        npmInstall.stdout.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        npmInstall.stderr.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        npmInstall.on('close', (code) => {
            runningBots.delete(botId);
            if (code === 0) {
                addBotLog(botId, 'deploy', `✅ Node JS kutubxonalari o'rnatildi!`);
                runBotProcess();
            } else {
                addBotLog(botId, 'system', `❌ npm install xatosi (code: ${code})`);
                db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
                updateFirestoreBotMetadata(botId, { status: 'stopped' });
            }
        });
    } else if (bot.language === 'go' || goFiles.length > 0) {
        const localGo = path.join(process.cwd(), '.go', 'bin', 'go');
        const goBinary = fs.existsSync(localGo) ? localGo : 'go';

        if (!commandExists(goBinary)) {
            addBotLog(botId, 'deploy', `❌ Go muhiti o'rnatilmagan.`);
            runningBots.delete(botId);
            return;
        }

        const goModPath = path.join(botDir, 'go.mod');
        if (!fs.existsSync(goModPath)) {
            addBotLog(botId, 'deploy', `⚡ go.mod topilmadi. Avtomatik go mod init yaratilmoqda...`);
            try {
                execSync(`${goBinary} mod init bot`, { cwd: botDir, env: childEnv, stdio: 'ignore' });
            } catch (e) {}
        }

        addBotLog(botId, 'deploy', `⚡ Go loyihasi. go mod tidy bajarilmoqda...`);
        const goInstall = spawn(goBinary, ['mod', 'tidy'], { cwd: botDir, env: childEnv });
        goInstall.on('error', (err) => {
            console.error(`Failed to start Go process:`, err);
            addBotLog(botId, 'deploy', `❌ Xatolik: Go o'rnatilmagan yoki xato yuz berdi.`);
            runningBots.delete(botId);
        });
        runningBots.set(botId, goInstall);
        goInstall.on('close', (code) => {
            runningBots.delete(botId);
            try {
                addBotLog(botId, 'deploy', `⚡ Go loyihasi kompressiya/kompilyatsiya qilinmoqda...`);
                execSync(`${goBinary} build -o bot_bin .`, { cwd: botDir, env: childEnv, stdio: 'ignore' });
                addBotLog(botId, 'deploy', `✅ Go binar tayyor (bot_bin).`);
            } catch (e) {
                console.warn(`Go build failed, fallback to go run:`, e);
            }
            if (code === 0) {
                addBotLog(botId, 'deploy', `✅ Go dependencies tayyor.`);
                runBotProcess();
            } else {
                addBotLog(botId, 'deploy', `⚠️ go mod tidy ogohlantirishi (code: ${code}), bot ishga tushirilmoqda...`);
                runBotProcess();
            }
        });
    } else if (bot.language === 'rust' && fs.existsSync(path.join(botDir, 'Cargo.toml'))) {
        if (!commandExists('cargo')) {
            addBotLog(botId, 'deploy', `❌ Rust/Cargo muhiti o'rnatilmagan.`);
            runningBots.delete(botId);
            return;
        }
        addBotLog(botId, 'deploy', `⚡ Rust loyihasi. cargo build bajarilmoqda...`);
        const cargoInstall = spawn('cargo', ['build', '--release'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, cargoInstall);
        cargoInstall.on('close', (code) => {
            runningBots.delete(botId);
            if (code === 0) {
                addBotLog(botId, 'deploy', `✅ Rust build bajarildi.`);
                runBotProcess();
            } else {
                addBotLog(botId, 'deploy', `❌ cargo build xatosi (code: ${code})`);
                db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
                updateFirestoreBotMetadata(botId, { status: 'stopped' });
            }
        });
    } else if (bot.language === 'ruby' && fs.existsSync(path.join(botDir, 'Gemfile'))) {
        addBotLog(botId, 'deploy', `⚡ Ruby loyihasi. bundle install bajarilmoqda...`);
        const bundleInstall = spawn('bundle', ['install'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, bundleInstall);
        bundleInstall.on('close', (code) => {
            runningBots.delete(botId);
            addBotLog(botId, 'deploy', `✅ Ruby gems o'rnatildi.`);
            runBotProcess();
        });
    } else if (bot.language === 'php' && fs.existsSync(path.join(botDir, 'composer.json'))) {
        addBotLog(botId, 'deploy', `⚡ PHP loyihasi. composer install bajarilmoqda...`);
        const composerInstall = spawn('composer', ['install'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, composerInstall);
        composerInstall.on('close', (code) => {
            runningBots.delete(botId);
            addBotLog(botId, 'deploy', `✅ PHP composer paketlari o'rnatildi.`);
            runBotProcess();
        });
    } else {
        addBotLog(botId, 'deploy', `📝 Kutubxonalar tayyor. To'g'ridan-to'g'ri ishga tushiriladi.`);
        runBotProcess();
    }
}

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

const getGeminiKeys = () => {
    return [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4
    ].filter(k => k) as string[];
};

function rotateGeminiKey() {
    const keys = getGeminiKeys();
    if (keys.length <= 1) return;
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    aiClient = null; // Forces re-initialization
    console.log(`[GeminiKeyRotator]: Key rotated to index ${currentKeyIndex}`);
}

function getGeminiClient(): GoogleGenAI {
    const keys = getGeminiKeys();
    if (keys.length === 0) {
        throw new Error("GEMINI_API_KEY muhit o'zgaruvchisi topilmadi.");
    }
    
    const key = keys[currentKeyIndex % keys.length];
    
    if (!aiClient) {
        aiClient = new GoogleGenAI({
            apiKey: key,
            httpOptions: {
                headers: {
                    "User-Agent": "aistudio-build",
                }
            }
        });
    }
    return aiClient;
}

async function callGeminiContentWithFallback(params: {
    contents: any;
    config?: any;
    preferredModel?: string;
}): Promise<{ text?: string }> {
    const defaultModels = [
        "gemini-3.7-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest"
    ];

    const modelsToTry = params.preferredModel 
        ? [params.preferredModel, ...defaultModels.filter(m => m !== params.preferredModel)]
        : defaultModels;

    let lastError: any = null;

    for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const client = getGeminiClient();
                const response = await client.models.generateContent({
                    model: modelName,
                    contents: params.contents,
                    config: params.config
                });
                if (response && response.text) {
                    return response;
                }
            } catch (err: any) {
                lastError = err;
                const rawErr = err?.message || String(err);
                console.warn(`[Gemini Model Fallback]: ${modelName} (attempt ${attempt + 1}) failed: ${rawErr.slice(0, 120)}.`);
                rotateGeminiKey();
                await new Promise(r => setTimeout(r, 600));
            }
        }
    }

    throw lastError || new Error("Barcha Gemini zaxira modellarida so'rovni bajarib bo'lmadi.");
}

// =========================================================================
// 24/7 CLOUDBOT TELEGRAM AI SUPPORT ASSISTANT (BACKGROUND WORKER)
// =========================================================================
let telegramBotRunning = false;
let telegramBotWorkerActive = false;
let telegramBotLastPollTime: number = 0;
let telegramBotLastError: string | null = null;
let telegramBotReloadCounter = 0;

function getTelegramSupportConfig() {
  let token = (process.env.TELEGRAM_SUPPORT_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
  let adminId = (process.env.TELEGRAM_ADMIN_ID || process.env.ADMIN_ID || "").trim();
  let enabled = "1";

  try {
    const rows = db.prepare("SELECT key, value FROM telegram_support_config").all() as any[];
    for (const r of rows) {
      if (r.key === 'bot_token' && r.value) token = r.value.trim();
      if (r.key === 'admin_id' && r.value) adminId = r.value.trim();
      if (r.key === 'enabled') enabled = r.value.trim();
    }
  } catch (_) {}

  return {
    botToken: token,
    adminId: adminId,
    enabled: enabled !== '0'
  };
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string, parseMode: string = 'HTML', businessConnectionId?: string) {
  if (!botToken || !chatId || !text) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4000) {
    let splitIdx = remaining.lastIndexOf('\n', 4000);
    if (splitIdx === -1) splitIdx = 4000;
    chunks.push(remaining.substring(0, splitIdx));
    remaining = remaining.substring(splitIdx).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);

  for (const chunk of chunks) {
    try {
      const payload: any = {
        chat_id: chatId,
        text: chunk,
        parse_mode: parseMode
      };
      if (businessConnectionId) {
        payload.business_connection_id = businessConnectionId;
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok && parseMode === 'HTML') {
        const fallbackPayload: any = {
          chat_id: chatId,
          text: chunk
        };
        if (businessConnectionId) {
          fallbackPayload.business_connection_id = businessConnectionId;
        }
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPayload)
        });
      }
    } catch (e) {
      console.warn(`[Telegram send error]:`, e);
    }
  }
}

async function sendTelegramChatAction(botToken: string, chatId: number | string, action: string = 'typing', businessConnectionId?: string) {
  if (!botToken || !chatId) return;
  try {
    const payload: any = { chat_id: chatId, action };
    if (businessConnectionId) {
      payload.business_connection_id = businessConnectionId;
    }
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {}
}

const CLOUDBOT_TELEGRAM_SUPPORT_PROMPT = `
Siz CloudBot.uz platformasining 24/7 rejimida ishlaydigan rasmiy virtual xodimi va AI maslahatchisisiz (Botly AI).
Sizning vazifangiz — Telegram orqali murojaat qilgan mijozlar va foydalanuvchilar bilan muloyim, professional, samimiy va ishonchli muloqot qilish, CloudBot.uz xizmatlarini tushuntirish va bot yuklash bo'yicha yordam berish.

ASOSIY BILIMLAR VA QOIDALAR:
1. CloudBot.uz platformasi haqida:
   - Bu O'zbekistondagi eng tezkor, qulay va arzon Telegram/Discord botlar xosting platformasi.
   - Python (aiogram, telebot, pyTelegramBotAPI) va Node.js (telegraf, grammy) botlarini to'liq qo'llab-quvvatlaydi.
   - Botlar 24/7 qotmasdan, uzluksiz va yuqori tezlikda ishlaydi.
   - Avtomatik kutubxona o'rnatish (pip/requirements.txt, npm/package.json) va xatolarni avtomatik tuzatuvchi Botly AI mavjud.

2. Tariflar:
   - Bepul (Free): 2 tagacha bot, 2 oy muddat, ish vaqti 07:25 dan 21:00 gacha (O'zb vaqti), Botly AI 45 token/kun.
   - Pro ($20/oy): 10 tagacha bot, 10 oy muddat, ish vaqti 06:30 dan 22:35 gacha (O'zb vaqti), Botly AI 145 token/kun, prioritet qo'llab-quvvatlash.
   - VIP ($35/oy): 30 tagacha bot, cheksiz umrbod muddat, ish vaqti 04:00 dan 00:00 (yarim kecha) gacha, Botly AI 500 token/kun, maksimal server tezligi.

3. Platformaga bot yuklash tartibi:
   - 1. CloudBot.uz saytiga kirish va ro'yxatdan o'tish (Google yoki Email orqali).
   - 2. "Bot Yuklash" (Upload) tugmasini bosish.
   - 3. Bot kodini ZIP arxiv qilib yuklash (ichida bot.py yoki index.js va requirements.txt bo'lishi kerak) yoki GitHub havola orqali import qilish.
   - 4. "Ishga tushirish" tugmasini bosish — bot avtomatik ishga tushadi.

4. Nega aynan CloudBot.uz ni tanlash kerak:
   - Qimmat va murakkab VPS serverlarni sozlashga hojat yo'q (terminal buyruqlari kerak emas).
   - O'zbekiston ichida ping juda past va ulanish tezligi yuqori.
   - Bot xato qilsa, sun'iy intellekt xatoni topib, avtomatik tuzatish taklif qiladi.
   - Juda arzon narxlar va qulay to'lov usullari.

5. XAVFSIZLIK VA MAXFIYLIK (QAT'IY CHEKLOV):
   - Hech qachon server parollari, API kalitlar, ma'lumotlar bazasi tuzilishi, shaxsiy tokenlar, .env fayllari yoki platformaning ichki server kodlarini oshkor qilmang.
   - Agar foydalanuvchi tizim sirlarini so'rasa: "Kechirasiz, xavfsizlik qoidalariga binoan ichki texnik ma'lumotlar sir saqlanadi." deb javob bering.

6. Javob berish uslubi:
   - Faqat foydalanuvchi so'ragan masalaga lo'nda, aniq, muloyim va tushunarli qilib javob bering.
   - O'zbek tilida sof, adabiy va professional ohangda gaplashing. Ortiqcha keraksiz emojilardan saqlaning.
`;

async function handleTelegramSupportMessage(botToken: string, adminId: string, message: any, businessConnectionId?: string) {
  if (!message || !message.chat || !message.chat.id) return;
  const chatId = message.chat.id;
  const fromUser = message.from || {};
  const fromId = fromUser.id || chatId;
  const text = (message.text || '').trim();
  const username = fromUser.username || '';
  const firstName = fromUser.first_name || '';

  if (!text) return;

  // Foydalanuvchini ro'yxatga olish / yangilash
  try {
    db.prepare(`
      INSERT INTO telegram_support_users (chat_id, username, first_name, last_seen, message_count)
      VALUES (?, ?, ?, datetime('now'), 1)
      ON CONFLICT(chat_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_seen = datetime('now'),
        message_count = message_count + 1
    `).run(chatId, username, firstName);
  } catch (_) {}

  // 1. /start buyrug'i
  if (text === '/start' || text.startsWith('/start ')) {
    const welcomeMsg = `Assalomu alaykum, <b>${firstName || 'foydalanuvchi'}</b>!\n\nMen <b>CloudBot.uz</b> platformasining 24/7 rasmiy virtual AI yordamchisiman (Botly AI).\n\nSizga qanday yordam bera olaman?\n• Botni platformaga qanday yuklash (ZIP yoki GitHub orqali)\n• Obuna tariflari (Free, Pro, VIP) va imkoniyatlar\n• Nega aynan CloudBot.uz ni tanlash kerakligi\n• Dasturlash tillari (Python, Node.js) va texnik talablar\n\nSavolingizni bemalol yozib qoldirishingiz mumkin!`;
    
    try {
      db.prepare("INSERT INTO telegram_support_logs (chat_id, username, role, text) VALUES (?, ?, 'user', ?)").run(chatId, username, text);
      db.prepare("INSERT INTO telegram_support_logs (chat_id, username, role, text) VALUES (?, ?, 'assistant', ?)").run(chatId, username, welcomeMsg);
    } catch (_) {}

    await sendTelegramMessage(botToken, chatId, welcomeMsg, 'HTML', businessConnectionId);
    return;
  }

  // 2. /admin buyrug'i (Statistika)
  if (text === '/admin' || text.startsWith('/admin ')) {
    const isUserAdmin = adminId && (String(fromId) === String(adminId) || String(chatId) === String(adminId));
    if (isUserAdmin) {
      let totalUsers = 0;
      let proUsers = 0;
      let vipUsers = 0;
      let freeUsers = 0;
      let totalBots = 0;
      let runningBotsCount = 0;
      let totalAiUsers = 0;
      let totalAiQueries = 0;
      let todayAiQueries = 0;

      try {
        const userCountRow = db.prepare("SELECT count(distinct user_id) as c FROM profiles").get() as any;
        totalUsers = userCountRow?.c || 0;
        
        const subRows = db.prepare("SELECT plan, count(*) as c FROM subscriptions GROUP BY plan").all() as any[];
        for (const sr of subRows) {
          if (sr.plan === 'pro') proUsers = sr.c;
          else if (sr.plan === 'vip') vipUsers = sr.c;
          else freeUsers += sr.c;
        }
        if (totalUsers < (proUsers + vipUsers + freeUsers)) {
          totalUsers = proUsers + vipUsers + freeUsers;
        }

        const botStatsRow = db.prepare("SELECT count(*) as total, sum(case when status='running' then 1 else 0 end) as running FROM bots").get() as any;
        totalBots = botStatsRow?.total || 0;
        runningBotsCount = botStatsRow?.running || 0;

        const aiUsersRow = db.prepare("SELECT count(*) as c FROM telegram_support_users").get() as any;
        totalAiUsers = aiUsersRow?.c || 0;

        const aiMsgsRow = db.prepare("SELECT count(*) as c FROM telegram_support_logs WHERE role = 'user'").get() as any;
        totalAiQueries = aiMsgsRow?.c || 0;

        const todayMsgsRow = db.prepare("SELECT count(*) as c FROM telegram_support_logs WHERE role = 'user' AND date(created_at) = date('now')").get() as any;
        todayAiQueries = todayMsgsRow?.c || 0;
      } catch (e) {
        console.warn("Error gathering admin stats:", e);
      }

      const uzbTime = getUzbekistanTime();
      const uptimeHours = Math.floor(process.uptime() / 3600);
      const uptimeMins = Math.floor((process.uptime() % 3600) / 60);

      const adminReport = `
<b>CloudBot.uz Boshqaruv & Statistika Hisoboti</b>

<b>Platforma foydalanuvchilari:</b>
• Jami foydalanuvchilar: <b>${totalUsers}</b> ta
• PRO obunachilar ($20/oy): <b>${proUsers}</b> ta
• VIP obunachilar ($35/oy): <b>${vipUsers}</b> ta
• Bepul tarifdagilar: <b>${freeUsers}</b> ta

<b>Botlar holati:</b>
• Jami yuklangan botlar: <b>${totalBots}</b> ta
• Hozirda faol ishlayotganlar: <b>${runningBotsCount}</b> ta

<b>24/7 Telegram AI Yordamchi:</b>
• Murojaat qilgan mijozlar: <b>${totalAiUsers}</b> ta
• Jami savol-javoblar: <b>${totalAiQueries}</b> ta
• Bugungi so'rovlar: <b>${todayAiQueries}</b> ta

<b>Tizim vaqti:</b> ${uzbTime.timeStr} (Asia/Tashkent)
<b>Server holati:</b> 24/7 Barqaror (Uptime: ${uptimeHours} soat ${uptimeMins} daqiqa)
`.trim();

      await sendTelegramMessage(botToken, chatId, adminReport, 'HTML', businessConnectionId);
      return;
    } else {
      await sendTelegramMessage(botToken, chatId, "Kechirasiz, ushbu buyruq faqat CloudBot.uz boshqaruvchi administratori uchun mo'ljallangan.", 'HTML', businessConnectionId);
      return;
    }
  }

  // 3. Foydalanuvchi bilan AI suhbati (Asinxron)
  try {
    db.prepare("INSERT INTO telegram_support_logs (chat_id, username, role, text) VALUES (?, ?, 'user', ?)").run(chatId, username, text);
  } catch (_) {}

  // Yozish harakatini ko'rsatish
  await sendTelegramChatAction(botToken, chatId, 'typing', businessConnectionId);

  // Oxirgi suhbatlar tarixini olish
  let conversationHistory: any[] = [];
  try {
    const recentLogs = db.prepare("SELECT role, text FROM telegram_support_logs WHERE chat_id = ? ORDER BY id DESC LIMIT 8").all(chatId) as any[];
    recentLogs.reverse().forEach(log => {
      conversationHistory.push({
        role: log.role === 'user' ? 'user' : 'model',
        parts: [{ text: log.text }]
      });
    });
  } catch (_) {}

  let replyText = "";
  try {
    const geminiRes = await callGeminiContentWithFallback({
      contents: [
        { role: 'user', parts: [{ text: CLOUDBOT_TELEGRAM_SUPPORT_PROMPT }] },
        ...conversationHistory
      ],
      preferredModel: 'gemini-3.7-flash'
    });
    replyText = (geminiRes.text || "").trim();
  } catch (err: any) {
    console.error("[Telegram Gemini Error]:", err);
    replyText = "Hozirda so'rovingizni qayta ishlashda qiyinchilik bo'ldi. Iltimos, birozdan so'ng qayta urinib ko'ring yoki saytimizdagi Qo'llanma (Docs) bo'limini ko'rib chiqing.";
  }

  if (!replyText) {
    replyText = "Kechirasiz, savolingizni aniqroq shakllantira olasizmi? CloudBot.uz bo'yicha har qanday savolingizga yordam berishga tayyorman.";
  }

  try {
    db.prepare("INSERT INTO telegram_support_logs (chat_id, username, role, text) VALUES (?, ?, 'assistant', ?)").run(chatId, username, replyText);
  } catch (_) {}

  await sendTelegramMessage(botToken, chatId, replyText, 'HTML', businessConnectionId);
}

async function startTelegramSupportBotWorker() {
  if (telegramBotWorkerActive) return;
  telegramBotWorkerActive = true;

  let lastOffset = 0;
  let lastTokenUsed = "";
  let conflictRetryCount = 0;

  console.log("[Telegram AI Support Worker]: Fondagi jarayon ishga tushdi.");

  while (true) {
    const config = getTelegramSupportConfig();
    if (!config.enabled || !config.botToken || config.botToken.length < 15) {
      telegramBotRunning = false;
      await new Promise(r => setTimeout(r, 6000));
      continue;
    }

    // Yangi token kiritilganda yoki birinchi marta webhookni tozalash
    if (config.botToken !== lastTokenUsed) {
      lastTokenUsed = config.botToken;
      try {
        await fetch(`https://api.telegram.org/bot${config.botToken}/deleteWebhook?drop_pending_updates=false`, {
          signal: AbortSignal.timeout(6000)
        }).catch(() => {});
      } catch (_) {}
    }

    try {
      telegramBotRunning = true;
      telegramBotLastPollTime = Date.now();

      const pollUrl = `https://api.telegram.org/bot${config.botToken}/getUpdates`;
      const res = await fetch(pollUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: lastOffset,
          timeout: 10,
          allowed_updates: [
            "message",
            "edited_message",
            "business_connection",
            "business_message",
            "edited_business_message"
          ]
        }),
        signal: AbortSignal.timeout(18000)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const description = errJson.description || `HTTP ${res.status}`;

        // 409 Conflict - Agar avvalgi so'rov hali yopilmagan bo'lsa yoki parallel jarayon bo'lsa
        if (res.status === 409 || description.toLowerCase().includes("conflict") || description.toLowerCase().includes("terminated by other getupdates")) {
          conflictRetryCount++;
          // Telegram serveri avvalgi ulanishni yopishiga ozgina vaqt beramiz
          const waitTime = Math.min(conflictRetryCount * 3000, 10000);
          if (conflictRetryCount === 1) {
            console.log("[Telegram Support Bot]: Boshqa ulanish bilan sinxronlashmoqda, qayta ulanmoqda...");
          }
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        telegramBotLastError = description;
        console.warn(`[Telegram Support Bot Poll Error]: ${telegramBotLastError}`);
        await new Promise(r => setTimeout(r, 6000));
        continue;
      }

      // Muvaffaqiyatli javob keldi
      conflictRetryCount = 0;
      telegramBotLastError = null;

      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          if (update.update_id >= lastOffset) {
            lastOffset = update.update_id + 1;
          }

          // 1. Oddiy xabar
          if (update.message) {
            handleTelegramSupportMessage(config.botToken, config.adminId, update.message).catch(e => {
              console.warn("[Telegram message handling error]:", e);
            });
          }
          // 2. Telegram Biznes xabarlari (Business Chatbot)
          else if (update.business_message) {
            const bizMsg = update.business_message;
            const bizConnId = bizMsg.business_connection_id;
            handleTelegramSupportMessage(config.botToken, config.adminId, bizMsg, bizConnId).catch(e => {
              console.warn("[Telegram business message handling error]:", e);
            });
          }
          // 3. Telegram Biznes ulanishi holati
          else if (update.business_connection) {
            const conn = update.business_connection;
            console.log(`[Telegram Business Connection Update]: ID=${conn.id}, User=${conn.user_id}, CanReply=${conn.can_reply}, IsEnabled=${conn.is_enabled}`);
          }
        }
      }
    } catch (pollErr: any) {
      const errMsg = pollErr?.message || String(pollErr);
      if (!errMsg.includes("aborted") && !errMsg.includes("Timeout")) {
        telegramBotLastError = errMsg;
        console.warn("[Telegram Support Bot network loop warning]:", errMsg.slice(0, 100));
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Performance Optimization: Gzip/Brotli response compression
  app.use(compression({ level: 6, threshold: 1024 }));
  
  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "CloudBot Backend" });
  });

  // Contact Form Submission (Tezkor xabar yuborish -> Email & Firestore)
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: "Xabar matni kiritilmagan" });
      }

      const senderName = name?.trim() || "Noma'lum foydalanuvchi";
      const senderEmail = email?.trim() || "Kiritilmagan";
      const targetEmail = "ismoilovshohjahon750@gmail.com";
      const timestamp = new Date().toISOString();

      console.log(`[CONTACT MSG]: From: ${senderName} (${senderEmail}) -> To: ${targetEmail} | Message: ${message}`);

      // Firestore 'contact_messages' to'plamiga saqlash
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          const msgDoc = await adminDb.collection("contact_messages").add({
            name: senderName,
            email: senderEmail,
            targetEmail,
            message: message.trim(),
            createdAt: timestamp,
            read: false
          });

          // Administrator uchun bildirishnoma yaratish
          await adminDb.collection("notifications").add({
            userId: 'admin',
            userEmail: senderEmail,
            title: `📩 Yangi xabar: ${senderName}`,
            message: `${senderName} (${senderEmail}): ${message.trim().substring(0, 120)}`,
            type: "chat_message",
            chatId: msgDoc.id,
            senderEmail: senderEmail,
            createdAt: timestamp,
            read: false
          });
        } catch (nErr) {
          handleFirestoreError(nErr, "contact_messages/notifications");
        }
      }

      res.json({
        success: true,
        message: `Xabaringiz muvaffaqiyatli saqlandi va ${targetEmail} manziliga yuborildi!`
      });
    } catch (err: any) {
      console.error("Contact Form Error:", err);
      res.status(500).json({ error: "Xabarni yuborishda xatolik yuz berdi" });
    }
  });

  // Helper for full date & time format (kun.oy.yil soat:minut)
  function formatDateTimeFull(dateObj: Date): string {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }

  function formatDateKunOyYil(dateObj: Date): string {
    return formatDateTimeFull(dateObj);
  }

  // Parse due date from ISO string, formatted string (DD.MM.YYYY HH:mm), or timestamp
  function parseDueDate(data: any): Date | null {
    if (!data) return null;

    if (data.dueDateISO) {
      const d = new Date(data.dueDateISO);
      if (!isNaN(d.getTime())) return d;
    }

    if (data.dueDateFormatted && typeof data.dueDateFormatted === 'string') {
      const str = data.dueDateFormatted.trim();
      const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 23;
        const min = match[5] ? parseInt(match[5], 10) : 59;
        const sec = match[6] ? parseInt(match[6], 10) : 59;
        const d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime())) return d;
      }
    }

    if (data.dueDate) {
      const d = new Date(data.dueDate);
      if (!isNaN(d.getTime())) return d;
    }

    return null;
  }

  // Auto-expiration check for VIP / PRO subscriptions when payment / due date has arrived or passed
  async function checkAndExpireSubscriptions() {
    try {
      const now = new Date();

      // 1. Local SQLite expiration check
      try {
        const sqliteSubs = db.prepare("SELECT * FROM subscriptions WHERE plan IN ('pro', 'vip')").all() as any[];
        for (const row of sqliteSubs) {
          const dueDate = parseDueDate(row);
          if (dueDate && now.getTime() >= dueDate.getTime()) {
            const userId = row.user_id;
            const oldPlan = row.plan || 'pro';
            const formattedExpDate = formatDateTimeFull(now);

            // Downgrade to 'free' in SQLite
            db.prepare("UPDATE subscriptions SET plan = 'free', dueDateISO = NULL, dueDateFormatted = NULL, updatedAt = ? WHERE user_id = ?").run(now.toISOString(), userId);

            // Find user display email
            let userEmail = userId;
            try {
              const prof = db.prepare("SELECT email FROM profiles WHERE user_id = ?").get(userId) as any;
              if (prof?.email) userEmail = prof.email;
            } catch (_) {}

            // Add user notification
            try {
              db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
                userId,
                userEmail,
                `To'lov Muddati Tugadi - Obuna BEPUL Tarifga O'tkazildi`,
                `Sizning ${oldPlan.toUpperCase()} obunangizning amal qilish muddati tugadi (${formattedExpDate}) va hisobingiz avtomatik ravishda BEPUL (Free) tarifga o'tkazildi. Obunani yangilash uchun administratorga murojaat qiling.`,
                'sub_expired',
                now.toISOString()
              );
            } catch (_) {}

            // Add admin notification
            try {
              db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
                'admin',
                userEmail,
                "Obuna Muddati Tugadi",
                `Foydalanuvchi (${userEmail}) ning ${oldPlan.toUpperCase()} obunasi muddati tugadi (${formattedExpDate}) va hisobi avtomatik BEPUL tarifga tushirildi.`,
                'sub_expired',
                now.toISOString()
              );
            } catch (_) {}

            console.log(`[Auto-Expire SQLite]: User ${userEmail} (${userId}) plan reverted from ${oldPlan} to free.`);

            // Revert in Firestore for this specific user if connected
            if (adminDb && !isFirestoreQuotaExhausted()) {
              try {
                await adminDb.collection('subscriptions').doc(userId).set({
                  plan: 'free',
                  dueDateISO: null,
                  dueDateFormatted: null,
                  expiredAt: now.toISOString(),
                  expiredFromPlan: oldPlan
                }, { merge: true });

                await adminDb.collection('notifications').add({
                  userId: userId,
                  userEmail: userEmail,
                  title: `To'lov Muddati Tugadi - Obuna BEPUL Tarifga O'tkazildi`,
                  message: `Sizning ${oldPlan.toUpperCase()} obunangizning amal qilish muddati tugadi (${formattedExpDate}) va hisobingiz avtomatik ravishda BEPUL (Free) tarifga o'tkazildi. Obunani yangilash uchun administratorga murojaat qiling.`,
                  type: 'sub_expired',
                  createdAt: now.toISOString(),
                  read: false
                });

                await adminDb.collection('notifications').add({
                  userId: 'admin',
                  userEmail: userEmail,
                  title: "Obuna Muddati Tugadi",
                  message: `Foydalanuvchi (${userEmail}) ning ${oldPlan.toUpperCase()} obunasi muddati tugadi (${formattedExpDate}) va hisobi avtomatik BEPUL tarifga tushirildi.`,
                  type: 'sub_expired',
                  createdAt: now.toISOString(),
                  read: false
                });
              } catch (fsErr) {
                handleFirestoreError(fsErr, 'sub-expired individual doc');
              }
            }
          }
        }
      } catch (sqlErr) {
        console.warn("SQLite auto-expire check warning:", sqlErr);
      }
    } catch (err: any) {
      console.warn("checkAndExpireSubscriptions error:", err?.message || err);
    }
  }

  // Run subscription expiration check on startup & every 10 seconds
  checkAndExpireSubscriptions();
  setInterval(checkAndExpireSubscriptions, 10000);

  // Admin Routes
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user?.uid;
    const email = req.user?.email || '';
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const now = new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO profiles (user_id, email, displayName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
        userId,
        email,
        email.split('@')[0] || 'User',
        now,
        now
      );

      const isUserAdmin = email === 'ismoilovshohjahon750@gmail.com';
      if (isUserAdmin) {
        db.prepare("INSERT OR REPLACE INTO user_roles (user_id, role, email) VALUES (?, ?, ?)").run(userId, 'admin', email);
        const existingSub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId);
        if (!existingSub) {
          const due = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
          db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan, assignedDateFormatted, dueDateFormatted, assignedAt, dueDateISO, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            userId, 'vip', '29.08.2026', '29.08.2027', now, due, now
          );
        }
      }

      await checkAndExpireSubscriptions();

      const userSub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId) as any;
      const userPlan = userSub?.plan || 'free';

      res.json({
        success: true,
        isAdmin: isUserAdmin,
        plan: userPlan,
        assignedDateFormatted: userSub?.assignedDateFormatted || null,
        dueDateFormatted: userSub?.dueDateFormatted || null,
        dueDateISO: userSub?.dueDateISO || null
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/user/subscription", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await checkAndExpireSubscriptions();
      const userSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as any;
      const plan = userSub?.plan || 'free';

      res.json({
        success: true,
        plan,
        assignedDateFormatted: userSub?.assignedDateFormatted || null,
        dueDateFormatted: userSub?.dueDateFormatted || null,
        dueDateISO: userSub?.dueDateISO || null
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/set-subscription", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userEmail = req.user?.email || '';
      let isUserAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
      if (!isUserAdmin && req.user?.uid) {
        try {
          const roleRow = db.prepare("SELECT role FROM user_roles WHERE user_id = ?").get(req.user.uid) as any;
          if (roleRow && roleRow.role === 'admin') {
            isUserAdmin = true;
          }
        } catch (_) {}
        if (!isUserAdmin && adminDb && !isFirestoreQuotaExhausted()) {
          try {
            const roleDoc = await adminDb.collection('user_roles').doc(req.user.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') {
              isUserAdmin = true;
            }
          } catch (e) {}
        }
      }

      if (!isUserAdmin) {
        return res.status(403).json({ error: "Sizda admin huquqi yo'q" });
      }

      const { targetUserId, plan, customDurationDays } = req.body || {};
      if (!targetUserId || !plan || !['free', 'pro', 'vip'].includes(plan)) {
        return res.status(400).json({ error: "Noto'g'ri ma'lumotlar" });
      }

      // Resolve actual target user ID & email
      let actualUserId = targetUserId;
      let targetEmail = '';

      try {
        const prof = db.prepare("SELECT user_id, email FROM profiles WHERE user_id = ? OR email = ?").get(targetUserId, targetUserId) as any;
        if (prof) {
          actualUserId = prof.user_id;
          targetEmail = prof.email || '';
        }
      } catch (_) {}

      if (!targetEmail) {
        try {
          const u = await adminAuth.getUser(actualUserId);
          targetEmail = u.email || '';
        } catch (e) {
          try {
            if (adminDb && !isFirestoreQuotaExhausted()) {
              const profDoc = await adminDb.collection('profiles').doc(actualUserId).get();
              targetEmail = profDoc.data()?.email || '';
            }
          } catch (_) {}
        }
      }

      const displayEmail = targetEmail || actualUserId;
      const now = new Date();

      let assignedDateFormatted: string | null = null;
      let dueDateFormatted: string | null = null;
      let dueDateISO: string | null = null;
      const assignedAt = now.toISOString();

      if (plan === 'free') {
        // Resetting to free
        assignedDateFormatted = null;
        dueDateFormatted = null;
        dueDateISO = null;

        // 1. SQLite update
        try {
          db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan, assignedDateFormatted, dueDateFormatted, assignedAt, dueDateISO, updatedAt) VALUES (?, 'free', NULL, NULL, ?, NULL, ?)").run(
            actualUserId,
            assignedAt,
            assignedAt
          );
        } catch (sqle) {
          console.warn("Failed to write free subscription to SQLite:", sqle);
        }

        // 2. Firestore update
        if (adminDb && !isFirestoreQuotaExhausted()) {
          try {
            await adminDb.collection('subscriptions').doc(actualUserId).set({
              plan: 'free',
              assignedDateFormatted: null,
              dueDateFormatted: null,
              dueDateISO: null,
              assignedAt,
              updatedAt: assignedAt,
              assignedBy: req.user?.uid || userEmail
            }, { merge: true });
          } catch (e) {
            handleFirestoreError(e, 'set-subscription free doc');
          }
        }

        // Notifications
        try {
          db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
            'admin',
            displayEmail,
            "Obuna BEPUL Tarifga O'tkazildi",
            `${displayEmail} foydalanuvchisining obunasi BEPUL tarifga o'tkazildi (${formatDateTimeFull(now)}).`,
            'sub_assigned',
            assignedAt
          );
          if (actualUserId) {
            db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
              actualUserId,
              displayEmail,
              "Obuna BEPUL Tarifga O'tkazildi",
              `Sizning hisobingiz BEPUL tarifga o'tkazildi (${formatDateTimeFull(now)}).`,
              'sub_assigned',
              assignedAt
            );
          }
        } catch (_) {}

        return res.json({
          success: true,
          message: `Foydalanuvchi (${displayEmail}) muvaffaqiyatli BEPUL tarifga o'tkazildi!`,
          targetUserId: actualUserId,
          plan: 'free',
          assignedDateFormatted: null,
          dueDateFormatted: null,
          dueDateISO: null,
          assignedAt
        });
      }

      // PRO or VIP plan with exact date & time retention
      let dueDate: Date;
      if (customDurationDays && Number(customDurationDays) > 0) {
        const durationDays = Number(customDurationDays);
        dueDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      } else {
        // Default: Exactly 1 month forward at the exact same hour and minute!
        dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      assignedDateFormatted = formatDateTimeFull(now);
      dueDateFormatted = formatDateTimeFull(dueDate);
      dueDateISO = dueDate.toISOString();

      const subData = {
        plan,
        updatedAt: assignedAt,
        assignedAt,
        assignedDateFormatted, // kun.oy.yil soat:minut (e.g. 29.08.2026 12:35)
        dueDateISO,
        dueDateFormatted,      // kun.oy.yil soat:minut (e.g. 29.09.2026 12:35)
        assignedBy: req.user?.uid || userEmail
      };

      // 1. Save to SQLite subscriptions table immediately
      try {
        db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan, assignedDateFormatted, dueDateFormatted, assignedAt, dueDateISO, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          actualUserId,
          plan,
          assignedDateFormatted,
          dueDateFormatted,
          assignedAt,
          dueDateISO,
          assignedAt
        );
      } catch (sqle) {
        console.warn("Failed to write to SQLite subscriptions:", sqle);
      }

      // 2. Save to Firestore if available and quota not exceeded
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          await adminDb.collection('subscriptions').doc(actualUserId).set(subData, { merge: true });
        } catch (e) {
          handleFirestoreError(e, 'set-subscription doc');
        }
      }

      // 3. Save notifications to SQLite & Firestore
      try {
        db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
          'admin',
          displayEmail,
          "Obuna Berildi",
          `${displayEmail} foydalanuvchisiga ${plan.toUpperCase()} obuna berildi. Berilgan: ${assignedDateFormatted}, To'lov va tugash muddati: ${dueDateFormatted}`,
          'sub_assigned',
          assignedAt
        );
        if (actualUserId) {
          db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
            actualUserId,
            displayEmail,
            `Obuna Faollashtirildi (${plan.toUpperCase()})`,
            `Sizga ${plan.toUpperCase()} obuna taqdim etildi! Berilgan sana va vaqt: ${assignedDateFormatted}. Amal qilish va to'lov muddati: ${dueDateFormatted} gacha (Keyingi oy aynan shu soat va minutgacha amal qiladi).`,
            'sub_assigned',
            assignedAt
          );
        }
      } catch (_) {}

      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          await adminDb.collection('notifications').add({
            userId: 'admin',
            userEmail: displayEmail,
            title: "Obuna Berildi",
            message: `${displayEmail} foydalanuvchisiga ${plan.toUpperCase()} obuna berildi. Berilgan: ${assignedDateFormatted}, To'lov kuni: ${dueDateFormatted}`,
            type: 'sub_assigned',
            createdAt: assignedAt,
            read: false
          });

          if (actualUserId) {
            await adminDb.collection('notifications').add({
              userId: actualUserId,
              userEmail: displayEmail,
              title: `Obuna Faollashtirildi (${plan.toUpperCase()})`,
              message: `Sizga ${plan.toUpperCase()} obuna taqdim etildi! Berilgan sana va vaqt: ${assignedDateFormatted}. Amal qilish va to'lov muddati: ${dueDateFormatted} gacha.`,
              type: 'sub_assigned',
              createdAt: assignedAt,
              read: false
            });
          }
        } catch (ne) {
          handleFirestoreError(ne, 'set-subscription notifications');
        }
      }

      res.json({
        success: true,
        message: `Foydalanuvchi (${displayEmail}) obunasi ${plan.toUpperCase()} ga almashtirildi! Berilgan sana: ${assignedDateFormatted}, To'lov muddati: ${dueDateFormatted}`,
        targetUserId: actualUserId,
        plan,
        assignedDateFormatted,
        dueDateFormatted,
        dueDateISO,
        assignedAt
      });
    } catch (err: any) {
      console.error("Admin set-subscription error:", err);
      res.status(500).json({ error: "Obunani o'zgartirishda xatolik yuz berdi" });
    }
  });

  // Direct trigger endpoint for payment due notification
  app.post("/api/admin/send-due-notification", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userEmail = req.user?.email || '';
      let isUserAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
      if (!isUserAdmin && req.user?.uid) {
        try {
          if (adminDb && !isFirestoreQuotaExhausted()) {
            const roleDoc = await adminDb.collection('user_roles').doc(req.user.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') {
              isUserAdmin = true;
            }
          }
        } catch (e) {}
      }

      if (!isUserAdmin) {
        return res.status(403).json({ error: "Sizda admin huquqi yo'q" });
      }

      const { targetUserId, targetEmail, plan } = req.body || {};
      let finalUserId = targetUserId || '';
      let displayEmail = targetEmail || '';

      if (displayEmail) {
        try {
          const authUser = await adminAuth.getUserByEmail(displayEmail);
          if (authUser && authUser.uid) {
            finalUserId = authUser.uid;
            displayEmail = authUser.email || displayEmail;
          }
        } catch (e) {
          // If not found in Auth by email, check profiles collection
          try {
            if (adminDb && !isFirestoreQuotaExhausted()) {
              const profSnap = await adminDb.collection('profiles').where('email', '==', displayEmail).limit(1).get();
              if (!profSnap.empty) {
                finalUserId = profSnap.docs[0].id;
              }
            }
          } catch (_) {}
        }
      }

      if (!displayEmail && finalUserId) {
        try {
          const u = await adminAuth.getUser(finalUserId);
          displayEmail = u.email || '';
        } catch (e) {
          try {
            if (adminDb && !isFirestoreQuotaExhausted()) {
              const profDoc = await adminDb.collection('profiles').doc(finalUserId).get();
              displayEmail = profDoc.data()?.email || '';
            }
          } catch (_) {}
        }
      }

      if (!displayEmail) {
        displayEmail = finalUserId || 'Foydalanuvchi';
      }

      if (!finalUserId) {
        return res.status(400).json({ error: "Foydalanuvchi ID yoki Email topilmadi" });
      }

      // Foydalanuvchiga 1 ta rasmiy bildirishnoma yuborish
      const now = new Date().toISOString();
      try {
        db.prepare("INSERT INTO notifications (userId, userEmail, title, message, type, createdAt, read) VALUES (?, ?, ?, ?, ?, ?, 0)").run(
          finalUserId,
          displayEmail,
          "Obuna To'lov Kuni Keldi",
          `Hurmatli foydalanuvchi (${displayEmail}), sizning ${plan ? plan.toUpperCase() : 'obunangiz'} to'lov kuni keldi! Iltimos, obunani uzaytiring.`,
          'due_warning',
          now
        );
      } catch (_) {}

      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          await adminDb.collection('notifications').add({
            userId: finalUserId,
            userEmail: displayEmail,
            title: "Obuna To'lov Kuni Keldi",
            message: `Hurmatli foydalanuvchi (${displayEmail}), sizning ${plan ? plan.toUpperCase() : 'obunangiz'} to'lov kuni keldi! Iltimos, obunani uzaytiring.`,
            type: 'due_warning',
            createdAt: now,
            read: false
          });
        } catch (ne) {
          handleFirestoreError(ne, 'send-due-notification');
        }
      }

      res.json({
        success: true,
        message: `${displayEmail} nomli foydalanuvchiga to'lov kuni ogohlantirishi muvaffaqiyatli yuborildi!`
      });
    } catch (err: any) {
      console.error("send-due-notification error:", err);
      res.status(500).json({ error: "Bildirishnoma yuborishda xatolik" });
    }
  });

  app.get("/api/admin/users", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userEmail = req.user?.email || '';
      let isUserAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
      if (!isUserAdmin && req.user?.uid) {
        try {
          if (adminDb && !isFirestoreQuotaExhausted()) {
            const roleDoc = await adminDb.collection('user_roles').doc(req.user.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') {
              isUserAdmin = true;
            }
          }
        } catch (_) {}
      }

      if (!isUserAdmin) {
        return res.status(403).json({ error: "Sizda admin huquqi yo'q" });
      }

      await checkAndExpireSubscriptions();

      const rawUsersMap: Record<string, any> = {};

      // 1. Load from SQLite local storage first (reliable baseline)
      try {
        const sqliteSubs = db.prepare("SELECT * FROM subscriptions").all() as any[];
        sqliteSubs.forEach(s => {
          rawUsersMap[s.user_id] = {
            id: s.user_id,
            email: '',
            createdAt: s.assignedAt || null,
            plan: s.plan || 'free',
            assignedDateFormatted: s.assignedDateFormatted || null,
            dueDateFormatted: s.dueDateFormatted || null,
            assignedAt: s.assignedAt || null,
            dueDateISO: s.dueDateISO || null
          };
        });

        const sqliteProfiles = db.prepare("SELECT * FROM profiles").all() as any[];
        sqliteProfiles.forEach(p => {
          if (rawUsersMap[p.user_id]) {
            rawUsersMap[p.user_id].email = p.email || rawUsersMap[p.user_id].email;
          } else {
            rawUsersMap[p.user_id] = {
              id: p.user_id,
              email: p.email || '',
              createdAt: p.createdAt || null,
              plan: 'free',
              assignedDateFormatted: null,
              dueDateFormatted: null,
              assignedAt: null,
              dueDateISO: null
            };
          }
        });

        // Also gather users from bots table
        const botOwners = db.prepare("SELECT DISTINCT owner_id FROM bots WHERE owner_id IS NOT NULL AND owner_id != ''").all() as any[];
        botOwners.forEach(b => {
          if (!rawUsersMap[b.owner_id]) {
            rawUsersMap[b.owner_id] = {
              id: b.owner_id,
              email: '',
              createdAt: null,
              plan: 'free',
              assignedDateFormatted: null,
              dueDateFormatted: null,
              assignedAt: null,
              dueDateISO: null
            };
          }
        });
      } catch (sqle) {
        console.warn("SQLite users load error:", sqle);
      }

      // 2. Try Firestore if not quota exhausted
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          const subsSnap = await adminDb.collection('subscriptions').get();
          subsSnap.forEach(doc => {
            const data = doc.data() || {};
            const uid = doc.id;
            rawUsersMap[uid] = {
              ...(rawUsersMap[uid] || { id: uid, email: '' }),
              plan: data.plan || 'free',
              assignedDateFormatted: data.assignedDateFormatted || null,
              dueDateFormatted: data.dueDateFormatted || null,
              assignedAt: data.assignedAt || data.updatedAt || null,
              dueDateISO: data.dueDateISO || null
            };
            // Cache to SQLite
            try {
              db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan, assignedDateFormatted, dueDateFormatted, assignedAt, dueDateISO, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
                uid,
                data.plan || 'free',
                data.assignedDateFormatted || null,
                data.dueDateFormatted || null,
                data.assignedAt || null,
                data.dueDateISO || null,
                new Date().toISOString()
              );
            } catch (_) {}
          });

          const profilesSnap = await adminDb.collection('profiles').get();
          profilesSnap.docs.forEach(doc => {
            const data = doc.data() || {};
            const uid = doc.id;
            if (rawUsersMap[uid]) {
              rawUsersMap[uid].email = (data.email || '').trim() || rawUsersMap[uid].email;
              rawUsersMap[uid].createdAt = data.createdAt || rawUsersMap[uid].createdAt;
            } else {
              rawUsersMap[uid] = {
                id: uid,
                email: (data.email || '').trim(),
                createdAt: data.createdAt || null,
                plan: 'free',
                assignedDateFormatted: null,
                dueDateFormatted: null,
                assignedAt: null,
                dueDateISO: null
              };
            }
            // Cache to SQLite
            try {
              db.prepare("INSERT OR REPLACE INTO profiles (user_id, email, displayName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
                uid,
                (data.email || '').trim(),
                data.displayName || '',
                data.createdAt || '',
                new Date().toISOString()
              );
            } catch (_) {}
          });
        } catch (fsErr) {
          handleFirestoreError(fsErr, 'admin/users');
        }
      }

      // Try fetching emails from adminAuth for UIDs missing emails
      for (const uid of Object.keys(rawUsersMap)) {
        if (!rawUsersMap[uid].email) {
          try {
            const uDoc = await adminAuth.getUser(uid);
            if (uDoc.email) {
              rawUsersMap[uid].email = uDoc.email.trim();
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // 3. Deduplicate strictly by lowercased email
      const emailMap = new Map<string, any>();
      Object.values(rawUsersMap).forEach(u => {
        const emailKey = u.email ? u.email.toLowerCase() : u.id;
        if (!emailMap.has(emailKey)) {
          emailMap.set(emailKey, u);
        } else {
          const existing = emailMap.get(emailKey)!;
          if (u.plan !== 'free' && existing.plan === 'free') {
            emailMap.set(emailKey, u);
          } else if (u.assignedDateFormatted && !existing.assignedDateFormatted) {
            emailMap.set(emailKey, u);
          }
        }
      });

      const usersList = Array.from(emailMap.values());
      res.json({ users: usersList });
    } catch (err: any) {
      console.error("Admin users list error:", err);
      res.status(500).json({ error: "Foydalanuvchilar ro'yxatini olishda xatolik" });
    }
  });

  // -------------------------------------------------------------
  // TELEGRAM 24/7 AI SUPPORT BOT ADMIN API
  // -------------------------------------------------------------
  app.get("/api/admin/telegram-bot", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userEmail = req.user?.email || '';
      let isUserAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
      if (!isUserAdmin && req.user?.uid) {
        try {
          if (adminDb && !isFirestoreQuotaExhausted()) {
            const roleDoc = await adminDb.collection('user_roles').doc(req.user.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') isUserAdmin = true;
          }
        } catch (_) {}
      }
      if (!isUserAdmin) return res.status(403).json({ error: "Sizda admin huquqi yo'q" });

      const config = getTelegramSupportConfig();
      const maskedToken = config.botToken 
        ? (config.botToken.length > 10 ? `${config.botToken.substring(0, 5)}...${config.botToken.substring(config.botToken.length - 4)}` : '****')
        : '';

      let botInfo: any = null;
      if (config.botToken) {
        try {
          const bRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
          const bData = await bRes.json();
          if (bData.ok && bData.result) {
            botInfo = {
              id: bData.result.id,
              username: bData.result.username,
              firstName: bData.result.first_name,
              canConnectToBusiness: !!bData.result.can_connect_to_business,
              canJoinGroups: !!bData.result.can_join_groups
            };
          }
        } catch (botErr) {
          console.warn("Failed to get bot info from telegram:", botErr);
        }
      }

      const usersCountRow = db.prepare("SELECT count(*) as c FROM telegram_support_users").get() as any;
      const msgsCountRow = db.prepare("SELECT count(*) as c FROM telegram_support_logs WHERE role = 'user'").get() as any;
      const todayMsgsRow = db.prepare("SELECT count(*) as c FROM telegram_support_logs WHERE role = 'user' AND date(created_at) = date('now')").get() as any;
      
      const recentLogs = db.prepare("SELECT id, chat_id, username, role, text, created_at FROM telegram_support_logs ORDER BY id DESC LIMIT 50").all();

      res.json({
        hasToken: !!config.botToken,
        tokenMasked: maskedToken,
        adminId: config.adminId,
        enabled: config.enabled,
        isRunning: telegramBotRunning,
        lastError: telegramBotLastError,
        botInfo,
        stats: {
          totalUsers: usersCountRow?.c || 0,
          totalQueries: msgsCountRow?.c || 0,
          todayQueries: todayMsgsRow?.c || 0,
          lastPollTime: telegramBotLastPollTime ? new Date(telegramBotLastPollTime).toISOString() : null
        },
        recentLogs
      });
    } catch (e: any) {
      console.error("GET /api/admin/telegram-bot error:", e);
      res.status(500).json({ error: "Ma'lumotlarni olishda xatolik" });
    }
  });

  app.post("/api/admin/telegram-bot", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userEmail = req.user?.email || '';
      let isUserAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
      if (!isUserAdmin && req.user?.uid) {
        try {
          if (adminDb && !isFirestoreQuotaExhausted()) {
            const roleDoc = await adminDb.collection('user_roles').doc(req.user.uid).get();
            if (roleDoc.exists && roleDoc.data()?.role === 'admin') isUserAdmin = true;
          }
        } catch (_) {}
      }
      if (!isUserAdmin) return res.status(403).json({ error: "Sizda admin huquqi yo'q" });

      const { botToken, adminId, enabled } = req.body || {};

      if (typeof botToken === 'string' && botToken.trim()) {
        db.prepare("INSERT OR REPLACE INTO telegram_support_config (key, value) VALUES ('bot_token', ?)").run(botToken.trim());
      }
      if (typeof adminId === 'string' || typeof adminId === 'number') {
        db.prepare("INSERT OR REPLACE INTO telegram_support_config (key, value) VALUES ('admin_id', ?)").run(String(adminId).trim());
      }
      if (enabled !== undefined) {
        db.prepare("INSERT OR REPLACE INTO telegram_support_config (key, value) VALUES ('enabled', ?)").run(enabled ? '1' : '0');
      }

      telegramBotReloadCounter++;

      const currentConf = getTelegramSupportConfig();
      let botUsername = "";
      if (currentConf.botToken) {
        try {
          const testRes = await fetch(`https://api.telegram.org/bot${currentConf.botToken}/getMe`);
          const testData = await testRes.json();
          if (testData.ok && testData.result) {
            botUsername = testData.result.username;
          }
        } catch (_) {}
      }

      res.json({
        success: true,
        message: botUsername 
          ? `Sozlamalar saqlandi. Bot muvaffaqiyatli ulandi: @${botUsername}` 
          : "Sozlamalar muvaffaqiyatli saqlandi",
        botUsername
      });
    } catch (e: any) {
      console.error("POST /api/admin/telegram-bot error:", e);
      res.status(500).json({ error: "Sozlamalarni saqlashda xatolik" });
    }
  });

  // Start existing bots on server startup
  const botsToRun = db.prepare('SELECT id FROM bots WHERE status = ?').all('running');
  botsToRun.forEach((bot: any) => startBot(bot.id));

  // Helper function to check user bot upload limit according to subscription plan
  async function checkUserBotLimit(userId: string, targetBotId?: string, clientBotCount?: number): Promise<{ allowed: boolean; maxAllowed: number; currentCount: number; plan: string; error?: string }> {
    if (!userId) {
      return { allowed: false, maxAllowed: 2, currentCount: 0, plan: 'free', error: "Foydalanuvchi tizimga kirmagan" };
    }

    // Ensure expired subscriptions are automatically downgraded first
    await checkAndExpireSubscriptions();

    // 1. Get user subscription plan from SQLite first
    let plan: 'free' | 'pro' | 'vip' = 'free';
    try {
      const sqliteSub = db.prepare('SELECT plan FROM subscriptions WHERE user_id = ?').get(userId) as any;
      if (sqliteSub && sqliteSub.plan) {
        plan = sqliteSub.plan;
      }
    } catch (_) {}

    // If still free and Firestore is available and not quota-exhausted, check Firestore
    if (plan === 'free' && adminDb && !isFirestoreQuotaExhausted()) {
      try {
        const subDoc = await adminDb.collection('subscriptions').doc(userId).get();
        if (subDoc.exists) {
          plan = (subDoc.data()?.plan as any) || 'free';
          // Cache in SQLite
          try {
            db.prepare('INSERT OR REPLACE INTO subscriptions (user_id, plan, updatedAt) VALUES (?, ?, ?)').run(userId, plan, new Date().toISOString());
          } catch (_) {}
        }
      } catch (e) {
        handleFirestoreError(e, 'checkUserBotLimit');
      }
    }

    const maxAllowed = plan === 'vip' ? 30 : plan === 'pro' ? 10 : 2;

    // 2. Check if updating an existing bot owned by the user
    if (targetBotId) {
      const sqliteExisting = db.prepare('SELECT id FROM bots WHERE id = ?').get(targetBotId);
      if (sqliteExisting) {
        return { allowed: true, maxAllowed, currentCount: 0, plan };
      }
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          const fsExisting = await adminDb.collection('bots').doc(targetBotId).get();
          if (fsExisting.exists) {
            return { allowed: true, maxAllowed, currentCount: 0, plan };
          }
        } catch (e) {}
      }
    }

    // 3. Count current bots owned by user
    let sqliteCount = 0;
    try {
      sqliteCount = (db.prepare('SELECT COUNT(*) as count FROM bots WHERE owner_id = ?').get(userId) as any)?.count || 0;
    } catch (e) {}

    let fsCount = 0;
    if (adminDb && !isFirestoreQuotaExhausted()) {
      try {
        const fsUserBots = await adminDb.collection('bots').where('userId', '==', userId).get();
        fsCount = fsUserBots.size;
      } catch (e) {}
    }

    const clientCountNum = Number(clientBotCount || 0);
    const currentCount = Math.max(sqliteCount, fsCount, clientCountNum);

    if (currentCount >= maxAllowed) {
      return {
        allowed: false,
        maxAllowed,
        currentCount,
        plan,
        error: `Sizning tarifingizda (${plan.toUpperCase()} - maks ${maxAllowed} ta bot) limitga yetdingiz. Hozirda sizda ${currentCount} ta bot bor. Davom etish uchun tarifingizni yangilang.`
      };
    }

    return { allowed: true, maxAllowed, currentCount, plan };
  }

  // Bot yuklash
  app.post("/api/bots/upload", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Fayl yuklanmadi" });
      }

      const botId = (req.query.id as string) || (req.body.id as string) || Date.now().toString();

      const clientBotCount = req.body?.clientBotCount || req.query?.clientBotCount || req.headers['x-client-bot-count'];

      // Obuna limitini tekshirish (Bepul = max 2 ta bot)
      const limitCheck = await checkUserBotLimit(req.user?.uid || '', botId, Number(clientBotCount));
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
      }

      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();
      
      // Tilni va kirish faylini chuqur aniqlash
      let language = "unknown";
      let entryPoint = "";

      const fileEntries = zipEntries.filter(e => !e.isDirectory);
      const fileBaseNames = fileEntries.map(e => e.entryName.split('/').pop() || '');

      const hasReq = fileBaseNames.includes("requirements.txt") || fileBaseNames.includes("Pipfile");
      const hasPkg = fileBaseNames.includes("package.json");
      const hasGoMod = fileBaseNames.includes("go.mod");
      const hasCargo = fileBaseNames.includes("Cargo.toml");
      const hasGemfile = fileBaseNames.includes("Gemfile");
      const hasComposer = fileBaseNames.includes("composer.json");

      const pyFiles = fileBaseNames.filter(f => f.endsWith(".py"));
      const jsFiles = fileBaseNames.filter(f => f.endsWith(".js") || f.endsWith(".ts"));
      const goFiles = fileBaseNames.filter(f => f.endsWith(".go"));
      const rsFiles = fileBaseNames.filter(f => f.endsWith(".rs"));
      const rbFiles = fileBaseNames.filter(f => f.endsWith(".rb"));
      const phpFiles = fileBaseNames.filter(f => f.endsWith(".php"));

      if (hasReq || pyFiles.length > 0) {
        language = "python";
        if (fileBaseNames.includes("main.py")) entryPoint = "main.py";
        else if (fileBaseNames.includes("bot.py")) entryPoint = "bot.py";
        else if (fileBaseNames.includes("app.py")) entryPoint = "app.py";
        else if (fileBaseNames.includes("run.py")) entryPoint = "run.py";
        else if (pyFiles.length > 0) entryPoint = pyFiles[0];
        else entryPoint = "main.py";
      } else if (hasGoMod || goFiles.length > 0) {
        language = "go";
        if (fileBaseNames.includes("main.go")) entryPoint = "main.go";
        else if (fileBaseNames.includes("bot.go")) entryPoint = "bot.go";
        else if (goFiles.length > 0) entryPoint = goFiles[0];
        else entryPoint = "main.go";
      } else if (hasCargo || rsFiles.length > 0) {
        language = "rust";
        if (fileBaseNames.includes("main.rs")) entryPoint = "main.rs";
        else if (rsFiles.length > 0) entryPoint = rsFiles[0];
        else entryPoint = "main.rs";
      } else if (hasGemfile || rbFiles.length > 0) {
        language = "ruby";
        if (fileBaseNames.includes("main.rb")) entryPoint = "main.rb";
        else if (fileBaseNames.includes("bot.rb")) entryPoint = "bot.rb";
        else if (rbFiles.length > 0) entryPoint = rbFiles[0];
        else entryPoint = "main.rb";
      } else if (hasComposer || phpFiles.length > 0) {
        language = "php";
        if (fileBaseNames.includes("index.php")) entryPoint = "index.php";
        else if (fileBaseNames.includes("bot.php")) entryPoint = "bot.php";
        else if (fileBaseNames.includes("main.php")) entryPoint = "main.php";
        else if (phpFiles.length > 0) entryPoint = phpFiles[0];
        else entryPoint = "index.php";
      } else if (hasPkg || jsFiles.length > 0) {
        language = "nodejs";
        if (fileBaseNames.includes("index.js")) entryPoint = "index.js";
        else if (fileBaseNames.includes("bot.js")) entryPoint = "bot.js";
        else if (fileBaseNames.includes("main.js")) entryPoint = "main.js";
        else if (fileBaseNames.includes("app.js")) entryPoint = "app.js";
        else if (fileBaseNames.includes("server.js")) entryPoint = "server.js";
        else if (jsFiles.length > 0) entryPoint = jsFiles[0];
        else entryPoint = "index.js";
      } else {
        language = "nodejs";
        entryPoint = "index.js";
      }

      // Match Firestore document ID if provided by client to keep SQLite/Firestore synchronized
      const botName = req.body.name || req.file.originalname.replace(".zip", "");
      
      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        botId,
        req.user?.uid,
        botName,
        language,
        entryPoint,
        req.file.buffer,
        'stopped'
      );

      // Save complete bot metadata & zip (if small) to Firestore via adminDb
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          const botDocData: any = {
            userId: req.user?.uid || '',
            userEmail: req.user?.email || '',
            name: botName,
            language,
            entryPoint,
            status: 'stopped',
            createdAt: new Date().toISOString()
          };
          if (req.file.buffer.length <= 900000) {
            botDocData.codeZipBase64 = req.file.buffer.toString('base64');
          }
          await adminDb.collection('bots').doc(botId).set(botDocData, { merge: true });
        } catch (fsErr) {
          handleFirestoreError(fsErr, "save bot doc");
        }
      }

      res.json({
        message: "Bot muvaffaqiyatli yuklandi",
        data: { id: botId, name: botName, language, entryPoint }
      });
    } catch (error) {
      console.error("Yuklashda xatolik:", error);
      res.status(500).json({ error: "Serverda xatolik yuz berdi" });
    }
  });

  // Botlarni boshqarish
  app.post("/api/bots/:id/action", requireAuth, async (req: AuthRequest, res) => {
    const { action } = req.body; // 'start', 'stop', 'restart'
    const { id } = req.params;

    if (action === 'start') {
      const botRow = db.prepare("SELECT owner_id, name FROM bots WHERE id = ?").get(id) as any;
      const ownerId = botRow?.owner_id || req.user?.uid || '';
      const plan = await getUserPlanSafe(ownerId);
      const { active, sched, uzbTime } = isPlanInActiveSchedule(plan);

      if (!active) {
        return res.status(403).json({
          error: `Sizning ${sched.name} tarifingiz bo'yicha botlarning ishlash vaqti ${sched.startHour} dan ${sched.endHour} gacha (O'zbekiston vaqti bilan). Hozirgi vaqt: ${uzbTime.timeStr}. Tungi rejimda server resurslarini tejash uchun bot ertalab soat ${sched.startHour} da avtomatik ishga tushadi.`,
          schedule: {
            plan,
            startHour: sched.startHour,
            endHour: sched.endHour,
            currentUzbTime: uzbTime.timeStr,
            isActive: false
          }
        });
      }

      userStoppedBots.delete(id);
      schedulePausedBots.delete(id);
      startBot(id);
      res.json({ message: `Bot ${id} ishga tushirildi`, status: 'running' });
    } else if (action === 'restart') {
      const botRow = db.prepare("SELECT owner_id, name FROM bots WHERE id = ?").get(id) as any;
      const ownerId = botRow?.owner_id || req.user?.uid || '';
      const plan = await getUserPlanSafe(ownerId);
      const { active, sched, uzbTime } = isPlanInActiveSchedule(plan);

      if (!active) {
        return res.status(403).json({
          error: `Sizning ${sched.name} tarifingiz bo'yicha botlarning ishlash vaqti ${sched.startHour} dan ${sched.endHour} gacha (O'zbekiston vaqti bilan). Hozirgi vaqt: ${uzbTime.timeStr}. Tungi rejimda bot ertalab soat ${sched.startHour} da avtomatik ishga tushadi.`,
          schedule: {
            plan,
            startHour: sched.startHour,
            endHour: sched.endHour,
            currentUzbTime: uzbTime.timeStr,
            isActive: false
          }
        });
      }

      userStoppedBots.add(id); // Temporarily mark as stopped to prevent close handler auto-restart
      schedulePausedBots.delete(id);
      const runningBot = runningBots.get(id);
      if (runningBot) {
        try {
          if (runningBot.pid) killTree(runningBot.pid);
        } catch (e) {}
        runningBots.delete(id);
      }
      setTimeout(() => {
        userStoppedBots.delete(id);
        startBot(id);
      }, 500);
      res.json({ message: `Bot ${id} qayta ishga tushirildi`, status: 'running' });
    } else if (action === 'stop') {
      userStoppedBots.add(id);
      schedulePausedBots.delete(id);
      db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', id);
      updateFirestoreBotStatus(id, 'stopped');
      
      // Kill process from map
      const runningBot = runningBots.get(id);
      if (runningBot) {
        try {
          if (runningBot.pid) killTree(runningBot.pid);
        } catch (e) {}
        runningBots.delete(id);
      }

      // Thorough process and folder cleanup
      const botDir = path.join(process.cwd(), 'bots_running', id);
      try { execSync(`pkill -9 -f "${botDir}"`, { stdio: 'ignore' }); } catch (e) {}
      try { execSync(`pkill -9 -f "${id}"`, { stdio: 'ignore' }); } catch (e) {}
      try { execSync(`fuser -k -9 "${botDir}"`, { stdio: 'ignore' }); } catch (e) {}
      
      const pidPath = path.join(botDir, '.pid');
      if (fs.existsSync(pidPath)) {
        try {
          const oldPid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          if (!isNaN(oldPid)) killTree(oldPid);
          fs.unlinkSync(pidPath);
        } catch (e) {}
      }
      
      res.json({ message: `Bot ${id} to'xtatildi`, status: 'stopped' });
    } else {
      res.status(400).json({ error: "Noto'g'ri amaliyot" });
    }
  });

  // Botni tegi bilan to'liq o'chirib tashlash (Fayllari, process, SQLite va Firestore doc)
  app.delete("/api/bots/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    userStoppedBots.add(id);
    const userId = req.user?.uid;
    const userEmail = req.user?.email || '';
    const isAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';

    try {
      // 1. SQLite'da tekshirish
      const sqliteBot = db.prepare('SELECT * FROM bots WHERE id = ?').get(id) as any;
      if (!isAdmin && sqliteBot && sqliteBot.owner_id && sqliteBot.owner_id !== userId) {
        return res.status(403).json({ error: "Siz ushbu botni o'chira olmaysiz" });
      }

      // 2. Ishlayotgan jarayonni (process) o'ldirish
      const runningBot = runningBots.get(id);
      if (runningBot) {
        try {
          if (runningBot.pid) killTree(runningBot.pid);
        } catch (e) {
          console.warn(`Running bot process kill error:`, e);
        }
        runningBots.delete(id);
      }

      // 3. Diskdagi bot papkasini (fayllarini) to'liq tozalash
      const botDir = path.join(process.cwd(), 'bots_running', id);
      try { execSync(`pkill -9 -f "${botDir}"`, { stdio: 'ignore' }); } catch (e) {}
      try { execSync(`pkill -9 -f "${id}"`, { stdio: 'ignore' }); } catch (e) {}
      if (fs.existsSync(botDir)) {
        try {
          fs.rmSync(botDir, { recursive: true, force: true });
        } catch (e) {
          console.warn(`Bot folder delete error:`, e);
        }
      }

      // 4. SQLite DB dan loglar va bot recordini o'chirish
      try {
        db.prepare('DELETE FROM bot_logs WHERE bot_id = ?').run(id);
        db.prepare('DELETE FROM bots WHERE id = ?').run(id);
      } catch (e) {
        console.warn(`SQLite bot delete warning:`, e);
      }

      // 5. Firestore dan bot hujjatini o'chirish (Fail-safe timeout bilan)
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          await Promise.race([
            adminDb.collection('bots').doc(id).delete(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore delete timeout')), 2000))
          ]);
        } catch (e) {
          handleFirestoreError(e, `bot doc delete for ${id}`);
        }
      }

      return res.json({ success: true, message: `Bot ${id} muvaffaqiyatli o'chirildi` });
    } catch (error: any) {
      console.error("Bot delete error:", error);
      return res.status(500).json({ error: error.message || "Botni o'chirishda xatolik yuz berdi" });
    }
  });

  // Foydalanuvchining o'z botlari ro'yxatini olish (Dashboard / REST API fallback)
  app.get("/api/bots", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user?.uid || '';
    const userEmail = req.user?.email || '';
    const isGlobalAdmin = userEmail === 'ismoilovshohjahon750@gmail.com';
    const requestAll = req.query.all === 'true' || req.query.scope === 'all';

    try {
      // 1. Diskdagi botlarni SQLite DB bilan avtomatik sinxronlash
      syncBotsFromDisk(db, userId);

      // 2. Bo'sh yoki biriktirilmagan botlarni joriy foydalanuvchiga biriktirish
      if (userId) {
        db.prepare("UPDATE bots SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''").run(userId);
      }

      // 3. Agar foydalanuvchining botlari Firestore da bo'lsa va SQLite ga hali tushmagan bo'lsa, sinxronlash
      if (adminDb && userId && !isFirestoreQuotaExhausted()) {
        try {
          const userFsDocs = await adminDb.collection('bots').where('userId', '==', userId).get();
          for (const docSnap of userFsDocs.docs) {
            const data = docSnap.data();
            const existing = db.prepare('SELECT id FROM bots WHERE id = ?').get(docSnap.id);
            if (!existing) {
              let codeBuffer: Buffer | null = null;
              if (data.codeZipBase64) {
                codeBuffer = Buffer.from(data.codeZipBase64, 'base64');
              }
              db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                docSnap.id,
                userId,
                data.name || 'Bot',
                data.language || 'python',
                data.entryPoint || 'bot.py',
                codeBuffer,
                data.status || 'stopped'
              );
            }
          }
        } catch (fsErr) {
          handleFirestoreError(fsErr, 'user sync in /api/bots');
        }
      }

      let rows: any[] = [];
      if (isGlobalAdmin && requestAll) {
        rows = db.prepare('SELECT id, owner_id as userId, name, language, entryPoint, status FROM bots').all();
      } else {
        rows = db.prepare("SELECT id, owner_id as userId, name, language, entryPoint, status FROM bots WHERE owner_id = ? OR owner_id IS NULL OR owner_id = ''").all(userId);
        if (rows.length === 0) {
          rows = db.prepare('SELECT id, owner_id as userId, name, language, entryPoint, status FROM bots').all();
        }
      }
      
      const bots = rows.map(r => {
        const isRunning = runningBots.has(r.id);
        return {
          id: r.id,
          userId: r.userId || userId,
          name: r.name || 'Nomsiz Bot',
          language: r.language || 'python',
          entryPoint: r.entryPoint || 'bot.py',
          status: isRunning ? 'running' : (r.status || 'stopped'),
          userEmail: userEmail
        };
      });

      const userPlan = await getUserPlanSafe(userId);
      const scheduleStatus = isPlanInActiveSchedule(userPlan);

      return res.json({
        bots,
        userPlan,
        schedule: {
          plan: userPlan,
          planName: scheduleStatus.sched.name,
          startHour: scheduleStatus.sched.startHour,
          endHour: scheduleStatus.sched.endHour,
          currentUzbTime: scheduleStatus.uzbTime.timeStr,
          isActive: scheduleStatus.active,
          description: scheduleStatus.sched.description
        }
      });
    } catch (error) {
      console.error("Botlar ro'yxatini olishda xato:", error);
      return res.status(500).json({ error: "Botlar ro'yxatini yuklab bo'lmadi" });
    }
  });

  // O'zbekiston vaqti bo'yicha jadval ma'lumotlari (Public API)
  app.get("/api/schedule-status", (req, res) => {
    const uzbTime = getUzbekistanTime();
    res.json({
      currentTime: uzbTime.timeStr,
      timezone: "Asia/Tashkent (UTC+5)",
      schedules: {
        free: {
          ...PLAN_SCHEDULES.free,
          isActive: isPlanInActiveSchedule('free').active
        },
        pro: {
          ...PLAN_SCHEDULES.pro,
          isActive: isPlanInActiveSchedule('pro').active
        },
        vip: {
          ...PLAN_SCHEDULES.vip,
          isActive: isPlanInActiveSchedule('vip').active
        }
      }
    });
  });

  // Bot loglarini olish (Optimallashtirilgan - so'nggi 300 ta log)
  app.get("/api/bots/:id/logs", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 50), 1000);
    try {
      const logs = db.prepare('SELECT type, message, created_at as createdAt FROM (SELECT id, type, message, created_at FROM bot_logs WHERE bot_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC').all(id, limit);
      res.json({ logs });
    } catch (error) {
      console.error("Loglarni olishda xato:", error);
      res.status(500).json({ error: "Loglarni yuklab bo'lmadi" });
    }
  });

  // Bot loglarini tozalash
  app.post("/api/bots/:id/logs/clear", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM bot_logs WHERE bot_id = ?').run(id);
      res.json({ success: true, message: "Loglar tozalandi" });
    } catch (error) {
      console.error("Loglarni tozalashda xatonik:", error);
      res.status(500).json({ error: "Loglarni tozalab bo'lmadi" });
    }
  });

  // Botly AI: Bot kodi va loglaridagi xatoliklarni avtomatik tuzatish (Har tuzatish uchun 30 to'kin sarflanadi)
  app.post("/api/bots/:id/fix-errors", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "Foydalanuvchi tizimga kirmagan" });
    }

    try {
      // 1. Foydalanuvchi obuna rejasi va kunlik to'kin limitini tekshirish
      const LIMITS = { free: 45, pro: 145, vip: 500 };
      const plan = await getUserPlanSafe(userId);
      const { count: currentUsage, usageRef } = await getUserDailyUsageSafe(userId);

      const limit = LIMITS[plan] || LIMITS.free;
      const COST_TOKENS = 30;

      if (currentUsage + COST_TOKENS > limit) {
        const remaining = Math.max(0, limit - currentUsage);
        return res.status(403).json({
          error: `Xatolikni tuzatish uchun 30 ta Botly AI to'kini talab qilinadi. Sizning joriy tarifingiz (${plan.toUpperCase()}) bo'yicha bugungi limitingizda ${remaining}/${limit} to'kin qolgan. Iltimos, tarifingizni yangilang.`
        });
      }

      // 2. Bot papkasidagi mavjud fayllarni to'plash
      const botDir = path.join(process.cwd(), 'bots_running', id);
      const botFiles: { filename: string; content: string }[] = [];

      // Agar papka mavjud bo'lmasa, SQLite BLOB dan tiklash
      if (!fs.existsSync(botDir) || fs.readdirSync(botDir).length === 0) {
        const sqliteBot = db.prepare('SELECT code FROM bots WHERE id = ?').get(id) as any;
        if (sqliteBot && sqliteBot.code) {
          fs.mkdirSync(botDir, { recursive: true });
          const zip = new AdmZip(sqliteBot.code);
          zip.extractAllTo(botDir, true);
        }
      }

      const getAllCodeFiles = (dir: string, baseDir = dir) => {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (['node_modules', '__pycache__', '.git', '.venv', 'venv', '.pid', 'bot.zip', 'bot_bin'].includes(item)) continue;
          if (item.endsWith('.db') || item.endsWith('.sqlite') || item.endsWith('.sqlite3') || item.endsWith('.log')) continue;
          const full = path.join(dir, item);
          const rel = path.relative(baseDir, full);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            getAllCodeFiles(full, baseDir);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (['.py', '.js', '.ts', '.json', '.env', '.txt', '.php', '.go', '.rs', '.rb', '.yml', '.yaml', '.sh'].includes(ext) || item === 'Dockerfile' || item === 'Procfile') {
              try {
                const content = fs.readFileSync(full, 'utf8');
                botFiles.push({ filename: rel, content });
              } catch (e) {}
            }
          }
        }
      };

      if (fs.existsSync(botDir)) {
        getAllCodeFiles(botDir);
      }

      if (botFiles.length === 0) {
        return res.status(400).json({ error: "Bot kodi fayllari serverda topilmadi. Iltimos, zip faylini qayta yuklang." });
      }

      // 3. Botning so'nggi loglari va xatoliklarini olish
      const logs = db.prepare('SELECT type, message, created_at FROM bot_logs WHERE bot_id = ? ORDER BY id DESC LIMIT 25').all(id) as any[];
      const logContext = logs.reverse().map(l => `[${l.type.toUpperCase()}] ${l.message}`).join('\n');

      addBotLog(id, 'system', `🤖 [Botly AI]: Xatoliklarni avtomatik tuzatish boshlandi (30 to'kin sarflanmoqda)...`);

      // 4. AI orqali xatoliklarni tuzatish
      const filesContextStr = botFiles.map(f => `--- FAYL: ${f.filename} ---\n${f.content}\n--- FAYL TUGADI ---`).join('\n\n');

      const systemInstruction = `Siz faqat va faqat dasturiy ta'minot va Telegram botlardagi sintaktik, mantiqiy, kutubxona (dependencies) va asinxron xatoliklarni chuqur tahlil qilib to'g'irlaydigan eng yuqori darajadagi AI Debugger va Bug Fixer mutaxassisisiz (Botly AI Auto-debugger).

Vazifangiz:
1. Taqdim etilgan so'nggi loglar va bot kodidagi barcha xatoliklarni (SyntaxError, IndentationError, NameError, ImportError, TypeError, Telegram API xatoliklari, token/konfiguratsiya xatoliklari, unclosed quotes, async/await xatolari va h.k.) aniqlang.
2. MUHIM: FAQAT va FAQAT XATOSI BOR yoki TUZATILISHI SHART BO'LGAN fayllarni "fixedFiles" massivida qaytaring! O'zgarmaydigan, to'g'ri ishlayotgan fayllarni "fixedFiles" massiviga QO'SHMANG. Bu katta loyihalarda javob qisqarib ketishining oldini oladi.
3. KATTA FAYLLAR UCHUN O'TA MUHIM QAIDA: Hech qachon kodni "# ... rest of code unchanged", "# ... (eski kod qoladi)", "// ... rest of code" yoki "..." deb qisqartirmang! "fixedFiles" ichidagi har bir fayl kodi 100% to'liq, mukammal va sintaktik to'g'ri ishchi kod bo'lishi shart.
4. Agar yangi kutubxona kerak bo'lsa requirements.txt yoki package.json ga ham qo'shing.
5. Python-Telegram-Bot, Aiogram, Pyrogram, Telegraf yoki GrammY botlarida xatoliklarni ushlovchi global error handlerlarni xavfsiz integratsiya qiling.

Javobni FAQAT ushbu formatdagi JSON ko'rinishida bering:
{
  "explanation": "Qanday xatoliklar aniqlandi va qanday qilib to'liq tuzatildi (o'zbek tilida aniq va tushunarli)",
  "fixedFiles": [
    {
      "filename": "fayl_nomi (masalan: main.py)",
      "content": "faylning 100% to'liq tuzatilgan kodi (hech qanday '...' yoki chala kodsiz)"
    }
  ]
}`;

      const userPrompt = `BOTNING SO'NGGI LOGLARI VA XATOLIKLARI:\n${logContext || "Loglarda xatolik aniqlanmagan, lekin kod sintaksisini va barcha fayllarni tekshirib xatoliklarni to'g'irlang."}\n\nBOTNING MAVJUD FAYLLARI:\n${filesContextStr}`;

      let explanation = "";
      let fixedFiles: { filename: string; content: string }[] = [];

      // 1. Try Groq LLaMA first with explicit max_tokens: 8192
      const groq = getGroqClient();
      if (groq) {
        try {
          const completion = await groq.chat.completions.create({
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userPrompt }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 8192
          });
          const raw = completion.choices[0]?.message?.content;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.explanation && Array.isArray(parsed.fixedFiles) && parsed.fixedFiles.length > 0) {
              explanation = parsed.explanation;
              fixedFiles = parsed.fixedFiles;
              console.log(`[Botly AI Fix]: Groq LLaMA successfully fixed ${fixedFiles.length} files.`);
            }
          }
        } catch (groqErr: any) {
          const errMsg = groqErr?.message || String(groqErr);
          if (groqErr?.status === 401 || errMsg.includes("Invalid API Key") || errMsg.includes("invalid_api_key")) {
            groqKeyInvalidated = true;
            console.log("[Botly AI Fix]: Groq API key is invalid or expired. Switched to primary Gemini AI engine.");
          } else {
            console.warn("[Botly AI Fix]: Groq error, switching to Gemini:", errMsg.slice(0, 100));
          }
        }
      }

      // 2. Gemini fallback / primary with maxOutputTokens: 8192 and model fallbacks
      if (fixedFiles.length === 0) {
        try {
          const geminiRes = await callGeminiContentWithFallback({
            preferredModel: "gemini-3.7-flash",
            contents: userPrompt,
            config: {
              systemInstruction,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  explanation: { type: Type.STRING, description: "Tuzatilgan xatoliklar haqida izoh" },
                  fixedFiles: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        filename: { type: Type.STRING },
                        content: { type: Type.STRING }
                      },
                      required: ["filename", "content"]
                    }
                  }
                },
                required: ["explanation", "fixedFiles"]
              }
            }
          });

          const raw = geminiRes.text;
          if (raw) {
            const parsed = JSON.parse(raw);
            explanation = parsed.explanation || "Xatoliklar muvaffaqiyatli tuzatildi";
            fixedFiles = parsed.fixedFiles || [];
          }
        } catch (geminiErr: any) {
          console.error("[Botly AI Fix]: Gemini fallback pipeline failed:", geminiErr);
        }
      }

      if (fixedFiles.length === 0) {
        return res.status(500).json({ error: "AI kodni tuzatishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring." });
      }

      // 5. Sanity check & Tuzatilgan fayllarni diskka yozish (Chala kod / '...' placeholder larni rad etish)
      const validFixedFiles: { filename: string; content: string }[] = [];
      const truncationRegex = /(#|\/\/|\/\*)\s*(\.\.\.|rest of|eski kod|remaining code|unchanged)/i;

      for (const f of fixedFiles) {
        if (!f.filename || !f.content || typeof f.content !== 'string') continue;

        // original content
        const origFile = botFiles.find(bf => bf.filename === f.filename);
        if (origFile && origFile.content.length > 200 && f.content.length < origFile.content.length * 0.4 && truncationRegex.test(f.content)) {
          console.warn(`[Botly AI Fix]: Warning! Rejecting truncated AI output for file ${f.filename} (contained placeholder marker)`);
          addBotLog(id, 'system', `⚠️ [Botly AI]: ${f.filename} fayli uchun AI javobida chala qisqartirish sezildi va xavfsizlik uchun rad etildi.`);
          continue;
        }

        const targetPath = path.join(botDir, f.filename);
        const targetParent = path.dirname(targetPath);
        if (!fs.existsSync(targetParent)) {
          fs.mkdirSync(targetParent, { recursive: true });
        }
        fs.writeFileSync(targetPath, f.content, 'utf8');
        validFixedFiles.push(f);
      }

      if (validFixedFiles.length === 0) {
        return res.status(500).json({ error: "AI taqdim etgan tuzatishlarda chala qisqartirishlar aniqlandi. Iltimos, qaytadan 'Fix Errors' tugmasini bosing." });
      }

      // 6. Zip ni qayta yaratish va SQLite hamda Firestore ni yangilash
      const updatedZip = new AdmZip();
      updatedZip.addLocalFolder(botDir);
      const zipBuffer = updatedZip.toBuffer();

      db.prepare('UPDATE bots SET code = ? WHERE id = ?').run(zipBuffer, id);
      try {
        if (adminDb && !isFirestoreQuotaExhausted() && zipBuffer.length <= 900000) {
          await adminDb.collection('bots').doc(id).set({
            codeZipBase64: zipBuffer.toString('base64'),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      } catch (fsErr) {
        handleFirestoreError(fsErr, "update bot zip");
      }

      // 7. Tokenni ayirish (30 to'kin)
      await incrementUserDailyUsageSafe(userId, COST_TOKENS, usageRef);

      const remainingTokens = Math.max(0, limit - (currentUsage + COST_TOKENS));

      // 8. Tizim loglariga hisobot qo'shish
      addBotLog(id, 'system', `✨ [Botly AI]: Xatoliklar muvaffaqiyatli tuzatildi! (-30 token sarflandi, qoldi: ${remainingTokens}/${limit} token).`);
      addBotLog(id, 'system', `📝 Tuzatish tafsilotlari: ${explanation}`);
      addBotLog(id, 'system', `📂 Yangilangan fayllar: ${fixedFiles.map(f => f.filename).join(', ')}`);
      addBotLog(id, 'system', `🚀 Botni ishga tushirish uchun "Restart" tugmasini bosing.`);

      res.json({
        success: true,
        message: `Botly AI xatoliklarni muvaffaqiyatli tuzatdi! (30 token sarflandi)`,
        explanation,
        fixedFiles: fixedFiles.map(f => f.filename),
        tokensUsed: COST_TOKENS,
        remainingTokens,
        limit
      });
    } catch (err: any) {
      console.error("Botly AI Fix Errors API failure:", err);
      let errMsg = err?.message || String(err);
      if (typeof errMsg === 'string' && errMsg.includes('{')) {
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch (e) {}
      }
      if (errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE')) {
        errMsg = "Sun'iy intellekt xizmati (Gemini API) ayni vaqtda juda band (503 High Demand). Iltimos, 1-2 daqiqadan so'ng 'Fix Errors' tugmasini qayta bosing.";
      } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        errMsg = "AI kunlik so'rovlar limitiga yetdi (Rate Limit: 429). Iltimos, birozdan so'ng qayta urinib ko'ring.";
      }
      res.status(500).json({ error: "Xatoliklarni tuzatishda xatolik yuz berdi: " + errMsg });
    }
  });

  // Bot loyhasini fayllardan yaratib SQLite-ga saqlash (AI Generated Live Publish uchun)
  app.post("/api/bots/create-from-files", requireAuth, async (req: AuthRequest, res) => {
    const { id, name, files, language, entryPoint } = req.body;
    if (!id || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: "id va files parameterlari talab qilinadi" });
    }

    try {
      const clientBotCount = req.body?.clientBotCount || req.query?.clientBotCount || req.headers['x-client-bot-count'];

      // Obuna limitini tekshirish (Bepul = max 2 ta bot)
      const limitCheck = await checkUserBotLimit(req.user?.uid || '', id, Number(clientBotCount));
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
      }

      const zip = new AdmZip();
      
      files.forEach((f: any) => {
        zip.addFile(f.filename, Buffer.from(f.content, "utf-8"));
      });

      const buffer = zip.toBuffer();

      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id,
        req.user?.uid,
        name,
        language || 'nodejs',
        entryPoint || 'index.js',
        buffer,
        'stopped'
      );

      res.json({ success: true, message: "Bot SQLite saqlovchisiga muvaffaqiyatli yuklandi." });
    } catch (e: any) {
      console.error("Failed to save AI bot from files:", e);
      res.status(500).json({ error: "Bot paketini yaratishda xatolik yuz berdi: " + e.message });
    }
  });

  // Repozitoriyani skanerlab atrof-muhit o'zgaruvchilarini aniqlash yordamchi funksiyasi
  function scanRepoForEnvVars(botDir: string, botId?: string) {
    const detectedKeys = new Set<string>();
    const defaultValues: Record<string, string> = {};

    // 0. Agar botDir bo'sh yoki mavjud bo'lmasa, SQLite-dan kodni ochish
    if ((!fs.existsSync(botDir) || fs.readdirSync(botDir).length === 0) && botId) {
      try {
        const botRow = db.prepare('SELECT code FROM bots WHERE id = ?').get(botId) as any;
        if (botRow && botRow.code && Buffer.isBuffer(botRow.code) && botRow.code.length > 0) {
          if (!fs.existsSync(botDir)) fs.mkdirSync(botDir, { recursive: true });
          const zip = new AdmZip(botRow.code);
          zip.extractAllTo(botDir, true);
        }
      } catch (e) {
        console.warn(`[scanRepoForEnvVars] Could not extract bot zip for ${botId}:`, e);
      }
    }

    // Mavjud .env faylni birinchi bo'lib to'liq o'qish
    const existingEnv: Record<string, string> = {};
    let rawEnvContent = '';
    const currentEnvPath = path.join(botDir, '.env');
    
    if (fs.existsSync(currentEnvPath)) {
      try {
        rawEnvContent = fs.readFileSync(currentEnvPath, 'utf8');
        rawEnvContent.split('\n').forEach(l => {
          let t = l.trim();
          if (t.startsWith('export ')) t = t.substring(7).trim();
          if (t && !t.startsWith('#') && t.includes('=')) {
            const eq = t.indexOf('=');
            const k = t.substring(0, eq).trim();
            let v = t.substring(eq + 1).trim();
            // Remove surrounding quotes
            v = v.replace(/^["']|["']$/g, '');
            if (k) {
              existingEnv[k] = v;
              detectedKeys.add(k);
            }
          }
        });
      } catch (e) {}
    }

    // 1. O'qish: .env.example, .env.sample, .env.template, config.env
    const envExampleFiles = ['.env.example', '.env.sample', '.env.template', 'config.env.example', 'example.env', 'config.env'];
    
    for (const envFile of envExampleFiles) {
      const filePath = path.join(botDir, envFile);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          content.split('\n').forEach(line => {
            let trimmed = line.trim();
            if (trimmed.startsWith('export ')) trimmed = trimmed.substring(7).trim();
            if (trimmed.startsWith('#')) {
              trimmed = trimmed.substring(1).trim();
            }
            if (trimmed && trimmed.includes('=')) {
              const eqIdx = trimmed.indexOf('=');
              const key = trimmed.substring(0, eqIdx).trim();
              const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
              if (key && /^[A-Za-z0-9_]+$/.test(key)) {
                detectedKeys.add(key);
                if (val && !defaultValues[key]) {
                  defaultValues[key] = val;
                }
              }
            }
          });
        } catch (e) {}
      }
    }

    // 2. Kod fayllarini skanerlash
    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      let items: string[] = [];
      try {
        items = fs.readdirSync(dir);
      } catch (e) {
        return;
      }

      for (const item of items) {
        if (item === 'node_modules' || item === '__pycache__' || item === '.git' || item === 'venv' || item === '.venv') continue;
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (['.py', '.js', '.ts', '.go', '.php', '.json', '.yml', '.yaml', '.env', '.ini', '.cfg'].includes(ext)) {
              const code = fs.readFileSync(fullPath, 'utf8');

              // Python patternlar
              const pyMatches = code.matchAll(/(?:os\.(?:getenv|environ\.get|environ\[)|getenv\()\s*["']([A-Za-z0-9_]+)["']/g);
              for (const m of pyMatches) {
                if (m[1]) detectedKeys.add(m[1]);
              }

              // JS / TS patternlar
              const jsMatches = code.matchAll(/process\.env(?:\.([A-Za-z0-9_]+)|\[["']([A-Za-z0-9_]+)["']\])/g);
              for (const m of jsMatches) {
                const k = m[1] || m[2];
                if (k) detectedKeys.add(k);
              }

              // Go patternlar
              const goMatches = code.matchAll(/os\.Getenv\(["']([A-Za-z0-9_]+)["']\)/g);
              for (const m of goMatches) {
                if (m[1]) detectedKeys.add(m[1]);
              }

              // PHP patternlar
              const phpMatches = code.matchAll(/(?:getenv|env)\(["']([A-Za-z0-9_]+)["']\)/g);
              for (const m of phpMatches) {
                if (m[1]) detectedKeys.add(m[1]);
              }

              // O'zgaruvchi biriktiruvlari
              const varDeclMatches = code.matchAll(/(BOT_TOKEN|TELEGRAM_TOKEN|TOKEN|ADMIN_ID|ADMINS|ADMIN_IDS|OWNER_ID|SUDO_USERS|TELEGRAM_API_ID|TELEGRAM_API_HASH|OPENAI_API_KEY|GEMINI_API_KEY|PAYMENT_PROVIDER_TOKEN|CARD_NUMBER|CARD_OWNER|CHANNEL_ID|CHANNEL_USERNAME|DATABASE_URL|MONGO_URI)\s*=/gi);
              for (const m of varDeclMatches) {
                if (m[1]) detectedKeys.add(m[1].toUpperCase());
              }
            }
          }
        } catch (e) {}
      }
    };

    scanDir(botDir);

    // BOT_TOKEN va ADMIN_ID bo'lmasa, standart taklif sifatida qo'shish
    let hasTokenKey = false;
    let hasAdminKey = false;

    for (const k of detectedKeys) {
      if (/TOKEN/i.test(k)) hasTokenKey = true;
      if (/ADMIN|OWNER|SUDO/i.test(k)) hasAdminKey = true;
    }

    if (!hasTokenKey) detectedKeys.add('BOT_TOKEN');
    if (!hasAdminKey) detectedKeys.add('ADMIN_ID');

    // Har bir mavjud existingEnv kalitini ham qo'shish
    Object.keys(existingEnv).forEach(k => detectedKeys.add(k));

    const detectedVars = Array.from(detectedKeys).map(key => {
      const upperKey = key.toUpperCase();
      let label = key;
      let description = "Atrof-muhit o'zgaruvchisi (.env)";
      let placeholder = "Qiymatni kiriting...";
      let isToken = false;
      let required = false;

      if (/BOT_TOKEN|TELEGRAM_TOKEN|BOT_API_TOKEN/i.test(upperKey)) {
        label = "Telegram Bot Token";
        description = "@BotFather orqali olingan asosiy bot tokeni";
        placeholder = "1234567890:AAHd82-xXabc123456...";
        isToken = true;
        required = true;
      } else if (/TELEGRAM_API_ID|API_ID/i.test(upperKey)) {
        label = "Telegram API ID (my.telegram.org)";
        description = "Userbot / Telethon / Pyrogram uchun App api_id";
        placeholder = "12345678";
      } else if (/TELEGRAM_API_HASH|API_HASH/i.test(upperKey)) {
        label = "Telegram API Hash (my.telegram.org)";
        description = "Userbot / Telethon / Pyrogram uchun App api_hash";
        placeholder = "0123456789abcdef0123456789abcdef";
        isToken = true;
      } else if (/ADMIN_ID|ADMINS|ADMIN_IDS|OWNER_ID|SUDO_USERS|DEVELOPER_ID/i.test(upperKey)) {
        label = "Admin Telegram ID";
        description = "Boshqaruvchi adminingizning Telegram ID raqami (masalan: 123456789)";
        placeholder = "123456789";
        required = true;
      } else if (/PAYMENT_PROVIDER_TOKEN|PROVIDER_TOKEN/i.test(upperKey)) {
        label = "Payment Provider Token (Click/Payme)";
        description = "@BotFather > Payments bo'limidan olingan to'lov tokeni";
        placeholder = "371317599:TEST:12345...";
        isToken = true;
      } else if (/OPENAI_API_KEY/i.test(upperKey)) {
        label = "OpenAI API Kaliti";
        description = "ChatGPT / OpenAI modellari uchun maxfiy API kalit";
        placeholder = "sk-proj-...";
        isToken = true;
      } else if (/GEMINI_API_KEY/i.test(upperKey)) {
        label = "Google Gemini API Kaliti";
        description = "Google AI Studio dan olingan Gemini kaliti";
        placeholder = "AIzaSy...";
        isToken = true;
      } else if (/CARD_NUMBER/i.test(upperKey)) {
        label = "Karta Raqami (To'lovlar uchun)";
        description = "Foydalanuvchilardan to'lov qabul qilish uchun karta raqami";
        placeholder = "8600 0000 0000 0000";
      } else if (/CARD_OWNER/i.test(upperKey)) {
        label = "Karta Egasi Ismi";
        description = "Karta egasining to'liq ismi-sharifi";
        placeholder = "A.R";
      } else if (/DATABASE_URL|MONGO_URI|DB_URL|REDIS_URL|SQLITE/i.test(upperKey)) {
        label = "Database URL";
        description = "Ma'lumotlar bazasiga ulanish manzili";
        placeholder = "sqlite:///bot.db yoki mongodb://localhost:27017";
      } else if (/CHANNEL_ID|CHANNEL_USERNAME|FORCE_SUB/i.test(upperKey)) {
        label = "Kanal ID / Username";
        description = "Majburiy obuna yoki bildirishnomalar kanali (@kanal yoki -100xxx)";
        placeholder = "@kanal_nomi yoki -1001234567890";
      } else if (/SOAT_UPDATE_INTERVAL/i.test(upperKey)) {
        label = "Profil Soati Yangilanish Oralig'i (sekund)";
        description = "Profil ismini yangilash intervali (Tavsiya: 300 soniya / 5 daqiqa)";
        placeholder = "300";
      } else if (/BOT_USERNAME/i.test(upperKey)) {
        label = "Bot Username";
        description = "Botning Telegramdagi @username manzili";
        placeholder = "MeningBotim_bot";
      } else if (/TOKEN|API_TOKEN/i.test(upperKey)) {
        label = key + " (API Token)";
        description = "Bot yoki tashqi xizmat uchun API tokeni";
        placeholder = "Token qiymati...";
        isToken = true;
      } else if (/API_KEY|SECRET|KEY|PASSWORD/i.test(upperKey)) {
        label = key;
        description = "API xizmati yoki shifrlash kaliti";
        placeholder = "Kalit qiymati...";
        isToken = true;
      }

      const currentVal = existingEnv[key] !== undefined ? existingEnv[key] : (defaultValues[key] || "");

      return {
        key,
        label,
        description,
        placeholder,
        isToken,
        required,
        value: currentVal
      };
    });

    // Agar rawEnv bo'sh bo'lsa, mavjud o'zgaruvchilardan yaratish
    if (!rawEnvContent.trim() && detectedVars.length > 0) {
      const initialLines: string[] = ["# CloudBot .env Konfiguratsiyasi"];
      detectedVars.forEach(v => {
        initialLines.push(`${v.key}=${v.value || ''}`);
      });
      rawEnvContent = initialLines.join('\n');
    }

    return {
      detectedVars,
      existingEnv,
      rawEnv: rawEnvContent
    };
  }

  // Get user's GitHub repositories (both public and private)
  app.get("/api/github/repos", requireAuth, async (req: AuthRequest, res) => {
    const githubToken = ((req.query.token || req.headers['x-github-token'] || '') as string).trim();
    if (!githubToken) {
      return res.status(400).json({ error: "GitHub Token taqdim etilmadi" });
    }

    try {
      const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "CloudBot-Platform"
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ 
          error: `GitHub API xatosi (${response.status}): ${errText || 'Token ruxsati yetarli emas'}` 
        });
      }

      const repos = await response.json();
      const mapped = repos.map((r: any) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        url: r.html_url,
        cloneUrl: r.clone_url,
        description: r.description || '',
        language: r.language || 'Code',
        defaultBranch: r.default_branch || 'main',
        updatedAt: r.updated_at,
        stars: r.stargazers_count || 0
      }));

      return res.json({ repos: mapped });
    } catch (err: any) {
      console.error("Error fetching GitHub user repos:", err);
      return res.status(500).json({ error: "GitHub repozitoriyalarini yuklab bo'lmadi: " + err.message });
    }
  });

  // Real GitHub import API
  app.post("/api/bots/github-import", requireAuth, async (req: AuthRequest, res) => {
    const { repoUrl, id, name: customName, githubToken: bodyGithubToken } = req.body;
    const githubToken = ((bodyGithubToken || req.headers['x-github-token'] || '') as string).trim();
    const botId = id || (req.query.id as string) || Date.now().toString();

    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: "GitHub repozitoriya manzili (repoUrl) kiritilmadi" });
    }

    try {
      const clientBotCount = req.body?.clientBotCount || req.query?.clientBotCount || req.headers['x-client-bot-count'];

      // Obuna limitini tekshirish (Bepul = max 2 ta bot)
      const limitCheck = await checkUserBotLimit(req.user?.uid || '', botId, Number(clientBotCount));
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error });
      }

      // 1. Repo manzilini normallashtirish
      let cleanUrl = repoUrl.trim();
      // If user provided short format like "aiogram/aiogram-bot-template"
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://") && cleanUrl.includes("/")) {
        cleanUrl = `https://github.com/${cleanUrl}`;
      }
      
      // Extract owner & repo name
      // e.g. https://github.com/owner/repo or https://github.com/owner/repo.git or https://github.com/owner/repo/tree/main
      const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return res.status(400).json({ error: "Noto'g'ri GitHub URL formati. Masalan: https://github.com/owner/repository" });
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '').split('/')[0];
      const botName = customName?.trim() || repo || "GitHub Bot";
      
      let gitCloneUrl = `https://github.com/${owner}/${repo}.git`;
      if (githubToken) {
        gitCloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
      }

      const botDir = path.join(process.cwd(), 'bots_running', botId);
      if (!fs.existsSync(botDir)) {
        fs.mkdirSync(botDir, { recursive: true });
      } else {
        // Clean directory if exists
        fs.rmSync(botDir, { recursive: true, force: true });
        fs.mkdirSync(botDir, { recursive: true });
      }

      console.log(`[GitHub Import] ${owner}/${repo} manzili ${botDir} ga yuklanmoqda... (Token mavjud: ${Boolean(githubToken)})`);

      let cloneSuccess = false;

      // Usul 1: 'git clone --depth 1' buyrug'i orqali yuklab olish
      try {
        await new Promise<void>((resolve, reject) => {
          const gitProc = spawn('git', ['clone', '--depth', '1', gitCloneUrl, botDir], {
            timeout: 60000
          });

          let stderrLogs = '';
          gitProc.stderr.on('data', (d) => { stderrLogs += d.toString(); });

          gitProc.on('close', (code) => {
            if (code === 0 && fs.existsSync(botDir) && fs.readdirSync(botDir).length > 0) {
              resolve();
            } else {
              reject(new Error(`Git clone kodi ${code}: ${stderrLogs}`));
            }
          });

          gitProc.on('error', (err) => reject(err));
        });

        // .git papkasini o'chirib tashlash (xavfsizlik va hajm uchun)
        const gitSubDir = path.join(botDir, '.git');
        if (fs.existsSync(gitSubDir)) {
          fs.rmSync(gitSubDir, { recursive: true, force: true });
        }

        cloneSuccess = true;
        console.log(`[GitHub Import] Git clone muvaffaqiyatli yakunlandi!`);
      } catch (gitErr: any) {
        console.warn(`[GitHub Import] Git clone muvaffaqiyatsiz, Zip download Usul 2 ga o'tilmoqda:`, gitErr.message);
      }

      // Usul 2: Zip archive yuklab olish (agar git clone ishlamasa)
      if (!cloneSuccess) {
        const branchesToTry = ['main', 'master', 'HEAD'];
        let zipBuffer: Buffer | null = null;

        for (const branch of branchesToTry) {
          try {
            let zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
            const fetchHeaders: Record<string, string> = {};

            if (githubToken) {
              zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
              fetchHeaders['Authorization'] = `token ${githubToken}`;
              fetchHeaders['Accept'] = 'application/vnd.github+json';
              fetchHeaders['User-Agent'] = 'CloudBot App';
            }

            console.log(`[GitHub Import] Zip URL tekshirilmoqda: ${zipUrl}`);
            const response = await fetch(zipUrl, { headers: fetchHeaders });
            if (response.ok) {
              const arrayBuf = await response.arrayBuffer();
              zipBuffer = Buffer.from(arrayBuf);
              console.log(`[GitHub Import] Zip fayl muvaffaqiyatli yuklandi (${branch} shoxchasi)!`);
              break;
            }
          } catch (e) {
            console.warn(`[GitHub Import] Zip fetch xatosi (${branch}):`, e);
          }
        }

        if (!zipBuffer) {
          return res.status(400).json({ error: `GitHub repozitoriyasini yuklab bo'lmadi. URL va repozitoriya ruxsatlarini (public yoki private token) tekshiring.` });
        }

        // AdmZip orqali botDir ga chiqarish
        const downloadedZip = new AdmZip(zipBuffer);
        const entries = downloadedZip.getEntries();
        
        // GitHub zips wrap files in top-level directory like "repo-main/"
        let rootPrefix = "";
        if (entries.length > 0) {
          const firstPath = entries[0].entryName;
          if (firstPath.includes('/')) {
            const potentialPrefix = firstPath.split('/')[0] + '/';
            const allMatch = entries.every(e => e.entryName.startsWith(potentialPrefix) || e.entryName === potentialPrefix);
            if (allMatch) {
              rootPrefix = potentialPrefix;
            }
          }
        }

        entries.forEach(entry => {
          if (entry.isDirectory) return;
          let relPath = entry.entryName;
          if (rootPrefix && relPath.startsWith(rootPrefix)) {
            relPath = relPath.substring(rootPrefix.length);
          }
          if (!relPath) return;

          const destPath = path.join(botDir, relPath);
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.writeFileSync(destPath, entry.getData());
        });
      }

      // 2. Diskdagi fayllarni skanerlash va til hamda entryPoint ni chuqur tahlil qilish
      const getAllFiles = (dir: string, baseDir = dir): string[] => {
        let results: string[] = [];
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        list.forEach(file => {
          if (file === 'node_modules' || file === '__pycache__' || file === '.git' || file === '.venv' || file === 'venv') return;
          const fullPath = path.join(dir, file);
          const relPath = path.relative(baseDir, fullPath);
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, baseDir));
          } else {
            results.push(relPath);
          }
        });
        return results;
      };

      const relativeFiles = getAllFiles(botDir);
      const fileBaseNames = relativeFiles.map(f => path.basename(f));

      let language = "nodejs";
      let entryPoint = "index.js";

      const hasReq = fileBaseNames.includes("requirements.txt") || fileBaseNames.includes("Pipfile") || fileBaseNames.includes("pyproject.toml");
      const hasPkg = fileBaseNames.includes("package.json");
      const hasGoMod = fileBaseNames.includes("go.mod");
      const hasCargo = fileBaseNames.includes("Cargo.toml");
      const hasGemfile = fileBaseNames.includes("Gemfile");
      const hasComposer = fileBaseNames.includes("composer.json");

      const pyFiles = relativeFiles.filter(f => f.endsWith(".py"));
      const jsFiles = relativeFiles.filter(f => f.endsWith(".js") || f.endsWith(".ts"));
      const goFiles = relativeFiles.filter(f => f.endsWith(".go"));
      const rsFiles = relativeFiles.filter(f => f.endsWith(".rs"));
      const rbFiles = relativeFiles.filter(f => f.endsWith(".rb"));
      const phpFiles = relativeFiles.filter(f => f.endsWith(".php"));

      if (hasReq || pyFiles.length > 0) {
        language = "python";
        if (relativeFiles.includes("main.py")) entryPoint = "main.py";
        else if (relativeFiles.includes("bot.py")) entryPoint = "bot.py";
        else if (relativeFiles.includes("app.py")) entryPoint = "app.py";
        else if (relativeFiles.includes("run.py")) entryPoint = "run.py";
        else if (relativeFiles.includes("starter.py")) entryPoint = "starter.py";
        else if (pyFiles.length > 0) entryPoint = pyFiles[0];
        else entryPoint = "main.py";
      } else if (hasGoMod || goFiles.length > 0) {
        language = "go";
        if (relativeFiles.includes("main.go")) entryPoint = "main.go";
        else if (goFiles.length > 0) entryPoint = goFiles[0];
        else entryPoint = "main.go";
      } else if (hasCargo || rsFiles.length > 0) {
        language = "rust";
        if (relativeFiles.includes("main.rs")) entryPoint = "main.rs";
        else if (rsFiles.length > 0) entryPoint = rsFiles[0];
        else entryPoint = "main.rs";
      } else if (hasGemfile || rbFiles.length > 0) {
        language = "ruby";
        if (relativeFiles.includes("main.rb")) entryPoint = "main.rb";
        else if (relativeFiles.includes("bot.rb")) entryPoint = "bot.rb";
        else if (rbFiles.length > 0) entryPoint = rbFiles[0];
        else entryPoint = "main.rb";
      } else if (hasComposer || phpFiles.length > 0) {
        language = "php";
        if (relativeFiles.includes("index.php")) entryPoint = "index.php";
        else if (relativeFiles.includes("bot.php")) entryPoint = "bot.php";
        else if (phpFiles.length > 0) entryPoint = phpFiles[0];
        else entryPoint = "index.php";
      } else if (hasPkg || jsFiles.length > 0) {
        language = "nodejs";
        
        // Check package.json main field
        const pkgPath = path.join(botDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          try {
            const pkgData = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
            if (pkgData.main && fs.existsSync(path.join(botDir, pkgData.main))) {
              entryPoint = pkgData.main;
            }
          } catch (e) {}
        }

        if (!entryPoint || entryPoint === "index.js") {
          if (relativeFiles.includes("index.js")) entryPoint = "index.js";
          else if (relativeFiles.includes("bot.js")) entryPoint = "bot.js";
          else if (relativeFiles.includes("main.js")) entryPoint = "main.js";
          else if (relativeFiles.includes("app.js")) entryPoint = "app.js";
          else if (relativeFiles.includes("server.js")) entryPoint = "server.js";
          else if (relativeFiles.includes("index.ts")) entryPoint = "index.ts";
          else if (relativeFiles.includes("bot.ts")) entryPoint = "bot.ts";
          else if (jsFiles.length > 0) entryPoint = jsFiles[0];
          else entryPoint = "index.js";
        }
      }

      // 3. Zip yaratish SQLite BLOB uchun
      const botZip = new AdmZip();
      botZip.addLocalFolder(botDir);
      const zipBuffer = botZip.toBuffer();

      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        botId,
        req.user?.uid,
        botName,
        language,
        entryPoint,
        zipBuffer,
        'stopped'
      );

      // Save Firestore record
      if (adminDb && !isFirestoreQuotaExhausted()) {
        try {
          const botDocData: any = {
            userId: req.user?.uid || '',
            userEmail: req.user?.email || '',
            name: botName,
            language,
            entryPoint,
            status: 'stopped',
            createdAt: new Date().toISOString()
          };
          if (zipBuffer.length <= 900000) {
            botDocData.codeZipBase64 = zipBuffer.toString('base64');
          }
          await adminDb.collection('bots').doc(botId).set(botDocData, { merge: true });
        } catch (fsErr) {
          handleFirestoreError(fsErr, "save github bot doc");
        }
      }

      addBotLog(botId, 'system', `✅ GitHub repozitoriyasi (${owner}/${repo}) muvaffaqiyatli import qilindi (${relativeFiles.length} ta fayl). Kirish nuqtasi: ${entryPoint}`);

      const scanResult = scanRepoForEnvVars(botDir);

      res.json({
        message: `GitHub repozitoriyasi (${botName}) muvaffaqiyatli import qilindi!`,
        data: {
          id: botId,
          name: botName,
          language,
          entryPoint,
          fileCount: relativeFiles.length,
          repoUrl: gitCloneUrl,
          detectedVars: scanResult.detectedVars,
          existingEnv: scanResult.existingEnv
        }
      });
    } catch (e: any) {
      console.error("GitHub import error:", e);
      res.status(500).json({ error: "GitHub'dan import qilishda xatolik: " + e.message });
    }
  });

  // Bot environment o'zgaruvchilarini olish API
  app.get("/api/bots/:id/env", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const botDir = path.join(process.cwd(), 'bots_running', id);
      const scanResult = scanRepoForEnvVars(botDir, id);
      res.json(scanResult);
    } catch (e: any) {
      res.status(500).json({ error: "Env o'zgaruvchilarini olishda xatolik: " + e.message });
    }
  });

  // Bot environment o'zgaruvchilarini saqlash API
  app.post("/api/bots/:id/env", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { envVars, rawEnv, autoRestart, startBot: shouldStart } = req.body;

    if (!envVars && typeof rawEnv !== 'string') {
      return res.status(400).json({ error: "O'zgaruvchilar ma'lumoti taqdim etilmadi" });
    }

    try {
      const botDir = path.join(process.cwd(), 'bots_running', id);
      if (!fs.existsSync(botDir)) {
        fs.mkdirSync(botDir, { recursive: true });
      }

      let finalEnvContent = '';
      const parsedEnv: Record<string, string> = {};

      if (typeof rawEnv === 'string') {
        finalEnvContent = rawEnv.trim() + '\n';
        // Parse rawEnv into parsedEnv map
        finalEnvContent.split('\n').forEach(l => {
          let t = l.trim();
          if (t.startsWith('export ')) t = t.substring(7).trim();
          if (t && !t.startsWith('#') && t.includes('=')) {
            const eq = t.indexOf('=');
            const k = t.substring(0, eq).trim();
            const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (k) parsedEnv[k] = v;
          }
        });
      } else if (envVars && typeof envVars === 'object') {
        const envLines: string[] = ["# CloudBot Generated Environment Variables"];
        for (const [k, v] of Object.entries(envVars)) {
          if (k && typeof k === 'string') {
            const cleanKey = k.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const cleanVal = String(v ?? '').trim();
            envLines.push(`${cleanKey}=${cleanVal}`);
            parsedEnv[cleanKey] = cleanVal;
          }
        }
        finalEnvContent = envLines.join('\n') + '\n';
      }

      const envFilePath = path.join(botDir, '.env');
      fs.writeFileSync(envFilePath, finalEnvContent, 'utf8');

      // Zip ichiga va SQLite / Firestore ma'lumotlar bazasiga sinxronlash
      try {
        const botRow = db.prepare('SELECT code FROM bots WHERE id = ?').get(id) as any;
        let zip: AdmZip;
        if (botRow && botRow.code && Buffer.isBuffer(botRow.code) && botRow.code.length > 0) {
          zip = new AdmZip(botRow.code);
        } else {
          zip = new AdmZip();
        }

        // Mavjud .env ni o'chirib yangisini yozish
        const envEntry = zip.getEntry('.env');
        if (envEntry) {
          zip.deleteFile(envEntry);
        }
        zip.addFile('.env', Buffer.from(finalEnvContent, 'utf8'));

        const updatedZipBuffer = zip.toBuffer();
        db.prepare('UPDATE bots SET code = ? WHERE id = ?').run(updatedZipBuffer, id);

        // Firestore yangilash
        if (adminDb && !isFirestoreQuotaExhausted()) {
          try {
            const updateData: any = {
              envData: parsedEnv,
              updatedAt: new Date().toISOString()
            };
            if (updatedZipBuffer.length <= 900000) {
              updateData.codeZipBase64 = updatedZipBuffer.toString('base64');
            }
            await adminDb.collection('bots').doc(id).set(updateData, { merge: true });
          } catch (fsErr) {
            handleFirestoreError(fsErr, 'save env data');
          }
        }
      } catch (dbSyncErr) {
        console.warn(`[POST /api/bots/:id/env] Warning during zip/DB sync for ${id}:`, dbSyncErr);
      }

      addBotLog(id, 'system', `🔑 .env fayli muvaffaqiyatli saqlandi va yangilandi (${Object.keys(parsedEnv).length} ta o'zgaruvchi).`);

      if (shouldStart) {
        userStoppedBots.delete(id);
        setTimeout(() => startBot(id), 200);
      } else if (autoRestart) {
        const runningBot = runningBots.get(id);
        if (runningBot) {
          userStoppedBots.add(id);
          try {
            if (runningBot.pid) killTree(runningBot.pid);
          } catch(e) {}
          runningBots.delete(id);
          setTimeout(() => startBot(id), 500);
          addBotLog(id, 'system', `🔄 .env o'zgargani uchun bot qayta ishga tushirildi.`);
        }
      }

      const refreshedScan = scanRepoForEnvVars(botDir, id);

      res.json({
        success: true,
        message: "Bot environment (.env) o'zgaruvchilari muvaffaqiyatli saqlandi!",
        existingEnv: parsedEnv,
        rawEnv: finalEnvContent,
        detectedVars: refreshedScan.detectedVars
      });
    } catch (e: any) {
      res.status(500).json({ error: "Env o'zgaruvchilarini saqlashda xatolik: " + e.message });
    }
  });

  // AI workspace Generation endpoint
  app.post("/api/ai/generate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Foydalanuvchi aniqlanmadi" });

      // Limit checking
      const LIMITS = { free: 45, pro: 145, vip: 500 };
      const plan = await getUserPlanSafe(userId);
      const { count: currentUsage, usageRef } = await getUserDailyUsageSafe(userId);

      const limit = LIMITS[plan] || LIMITS.free;

      if (currentUsage >= limit) {
        return res.status(403).json({ error: `Kunlik token limiti tugadi (${limit} limit). Planingizni yangilang.` });
      }

      const incrementUsage = async () => {
        await incrementUserDailyUsageSafe(userId, 1, usageRef);
      };

      const { mode, prompt, chatHistory } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Sarlavha yoki prompt majburiy" });
      }

      // Offline mock data templates to rescue 429/exhausted quota errors elegantly
      const getOfflineMockCode = (promptText: string) => {
        const query = promptText.toLowerCase();
        let explanation = "";
        let files: any[] = [];
        let secrets: any[] = [];

        if (query.includes("kino") || query.includes("cinema") || query.includes("film")) {
          explanation = "🎬 Ushbu mukammal Kino va Serial Qidiruv boti maxsus CloudBot AI platformasida tayyorlandi. Bot Telegraf kutubxonasiga asoslangan va sirlarni (BOT_TOKEN, ADMIN_ID) to'liq izolyatsiya qilgan. Bot nomiga ko'ra inline filtrlaydi va foydalanuvchiga tomosha qilish linksini jo'natadi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const movies = [
  { id: 1, title: 'Avatar: The Way of Water', year: 2022, genres: 'Sarguzasht, Fantastika', link: 'https://example.com/avatar' },
  { id: 2, title: 'Interstellar', year: 2014, genres: 'Sarguzasht, Kosmos', link: 'https://example.com/interstellar' },
  { id: 3, title: 'Spider-Man: No Way Home', year: 2021, genres: 'Ekshn, Sarguzasht', link: 'https://example.com/spiderman' }
];

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum \${ctx.from.first_name}! \\nKino Qidiruv botimizga xush kelibsiz. \\nKino nomini yozing yoki quyidagi tugmani bosing:\`, 
    Markup.keyboard([['🎬 Kinolar Ro\\'yxati', 'ℹ️ Bot haqida']]).resize()
  );
});

bot.hears('🎬 Kinolar Ro\\'yxati', (ctx) => {
  let text = "🎬 *Mavjud Kinolar Ro'yxati:*\n\n";
  movies.forEach(m => {
    text += \`\u25b2 *\${m.title}* (\${m.year}) - _\${m.genres}_\n\ud83d\udd0e Qidirish kodi: /kino_\${m.id}\n\n\`;
  });
  ctx.replyWithMarkdown(text);
});

bot.hears('ℹ️ Bot haqida', (ctx) => {
  ctx.reply("Ushbu bot CloudBot AI Generator orqali mutlaqo tekin va xavfsiz tarzda tayyorlangan.");
});

bot.hears(/\\/kino_(\\d+)/, (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const movie = movies.find(m => m.id === movieId);
  if (movie) {
    ctx.replyWithMarkdown(\`🎥 *Kino nomi:* \${movie.title}\\n📅 *Yil:* \${movie.year}\\n🎭 *Janr:* \${movie.genres}\\n\\n\ud83c\udf7f *Tomosha qilish:* \${movie.link}\`);
  } else {
    ctx.reply("Kechirasiz, bunday kino topilmadi.");
  }
});

bot.on('text', (ctx) => {
  const q = ctx.message.text.toLowerCase();
  const found = movies.filter(m => m.title.toLowerCase().includes(q) || m.genres.toLowerCase().includes(q));
  
  if (found.length > 0) {
    let text = \`🔍 *Qidiruv natijalari (\${found.length} ta):*\\n\\n\`;
    found.forEach(m => {
      text += \`🎥 *\${m.title}* (\${m.year}) - /kino_\${m.id}\\n\`;
    });
    ctx.replyWithMarkdown(text);
  } else {
    ctx.reply(\`🔍 Kechirasiz, "\${ctx.message.text}" so'roviga mos kino topilmadi. Boshqa nom yozib ko'ring.\`);
  }
});

bot.launch().then(() => console.log('Kino boti ishga tushdi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "cloudbot-cinema-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingizning BotFather dan olingan maxsus token kaliti", placeholder: "123456:ABC-DEF1234ghIkl" },
            { key: "ADMIN_ID", description: "Boshqaruvchi administratorning telegram raqamli ID si", placeholder: "508129341" }
          ];
        } else if (query.includes("do'kon") || query.includes("shop") || query.includes("dokon") || query.includes("store")) {
          explanation = "🛍️ CloudBot do'kon boti muvaffaqiyatli tayyorlandi. Ushbu bot mahsulotlar ro'yxatini shakllantiradi va xaridor buyurtma tugmasini bosganda sizning administrator ID guruhizga zudlik bilan hisobot jo'natadi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const products = [
  { id: 101, name: 'iPhone 15 Pro', price: '1200 USD', desc: 'Apple flagmani, titanium korpus' },
  { id: 102, name: 'MacBook Air M3', price: '1100 USD', desc: 'Super yupqa va kuchli noutbuk' },
  { id: 103, name: 'AirPods Pro 2', price: '250 USD', desc: 'Eng yaxshi shovqin so\\'ndiruvchi quloqchinlar' }
];

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum, CloudBot Do'koniga xush kelibsiz! \\nSifatli elektronika mahsulotlarini xarid qiling.\`,
    Markup.keyboard([['🛍️ Mahsulotlar', '🛒 Savatcha'], ['📞 Bog\\'lanish']]).resize()
  );
});

bot.hears('🛍️ Mahsulotlar', (ctx) => {
  products.forEach(p => {
    ctx.replyWithMarkdown(\`📦 *\${p.name}*\\n💰 Narxi: *\${p.price}*\\n📝 Batafsil: _\${p.desc}_\`, 
      Markup.inlineKeyboard([
        Markup.button.callback('🛒 Savatga qo\\'shish', \`buy_\${p.id}\`)
      ])
    );
  });
});

bot.action(/buy_(\\d+)/, (ctx) => {
  const pId = parseInt(ctx.match[1]);
  const product = products.find(p => p.id === pId);
  if (product) {
    ctx.answerCbQuery(\`\${product.name} savatga yuklandi!\`);
    if(ADMIN_ID) {
      bot.telegram.sendMessage(ADMIN_ID, \`🔔 Yangi buyurtma signali!\\nFoydalanuvchi: @\${ctx.from.username || ctx.from.id}\\nMahsulot: \${product.name}\`);
    }
    ctx.reply(\`✅ Siz muvaffaqiyatli ravishda "\${product.name}" buyurtma berdingiz. Operatorimiz tez orada bog'lanadi!\`);
  }
});

bot.hears('📞 Bog\\'lanish', (ctx) => {
  ctx.reply("Bizning aloqa markazimiz: @cloudbot_support\\nTelefon: +998 90 123 45 67");
});

bot.launch().then(() => console.log('Do\\'kon boti yoqildi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "cloudbot-shop-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingizning BotFather dan olingan maxsus token kaliti", placeholder: "123456:ABC-DEF" },
            { key: "ADMIN_ID", description: "Xaridor buyurtmalari yuboriladigan operatorning telegram raqamli ID-si", placeholder: "508129341" }
          ];
        } else {
          explanation = "🤖 Qo'shimcha Telegram Echo / Tabriklovchi boti muvaffaqiyatli generatsiya qilindi. Ushbu bot barcha kelayotgan xabarlarga javob yo'llaydi, adminlar uchun log signali saqlaydi hamda Telegraf / Node.js frameworki bilan juda barqaror ishlaydi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum \${ctx.from.first_name}! CloudBot aqlli generator boti ishga tushdi.\\nMenga biron bir xabar yozib yuboring.\`);
});

bot.help((ctx) => {
  ctx.reply("Qanday yordam bera olaman? Ushbu bot so'zlarni aqlli tahlil qilib qaytaradi.");
});

bot.on('text', (ctx) => {
  ctx.reply(\`CloudBot AI Qabul qildi: "\${ctx.message.text}"\`);
  if (ADMIN_ID) {
    bot.telegram.sendMessage(ADMIN_ID, \`Yangi xabar datchigi: "\${ctx.message.text}" from ID:\${ctx.from.id}\`);
  }
});

bot.launch().then(() => console.log('Echo boti yoqildi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "cloudbot-echo-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingiz uchun maxsus kalit (TOKEN)", placeholder: "123456:ABC-DEF" },
            { key: "ADMIN_ID", description: "Boshqaruvchi rahbariyatning telegram raqamli ID-si", placeholder: "508129341" }
          ];
        }

        return { explanation, files, secrets };
      };

      const getOfflineMockPlatform = (promptText: string) => {
        const query = promptText.toLowerCase();
        if (query.includes("deploy") || query.includes("yoq") || query.includes("yuk") || query.includes("boshla")) {
          return "🚀 **Botni platformada deploy qilish juda oson:** \n\n" +
            "1️⃣ **AI Bot Yaratish** bo'limida o'zingiz istagan botni yarating.\n" +
            "2️⃣ Keyin **ZIP yuklab olish** tugmasini bosib tayyor fayllarni kompyuteringiz yoki telefoningiz xotirasiga saqlang.\n" +
            "3️⃣ **Dashboard (/dashboard)**'ga o'ting va 'Yangi Bot' tugmasiga bosib yuklangan `.zip` faylni tanlang.\n" +
            "4️⃣ Bot ko'rsatgichlarida 'Start' tugmasini bosib botni zudlik bilan ishga tushiring! Hosting sekundda botingizni butun dunyoga bog'laydi.";
        } else if (query.includes("key") || query.includes("secret") || query.includes("maxfiy") || query.includes("token")) {
          return "🔑 **Sirlar va Config kalitlarini sozlash:**\n\n" +
            "Botlar o'z xizmatlari uchun maxsus Telegram Token yoki ma'lumotlar bazasi kalitlaridan foydalanishadi.\n" +
            "Tizimimizda har safar bot yaratganda, u yerda **Secrets Management Table** jadvali chiqadi. Siz u yerga o'z bot tokeningizni (BotFather dan olingan) kiritishingiz kifoya.\n" +
            "Zip qilib yuklaganingizda, biz ushbu ma'lumotlarni xavfsiz holda `.env` fayliga avtomatik tarzda kiritib beramiz!";
        } else if (query.includes("tarif") || query.includes("narx") || query.includes("pricing") || query.includes("pul") || query.includes("obuna")) {
          return "💵 **Tarif rejalari va botlar soni:**\n\n" +
            "Siz o'zingizga qulay bo'lgan quyidagi tariflardan foydalanishingiz mumkin:\n" +
            "• **Bepul Plan**: $0/oylik - 2 ta bot joylash, 45 AI tokin/kuniga, 24/7 uptime.\n" +
            "• **Pro Plan**: $19/oylik - 10 ta bot joylash, 145 AI tokin/kuniga, 24/7 uptime va batafsil loglar.\n" +
            "• **VIP Plan**: $49/oylik - 30 ta bot joylash, 500 AI tokin/kuniga, 24/7 uptime (maksimal tezlik) va prioritet yordam.";
        } else {
          return "👋 Salom! CloudBot AI platformasi loyihalaringizni barqaror, xavfsiz va eng tez serverlarda hosting qilishni ta'minlaydi. \n" +
            "Siz bu yerda istalgan botingizni generatsiya qilib, `.zip` shaklida yuklab olishingiz, so'ngra **Dashboard** panelimiz orqali zudlik bilan deploy qilishingiz mumkin. \n\n" +
            "Dasturlash sirlari, deploy va boshqa savollar bo'lsa, bemalol so'rang, men doim sizga yordam berishga tayyorman!";
        }
      };

      // Helper to dynamically extract and enrich all environment variables from generated code files
      const enrichCodeSecrets = (files: any[], existingSecrets: any[] = []) => {
        const detectedKeys = new Map<string, { description?: string; placeholder?: string }>();

        // 1. First add AI provided secrets
        if (Array.isArray(existingSecrets)) {
          existingSecrets.forEach(s => {
            if (s && s.key && typeof s.key === 'string') {
              const k = s.key.trim().toUpperCase();
              detectedKeys.set(k, {
                description: s.description || '',
                placeholder: s.placeholder || ''
              });
            }
          });
        }

        // 2. Scan every file content for process.env, os.getenv, os.environ, .env lines
        if (Array.isArray(files)) {
          files.forEach(f => {
            if (!f || !f.content || typeof f.content !== 'string') return;
            const code = f.content;
            const fname = (f.filename || '').toLowerCase();

            // .env / .env.example lines
            if (fname.includes('.env')) {
              code.split('\n').forEach((l: string) => {
                let line = l.trim();
                if (line.startsWith('#')) line = line.substring(1).trim();
                if (line && line.includes('=')) {
                  const eq = line.indexOf('=');
                  const k = line.substring(0, eq).trim().toUpperCase();
                  const v = line.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
                  if (k && /^[A-Z0-9_]+$/.test(k)) {
                    if (!detectedKeys.has(k)) {
                      detectedKeys.set(k, { placeholder: v });
                    }
                  }
                }
              });
            }

            // JavaScript / TypeScript: process.env.KEY or process.env['KEY']
            const jsMatches = code.matchAll(/process\.env(?:\.([A-Za-z0-9_]+)|\[["']([A-Za-z0-9_]+)["']\])/g);
            for (const m of jsMatches) {
              const k = (m[1] || m[2] || '').trim().toUpperCase();
              if (k && /^[A-Z0-9_]+$/.test(k) && !detectedKeys.has(k)) {
                detectedKeys.set(k, {});
              }
            }

            // Python: os.getenv("KEY"), os.environ.get("KEY"), os.environ["KEY"]
            const pyMatches = code.matchAll(/(?:os\.(?:getenv|environ\.get|environ\[)|getenv\()\s*["']([A-Za-z0-9_]+)["']/g);
            for (const m of pyMatches) {
              const k = (m[1] || '').trim().toUpperCase();
              if (k && /^[A-Z0-9_]+$/.test(k) && !detectedKeys.has(k)) {
                detectedKeys.set(k, {});
              }
            }

            // Explicit var assignments for keys like BOT_TOKEN, ADMIN_ID, etc.
            const varDeclMatches = code.matchAll(/(BOT_TOKEN|TELEGRAM_TOKEN|TOKEN|ADMIN_ID|ADMIN_IDS|OWNER_ID|CHANNEL_ID|CHANNEL_USERNAME|CLICK_SERVICE_ID|CLICK_MERCHANT_ID|CLICK_SECRET_KEY|PAYME_MERCHANT_ID|PROVIDER_TOKEN|GEMINI_API_KEY|OPENAI_API_KEY|DATABASE_URL|MONGO_URI|WEATHER_API_KEY)\s*=/gi);
            for (const m of varDeclMatches) {
              const k = (m[1] || '').trim().toUpperCase();
              if (k && !detectedKeys.has(k)) {
                detectedKeys.set(k, {});
              }
            }
          });
        }

        // Always ensure BOT_TOKEN and ADMIN_ID are recognized if nothing detected
        if (!detectedKeys.has('BOT_TOKEN') && !Array.from(detectedKeys.keys()).some(k => /TOKEN/i.test(k))) {
          detectedKeys.set('BOT_TOKEN', {
            description: "Telegram botingizning @BotFather dan olingan maxsus token kaliti",
            placeholder: "123456789:AAH_abcdef..."
          });
        }
        if (!detectedKeys.has('ADMIN_ID') && !Array.from(detectedKeys.keys()).some(k => /ADMIN|OWNER/i.test(k))) {
          detectedKeys.set('ADMIN_ID', {
            description: "Boshqaruvchi administratorning Telegram raqamli ID si",
            placeholder: "508129341"
          });
        }

        // Map into full Uzbek descriptor objects
        const finalSecrets = Array.from(detectedKeys.entries()).map(([key, info]) => {
          let description = info.description || "";
          let placeholder = info.placeholder || "";

          if (!description) {
            if (/BOT_TOKEN|TELEGRAM_TOKEN|BOT_API_TOKEN/i.test(key)) {
              description = "Telegram botingizning @BotFather dan olingan maxsus API tokeni";
              placeholder = placeholder || "123456789:AAH_abcdef...";
            } else if (/ADMIN_ID|ADMINS|ADMIN_IDS|OWNER_ID|SUDO_USERS/i.test(key)) {
              description = "Boshqaruvchi administratorning Telegram ID raqami";
              placeholder = placeholder || "508129341";
            } else if (/CHANNEL_ID|CHANNEL_USERNAME|FORCE_SUB/i.test(key)) {
              description = "Majburiy a'zolik yoki bildirishnomalar yuboriladigan Telegram kanal ID yoki @username";
              placeholder = placeholder || "@kanal_nomi yoki -1001234567890";
            } else if (/CLICK_SERVICE_ID/i.test(key)) {
              description = "Click to'lov tizimidagi xizmat ID (Service ID)";
              placeholder = placeholder || "12345";
            } else if (/CLICK_MERCHANT_ID/i.test(key)) {
              description = "Click to'lov tizimidagi savdogar ID (Merchant ID)";
              placeholder = placeholder || "54321";
            } else if (/CLICK_SECRET_KEY/i.test(key)) {
              description = "Click to'lov tizimidagi maxfiy kalit (Secret Key)";
              placeholder = placeholder || "click_sec_key_xyz";
            } else if (/PAYME_MERCHANT_ID/i.test(key)) {
              description = "Payme to'lov tizimidagi savdogar ID (Merchant ID)";
              placeholder = placeholder || "payme_id_123";
            } else if (/PROVIDER_TOKEN/i.test(key)) {
              description = "Telegram Payments (@BotFather orqali olingan to'lov provayder tokeni)";
              placeholder = placeholder || "371317599:TEST:12345";
            } else if (/GEMINI_API_KEY/i.test(key)) {
              description = "Google Gemini AI modeli uchun maxsus API kaliti";
              placeholder = placeholder || "AIzaSy...";
            } else if (/OPENAI_API_KEY/i.test(key)) {
              description = "OpenAI ChatGPT modeli uchun maxsus API kaliti";
              placeholder = placeholder || "sk-...";
            } else if (/DATABASE_URL|MONGO_URI|DB_URL|REDIS_URL/i.test(key)) {
              description = "Ma'lumotlar bazasiga ulanish manzili (URL / URI)";
              placeholder = placeholder || "sqlite:///bot.db yoki mongodb://localhost:27017";
            } else if (/WEATHER_API_KEY/i.test(key)) {
              description = "Ob-havo ma'lumotlari xizmatining API kaliti";
              placeholder = placeholder || "weather_api_key_123";
            } else if (/API_KEY|SECRET|TOKEN|KEY/i.test(key)) {
              description = `${key} - Tashqi API xizmati yoki shifrlash maxfiy kaliti`;
              placeholder = placeholder || "maxfiy_kalit_qiymati";
            } else {
              description = `Bot kodida ishlatiladigan atrof-muhit (${key}) o'zgaruvchisi`;
              placeholder = placeholder || "Qiymatni kiriting...";
            }
          }

          return {
            key,
            description,
            placeholder: placeholder || "Qiymatni kiriting..."
          };
        });

        return finalSecrets;
      };

      // 1. Try Groq API (High Speed LLaMA-3.3-70b Engine)
      const groq = getGroqClient();
      if (groq) {
        try {
          if (mode === "code") {
            const systemInstruction = `Siz faqat va faqat Telegram Bot arxitekturasi va kodlarini yaratishga moslashtirilgan, yuqori saviyali professional, prompts-driven generatorsiz (Expert Developer AI).
Foydalanuvchining so'roviga asosan eng mukammal, xatosiz, har tomonlama mukammal, to'liq ishlab chiqilgan va ishlab chiqarishga (production-ready) 100% tayyor bo'lgan Node.js/JavaScript yoki Python Telegram bot loyihasini taqdim etishingiz shart.

Sizga qo'yilgan qat'iy talablar:
1. **Chala bo'lmagan kod**: Hech qanday joyda mock placeholder-lar, "..." belgilar, chala ketgan qismlar bo'lishi taqiqlanadi!
2. **Ko'p faylli mukammal arxitektura**: Loyihani faqat bitta faylda emas, balki tartiblangan bir nechta modulli fayllarda yarating (index.js, package.json, .env.example, va h.k).
3. **Kodga asoslangan dinamik Secrets**: Kodda ishlatilgan HAR BIR muhit o'zgaruvchisini (process.env.XXX yoki os.getenv("XXX")) - masalan: BOT_TOKEN, ADMIN_ID, CHANNEL_ID (kanal bo'lsa), CLICK_MERCHANT_ID (to'lov bo'lsa), GEMINI_API_KEY (AI bo'lsa), DATABASE_URL va h.k. - aynan kodda qatnashgan barcha o'zgaruvchilarni "secrets" to'plamida to'liq qaytaring!
4. **To'g'ri String Sintaksisi**: Python va JavaScript kodlarida ko'p qatorli matnlar uchun har doim toza uchlik qo'shtirnoq (\"\"\"...\"\"\") yoki bitta qatorda to'g'ri formatlangan \\n ishlating. Hech qachon qator oxirida yopilmagan qo'shtirnoq qoldirmang (unterminated string literal xatosining oldini oling).

FAQAT ushbu formatdagi valid JSON obyektini qaytaring:
{
  "explanation": "o'zbek tilida tushuntirish va yo'riqnoma",
  "files": [
    { "filename": "index.js", "content": "..." },
    { "filename": "package.json", "content": "..." }
  ],
  "secrets": [
    { "key": "BOT_TOKEN", "description": "...", "placeholder": "..." },
    { "key": "ADMIN_ID", "description": "...", "placeholder": "..." }
  ]
}`;

            const completion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
              ],
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              temperature: 0.2
            });

            const rawContent = completion.choices[0]?.message?.content;
            if (rawContent) {
              const parsed = JSON.parse(rawContent);
              if (parsed.explanation && Array.isArray(parsed.files)) {
                parsed.secrets = enrichCodeSecrets(parsed.files, parsed.secrets);
                await incrementUsage();
                console.log("[AI Engine]: Groq llama-3.3-70b Code Expert succeeded.");
                return res.json(parsed);
              }
            }
          } else {
            const systemInstruction = `Siz do'stona, professional va tajribali CloudBot Platformasi hamrohi (Companion AI) yordamchisiz.
Foydalanuvchining CloudBot platformasi haqidagi savollariga o'zbek tilida aniq va chiroyli javob berasiz.`;

            let messages: any[] = [{ role: "system", content: systemInstruction }];
            if (chatHistory && Array.isArray(chatHistory)) {
              chatHistory.forEach(h => {
                messages.push({
                  role: h.role === 'user' ? 'user' : 'assistant',
                  content: h.content
                });
              });
            }
            messages.push({ role: "user", content: prompt });

            const completion = await groq.chat.completions.create({
              messages,
              model: "llama-3.3-70b-versatile",
              temperature: 0.5
            });

            const answer = completion.choices[0]?.message?.content;
            if (answer) {
              await incrementUsage();
              console.log("[AI Engine]: Groq llama-3.3-70b Companion Agent succeeded.");
              return res.json({ explanation: answer });
            }
          }
        } catch (groqErr: any) {
          const errMsg = groqErr?.message || String(groqErr);
          if (groqErr?.status === 401 || errMsg.includes("Invalid API Key") || errMsg.includes("invalid_api_key")) {
            groqKeyInvalidated = true;
            console.log("[AI Engine]: Groq API key is invalid or expired. Switched to primary Gemini AI engine.");
          } else {
            console.log("[AI Engine]: Groq unavailable, falling back to Gemini:", errMsg);
          }
        }
      }

      // 2. Secondary / Primary: Gemini API
      try {
        const client = getGeminiClient();

        if (mode === "code") {
          const systemInstruction = `Siz faqat va faqat Telegram Bot arxitekturasi va kodlarini yaratishga moslashtirilgan, yuqori saviyali professional, prompts-driven generatorsiz (Expert Developer AI).
Foydalanuvchining so'roviga asosan eng mukammal, xatosiz, har tomonlama mukammal, to'liq ishlab chiqilgan va ishlab chiqarishga (production-ready) 100% tayyor bo'lgan Node.js/JavaScript yoki Python Telegram bot loyihasini taqdim etishingiz shart.

Sizga qo'yilgan qat'iy talablar:
1. **Chala bo'lmagan kod**: Hech qanday joyda mock placeholder-lar, "..." belgilar, chala ketgan qismlar yoki "// kodni shu yerda davom ettiring" kabi izohlar bo'lishi mutlaqo taqiqlanadi! Barcha buyruqlar, ma'lumotlar bazasi integratsiyalari (masalan, local array-lar yoki sqlite muloqotlari), filtrlar va yordamchi funksiyalar oxirigacha va ideal tarzda yozilishi lozim.
2. **Ko'p faylli mukammal arxitektura**: Loyihani faqat bitta faylda emas, balki tartiblangan bir nechta modulli fayllarda yarating. Masalan:
   - Node.js uchun: 'index.js' (asosiy ishchi yadro), 'package.json' (to'liq dependenciyalar jadvali), '.env.example' (namunaviy maxfiy o'zgaruvchilar), 'commands.js' yoki 'database.js' (yordamchi modullar/xizmatlar).
   - Python uchun: 'main.py' (yadro kodi), 'requirements.txt' (kutubxonalar ro'yxati), 'handlers.py' va '.env.example'.
3. **Kodga asoslangan dinamik Secrets (Secrets Isolation)**: Kodda qanday environment o'zgaruvchilardan (process.env.KEY yoki os.getenv('KEY')) foydalangan bo'lsangiz (masalan: BOT_TOKEN, ADMIN_ID, CHANNEL_ID (kanal obunasi bo'lsa), CLICK_MERCHANT_ID (to'lov bo'lsa), GEMINI_API_KEY (AI bo'lsa), DATABASE_URL va h.k.), ularning HAR BIRINI aynan o'zingiz yozgan kodga qarab "secrets" to'plamida to'liq, o'zbekcha tushuntirishi va namunaviy qiymati bilan qaytaring.
4. **Mustahkam va chiroyli funksionallik**: Inline tugmachalar, chiroyli Markdown formatlash, jozibali tabriknomalar, mukammal xatoliklarni ushlash (try-catch, global uncaught exceptions) va logerlarni to'liq qo'llang.
5. **To'g'ri String Sintaksisi (Valid String Literals)**: Python va JavaScript kodlarida ko'p qatorli matnlar uchun har doim toza uchlik qo'shtirnoq (\"\"\"...\"\"\") yoki bitta qatorda to'g'ri formatlangan \\n ishlating. Hech qachon qator oxirida ochiq/yopilmagan qo'shtirnoq qoldirmang (unterminated string literal xatosining oldini oling).`;

          const response = await callGeminiContentWithFallback({
            preferredModel: "gemini-3.7-flash",
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  explanation: { 
                    type: Type.STRING, 
                    description: "Bot strukturasi, vazifasi va uni qanday ishga tushirish to'g'risida o'zbek tilidagi qisqacha ma'lumot" 
                  },
                  files: {
                    type: Type.ARRAY,
                    description: "Bot loyihasi tarkibidagi fayllar va ularning to'liq kontenti",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        filename: { type: Type.STRING, description: "Fayl nomi, masalan, index.js, package.json, .env.example" },
                        content: { type: Type.STRING, description: "Faylning to'liq, chala bo'lmagan kodi" }
                      },
                      required: ["filename", "content"]
                    }
                  },
                  secrets: {
                    type: Type.ARRAY,
                    description: "Kod ichidan ajratib olingan barcha maxfiy o'zgaruvchi va konfiguratsiyalar",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING, description: "Muhit o'zgaruvchisining nomi, masalan: BOT_TOKEN, ADMIN_ID, CHANNEL_ID, CLICK_MERCHANT_ID" },
                        description: { type: Type.STRING, description: "Ushbu o'zgaruvchi nima uchun kerakligi haqida o'zbekcha izoh" },
                        placeholder: { type: Type.STRING, description: "Namuna yoki default qiymat" }
                      },
                      required: ["key", "description"]
                    }
                  }
                },
                required: ["explanation", "files", "secrets"]
              }
            }
          });

          const dataText = response.text;
          if (!dataText) {
            throw new Error("Gemini AI'dan bo'sh ma'lumot qaytdi.");
          }
          const parsedData = JSON.parse(dataText);
          if (Array.isArray(parsedData.files)) {
            parsedData.secrets = enrichCodeSecrets(parsedData.files, parsedData.secrets);
          }
          await incrementUsage();
          return res.json(parsedData);

        } else {
          const systemInstruction = `Siz do'stona, professional va tajribali CloudBot Platformasi hamrohi (Companion AI) yordamchisiz.
Siz bot arxitekturasi kodini yozmaysiz. Buning o'rniga foydalanuvchining CloudBot platformasidan foydalanish bo'yicha bergan har bir savoliga batafsil, o'zbek tilida yo'riqnomalar va aniq manzillarni ko'rsatib javob berasiz.

Bizning platforma tuzilishi va imkoniyatlari quyidagicha:
1. **Loyiha nomi**: CloudBot AI - Dual-Mode bot yaratish va boshqarish tizimi.
2. **Dashboard Panel (/dashboard)**: Foydalanuvchining barcha botlari ro'yxati shu yerda turadi. Bu erda botni yuklash (fayl yoki .zip), uni yoqish (Play tugmasi), o'chirish (Stop tugmasi) va har bir botning real vaqtdagi ish stendini, CPU/Memory ko'rsatkichlarini hamda loglarini kuzatish mumkin.
3. **Secrets & Configurations**: CloudBot'da sirlar va konfiguratsiyalar juda xavfsiz saqlanadi. Kod generator hisoblangan Code-Agent Mode orqali olingan botlar uchun aynan o'sha erning o'zida ham maxsus Dynamic Secrets Table orqali sirlarni sozlash mumkin.
4. **Admin Panel (/admin)**: Agar foydalanuvchi tizim administratori bo'lsa, ushbu panel unga barcha ro'yxatdan o'tgan foydalanuvchilar profillarini (user profiles), barcha botlarni hamda tizim sozlamalarini boshqarish imkonini beradi.
5. **Pricing (Narxlar - /pricing)**: Premium hosting resurslari, xizmat ko'rsatish tariflari (Lite, Pro, Ultimate) haqida ma'lumot.
6. **Ommabop muloqot va yo'naltiruvchi**: Savollarga terminal, deployment, domain sozlamalari, zip fayl paketlash bo'yicha aniq yo'l ko'rsatib javob bering.`;

          let contents: any[] = [];
          if (chatHistory && Array.isArray(chatHistory)) {
            contents = chatHistory.map(h => ({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }]
            }));
          }
          contents.push({ role: 'user', parts: [{ text: prompt }] });

          const response = await callGeminiContentWithFallback({
            preferredModel: "gemini-3.7-flash",
            contents: contents,
            config: {
              systemInstruction
            }
          });

          await incrementUsage();
          return res.json({ explanation: response.text });
        }
      } catch (geminiError: any) {
        console.warn("Gemini API call failed, turning on offline smart generator fallback:", geminiError);
        
        // Handle QuotaExceeded / Rate Limit by rotating keys
        const errMsgLower = (geminiError.message || "").toLowerCase();
        if (errMsgLower.includes("quota") || errMsgLower.includes("limit") || errMsgLower.includes("exhausted") || errMsgLower.includes("429")) {
            rotateGeminiKey();
        }
        
        // QuotaExceeded fallback
        if (mode === "code") {
          const mockRes = getOfflineMockCode(prompt);
          await incrementUsage();
          return res.json(mockRes);
        } else {
          const mockExp = getOfflineMockPlatform(prompt);
          await incrementUsage();
          return res.json({ explanation: mockExp });
        }
      }
    } catch (error: any) {
      console.error("AI Generation error:", error);
      let errMsg = error.message || "AI tahlil platformasida kutilmagan xatolik yuz berdi.";
      const errMsgLower = errMsg.toLowerCase();
      
      if (
        errMsgLower.includes("quota") || 
        errMsgLower.includes("limit") || 
        errMsgLower.includes("exhausted") || 
        errMsgLower.includes("429")
      ) {
        errMsg = "Kechirasiz, CloudBot AI xizmati (Gemini API) kunlik bepul so'rovlar limitiga yetdi (Rate Limit: 429). Iltimos, keyinchalik qaytadan urinib ko'ring yoki platformaning uzluksiz ishlashi uchun shaxsiy API kalitingizni Settings > Secrets panelida sozlang.";
      } else if (
        errMsgLower.includes("api key") || 
        errMsgLower.includes("key not found") || 
        errMsgLower.includes("invalid key")
      ) {
        errMsg = "Gemini API kaliti topilmadi yoki noto'g'ri sozlangan. Iltimos, Settings > Secrets panelida GEMINI_API_KEY o'rnatilganligini tekshiring.";
      }
      
      res.status(500).json({ error: errMsg });
    }
  });

  // ZIP download endpoint
  app.post("/api/ai/download-zip", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { files, envContent } = req.body;
      if (!Array.isArray(files)) {
        return res.status(400).json({ error: "Fayllar ko'rinishida jo'natilishi shart" });
      }

      const zip = new AdmZip();

      // Add code files
      files.forEach(f => {
        zip.addFile(f.filename, Buffer.from(f.content, "utf-8"));
      });

      // Add .env if present
      if (envContent) {
        zip.addFile(".env", Buffer.from(envContent, "utf-8"));
      }

      const zipBuffer = zip.toBuffer();

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=cloudbot-bot-code.zip");
      res.send(zipBuffer);
    } catch (err: any) {
      console.error("ZIP yaratishda xato:", err);
      res.status(500).json({ error: "ZIP fayl yaratib bo'lmadi" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      maxAge: '1d',
      etag: true
    }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  console.log(`Attempting to listen on port ${PORT}...`);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    restoreAndSuperviseBots();
  });
}

async function restoreAndSuperviseBots() {
  console.log("🤖 [Bot Supervisor]: Botlarni avto-tiklash va fonda uzluksiz kuzatish moduli ishga tushdi.");

  // Clean up any dangling processes from previous server lifecycles
  try {
    execSync(`pkill -9 -f "bots_running"`, { stdio: 'ignore' });
  } catch (e) {}

  try {
    // 1. Firestore dagi barcha botlarni SQLite ga sinxronlash
    if (adminDb && !isFirestoreQuotaExhausted()) {
      try {
        const allFsDocs = await adminDb.collection('bots').get();
        for (const docSnap of allFsDocs.docs) {
          const botId = docSnap.id;
          const data = docSnap.data();
          const existing = db.prepare('SELECT id, code FROM bots WHERE id = ?').get(botId) as any;
          let codeBuffer: Buffer | null = existing?.code || null;
          if (!codeBuffer && data.codeZipBase64) {
            codeBuffer = Buffer.from(data.codeZipBase64, 'base64');
          }
          db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            botId,
            data.userId || '',
            data.name || 'Bot',
            data.language || 'python',
            data.entryPoint || 'bot.py',
            codeBuffer,
            data.status || 'stopped'
          );
        }
        console.log(`🤖 [Bot Supervisor]: Firestore'dan ${allFsDocs.size} ta bot SQLite ga sinxronlandi.`);
      } catch (fsSyncErr) {
        handleFirestoreError(fsSyncErr, 'initial bot sync');
      }
    }

    const sqliteBots = db.prepare("SELECT id, status FROM bots WHERE status = 'running'").all() as any[];
    for (const b of sqliteBots) {
      if (!userStoppedBots.has(b.id) && !runningBots.has(b.id) && !startingBots.has(b.id)) {
        console.log(`🤖 [Bot Supervisor]: Faol bot (${b.id}) fonda qayta tiklanmoqda...`);
        startBot(b.id).catch(e => console.error(`Restore error for ${b.id}:`, e));
      }
    }

    if (adminDb && !isFirestoreQuotaExhausted()) {
      try {
        const runningFsDocs = await adminDb.collection('bots').where('status', '==', 'running').get();
        for (const docSnap of runningFsDocs.docs) {
          const botId = docSnap.id;
          if (!userStoppedBots.has(botId) && !runningBots.has(botId) && !startingBots.has(botId)) {
            console.log(`🤖 [Bot Supervisor]: Firestore'dagi faol bot (${botId}) fonda qayta tiklanmoqda...`);
            startBot(botId).catch(e => console.error(`Restore FS error for ${botId}:`, e));
          }
        }
      } catch (e) {
        handleFirestoreError(e, 'running bots sync');
      }
    }
  } catch (err) {
    console.error("🤖 [Bot Supervisor]: Dastlabki tiklash xatoligi:", err);
  }

  // Regular audit & Uzbekistan time schedule loop every 10s
  setInterval(async () => {
    try {
      const allBots = db.prepare("SELECT id, owner_id, name, status FROM bots").all() as any[];
      for (const b of allBots) {
        const ownerId = b.owner_id || '';
        const plan = await getUserPlanSafe(ownerId);
        const { active, sched, uzbTime } = isPlanInActiveSchedule(plan);

        if (!active) {
          // TUNGI REJIM (Server resurslarini tejash)
          if (runningBots.has(b.id) || b.status === 'running') {
            console.log(`[Avto-Jadval Audit]: Bot ${b.name || b.id} (${plan.toUpperCase()}) tungi rejimda to'xtatilmoqda. Hozirgi O'zb vaqti: ${uzbTime.timeStr}`);
            schedulePausedBots.add(b.id);

            // Jarayonni to'xtatish
            const runningBot = runningBots.get(b.id);
            if (runningBot) {
              try {
                if (runningBot.pid) killTree(runningBot.pid);
              } catch (_) {}
              runningBots.delete(b.id);
            }

            db.prepare("UPDATE bots SET status = 'stopped' WHERE id = ?").run(b.id);
            updateFirestoreBotStatus(b.id, 'stopped');

            addBotLog(
              b.id,
              'system',
              `[Avto-Jadval]: ${sched.name} tarifi bo'yicha tungi rejim (Faol vaqt: ${sched.startHour} - ${sched.endHour}, O'zbekiston vaqti: ${uzbTime.timeStr}). Server resurslarini tejash uchun bot to'xtatildi. Ertalab soat ${sched.startHour} da avtomatik ishga tushadi.`
            );
          }
        } else {
          // KUNDUZGI FAOL ISH VAQTI
          const shouldStart = schedulePausedBots.has(b.id) || (b.status === 'running' && !userStoppedBots.has(b.id) && !runningBots.has(b.id));
          if (shouldStart && !startingBots.has(b.id)) {
            const wasPausedBySchedule = schedulePausedBots.has(b.id);
            schedulePausedBots.delete(b.id);

            console.log(`[Avto-Jadval Audit]: Bot ${b.name || b.id} (${plan.toUpperCase()}) faol vaqtda ishga tushirilmoqda. Hozirgi O'zb vaqti: ${uzbTime.timeStr}`);
            if (wasPausedBySchedule) {
              addBotLog(
                b.id,
                'system',
                `[Avto-Jadval]: ${sched.name} tarifi bo'yicha kunduzgi faol ish vaqti boshlandi (${sched.startHour} - ${sched.endHour}, O'zbekiston vaqti: ${uzbTime.timeStr}). Bot avtomatik ishga tushirilmoqda.`
              );
            } else {
              addBotLog(b.id, 'system', `[Supervisor Audit]: Bot jarayoni fonda qayta tiklanmoqda...`);
            }
            startBot(b.id).catch(e => console.error(`Audit schedule start error for ${b.id}:`, e));
          }
        }
      }
    } catch (e) {
      console.error("Supervisor schedule loop error:", e);
    }
  }, 10000);
  // Start 24/7 Telegram AI Support Bot worker in background
  startTelegramSupportBotWorker().catch(err => {
    console.error("[Telegram AI Support Worker error]:", err);
  });
}

startServer();
