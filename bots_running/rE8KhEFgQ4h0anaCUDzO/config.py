"""
ArdoChat Bot — konfiguratsiya.
Barcha sozlamalar .env fayldan o'qiladi (JSON fayllar ishlatilmaydi).
"""
import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
BOT_USERNAME = os.getenv("BOT_USERNAME", "ArdoChat_Bot").strip().lstrip("@")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
CARD_NUMBER = os.getenv("CARD_NUMBER", "9860 1901 1579 7283").strip()
CARD_OWNER = os.getenv("CARD_OWNER", "A.R").strip()

_admin_raw = os.getenv("ADMIN_ID", "").strip()
ADMIN_ID = int(_admin_raw) if _admin_raw.isdigit() else None

# "Profilga soat" (userbot) funksiyasi uchun — my.telegram.org saytidan
# OLINADIGAN shaxsiy ilova ma'lumotlari. Bo'sh qoldirilsa, "Profilga soat"
# funksiyasi o'chirilgan holatda qoladi (bot o'zi baribir to'liq ishlaydi).
_api_id_raw = os.getenv("TELEGRAM_API_ID", "").strip()
TELEGRAM_API_ID = int(_api_id_raw) if _api_id_raw.isdigit() else None
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "").strip()

# "Profilga soat" necha soniyada bir marta yangilanishi. MUHIM: bu qiymat
# juda kichik bo'lsa (masalan 60s), Telegram profil ismini juda tez-tez
# o'zgartirilyapti deb hisoblab FloodWait (uzoq muddatli cheklov) qo'yadi —
# aynan shu holatda "soat bir muddat ishlab, keyin muzlab qoladi". Shuning
# uchun standart qiymat endi 300s (5 daqiqa) — bu Telegram cheklovlariga
# tegib qolish ehtimolini SEZILARLI kamaytiradi. 60-120s oralig'ida sinab
# ko'rish mumkin, lekin qanchalik kichik bo'lsa, FloodWait shunchalik tez-tez
# va uzoqroq bo'lishi ehtimoli ortadi.
SOAT_UPDATE_INTERVAL = int(os.getenv("SOAT_UPDATE_INTERVAL") or "300")

# Telegram Payments provider token (Click/Payme/Uzcard — @BotFather > Payments
# bo'limidan olinadi). Bo'sh bo'lsa, karta to'lovlari admin tomonidan qo'lda
# tasdiqlanadi (haqiqiy, lekin avtomatik emas).
PAYMENT_PROVIDER_TOKEN = os.getenv("PAYMENT_PROVIDER_TOKEN", "").strip()

# SQLite fayli — barcha foydalanuvchi ma'lumotlari shu yerda DOIMIY saqlanadi
# (bot qayta ishga tushirilsa ham yo'qolmaydi). JSON ishlatilmaydi.
DB_PATH = os.getenv("DB_PATH", "ardochat.db").strip()

if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN topilmadi. .env faylini yarating (.env.example dan nusxa oling) "
        "va BOT_TOKEN qiymatini kiriting."
    )

BOT_NAME = "ArdoChat Bot"

# Pullik tarif (Pro) narxi (so'm/oy) — .env orqali o'zgartirish mumkin.
PRO_PRICE_MONTH = int(os.getenv("PRO_PRICE_MONTH") or "29000")

# === Tariflar ===
# "free" — ichki kalit (bazada shu nom bilan saqlanadi, eski foydalanuvchilar
# buzilmasin deb nomi o'zgartirilmadi), lekin foydalanuvchiga "Start" deb
# ko'rsatiladi. Start tarifida: 24/7 online, Profilga soat va Shpion rejimi
# YO'Q. Pro tarifida esa UCHALASI HAM bor + boshqa hammasi ham bor.
TARIFFS = {
    "free": {
        "label": "🆓 Start",
        "title": "Start",
        "price_month": 0,
        "auto_reply_limit": 50,
        "ai_daily_limit": 200,
        "ai_response_limit": 100,
        "referral_star": 1,
        # Pro-only funksiyalar:
        "soat_enabled": False,
        "online_enabled": False,
        "spy_enabled": False,
    },
    "pro": {
        "label": "💎 Pro",
        "title": "Pro",
        "price_month": PRO_PRICE_MONTH,
        "auto_reply_limit": 500,
        "ai_daily_limit": 1000,
        "ai_response_limit": 100,
        "referral_star": 3,
        "soat_enabled": True,
        "online_enabled": True,
        "spy_enabled": True,
    },
}

MIN_TOPUP_SOM = 1000

# === 📲 SMS orqali avtomatik to'lovni aniqlash ===
# Har bir "karta orqali to'ldirish" so'rovi uchun asosiy summaga qo'shiladigan
# tasodifiy "moslik kodi" oralig'i (masalan 1000 so'm so'ralsa, foydalanuvchiga
# 1050-1999 oralig'idagi noyob summa ko'rsatiladi — SMS kelganda AYNAN shu
# summa bo'yicha qaysi so'rovga tegishli ekani aniqlanadi).
SMS_PAYMENT_MATCH_MIN = int(os.getenv("SMS_PAYMENT_MATCH_MIN") or "50")
SMS_PAYMENT_MATCH_MAX = int(os.getenv("SMS_PAYMENT_MATCH_MAX") or "999")

# So'rov yaratilgandan keyin necha daqiqa ichida SMS kelsa hisoblanadi
# (undan keyin kelgan SMS'lar avtomatik moslashtirilmaydi — ekrandagi
# "5 daqiqa ichida to'lang" shu qiymatga mos bo'lishi kerak).
SMS_PAYMENT_TTL_MINUTES = int(os.getenv("SMS_PAYMENT_TTL_MINUTES") or "20")
