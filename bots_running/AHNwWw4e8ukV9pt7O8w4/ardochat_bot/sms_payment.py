
# CloudBot Auto-injected Global Error Handler
async def _cloudbot_error_handler(update, context):
    if not context.error:
        return
    err_str = str(context.error)
    err_type = type(context.error).__name__
    transient = ('httpx.ReadError', 'httpx.ConnectError', 'httpx.RemoteProtocolError', 'httpx.ReadTimeout', 'httpx.ConnectTimeout', 'httpx.TimeoutException', 'ReadError', 'ConnectError', 'RemoteProtocolError', 'ReadTimeout', 'ConnectTimeout', 'TimeoutException', 'TimedOut', 'NetworkError', 'RetryAfter')
    if any(t in err_str or t in err_type for t in transient):
        return
    import logging
    logging.warning(f"Bot handler notice: {context.error}")

"""
ArdoChat Bot — 📲 SMS orqali avtomatik to'lovni aniqlash.

G'OYASI: Ko'p kichik bizneslar bankdan kelgan SMS xabarlarini (yoki bank
ilovasining bildirishnomalarini) biror SMS-forwarder ilova/bot orqali
Telegram akkountiga yuboradi. Bu modul o'sha akkountga (Telethon userbot
sifatida, bir marta telefon+kod orqali login qilib) ulanadi va kiruvchi
xabarlardagi summani o'qib, mos keluvchi kutilayotgan to'lov so'rovini
(payments.py da yaratilgan, noyob "pay_amount"ga ega) avtomatik tasdiqlaydi.

XAVFSIZLIK HAQIDA MUHIM ESLATMA (o'ylab ko'ring, "sehr" emas):
  Agar ushbu akkauntga istalgan odam yozib, mos summani o'z ichiga olgan
  matn yuborsa (masalan shunchaki "1250 so'm" deb yozib qo'ysa), filtr
  qo'yilmagan bo'lsa, bot buni HAQIQIY to'lov deb qabul qilib qo'yishi
  mumkin. Shu sababli:
    1) Agar admin "sender_filter" (ishonchli manba: bank botining
       @username'i yoki SMS-forwarder ilovaning yuboruvchi ID'si)
       o'rnatgan bo'lsa — FAQAT o'sha manbadan kelgan xabarlar avtomatik
       hisoblanadi.
    2) Agar sender_filter bo'sh bo'lsa — xavfsizlik uchun bot HECH QACHON
       o'zi mustaqil kredit qilmaydi; buning o'rniga adminga "✅ Tasdiqlash"
       tugmasi bilan xabar yuboradi (xuddi qo'lda tasdiqlash rejimidagi
       kabi), chunki manba tekshirilmagan xabarga ishonib bo'lmaydi.
  Shu sabab, chinakam AVTOMATIK (tugma bosmasdan) ishlashi uchun admin
  sender_filter'ni albatta sozlashi tavsiya etiladi: /sms_filter buyrug'i.
"""
import logging
import re
from datetime import datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.constants import ParseMode
from telegram.ext import ContextTypes, CommandHandler
from telegram import Update

from config import TELEGRAM_API_ID, TELEGRAM_API_HASH, ADMIN_ID, SMS_PAYMENT_TTL_MINUTES
from storage import storage

logger = logging.getLogger(__name__)

TELETHON_AVAILABLE = True
try:
    from telethon import TelegramClient, events
    from telethon.sessions import StringSession
    from telethon.errors import (
        SessionPasswordNeededError,
        PhoneCodeInvalidError,
        PhoneCodeExpiredError,
        UnauthorizedError,
    )
except ImportError:
    TELETHON_AVAILABLE = False

    class UnauthorizedError(Exception):
        pass

# Summani "1 250 so'm", "1,250 сум", "1250UZS" kabi ko'rinishlardan topadi.
_AMOUNT_RE = re.compile(
    r"(\d[\d\s.,]{2,12}\d|\d{3,})\s*(so['\u02bc\u2019]?m|сум|сўм|uzs)",
    re.IGNORECASE,
)


def _extract_amounts(text: str):
    """Matndan topilgan barcha summalarni (int) ro'yxat qilib qaytaradi."""
    found = []
    for m in _AMOUNT_RE.finditer(text or ""):
        raw = m.group(1)
        digits = re.sub(r"[^\d]", "", raw)
        if digits:
            try:
                found.append(int(digits))
            except ValueError:
                pass
    return found


def sms_configured() -> bool:
    return TELETHON_AVAILABLE and bool(TELEGRAM_API_ID) and bool(TELEGRAM_API_HASH)


def sms_enabled_for(admin_id) -> bool:
    if admin_id is None:
        return False
    row = storage.get_sms_account(admin_id)
    return bool(row and row["enabled"] and row["session"])


def _require_admin(update: Update) -> bool:
    return ADMIN_ID is not None and update.effective_user.id == ADMIN_ID


# ------------------------------------------------------------- login oqimi --
_pending_clients = {}  # admin_id -> TelegramClient (login jarayonida)
_active_clients = {}  # admin_id -> TelegramClient (ulangan)
_registered = set()  # admin_id lar — event handler allaqachon ulangan


async def cmd_sms_ulash(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/sms_ulash <telefon> — bank SMS'lari keladigan akkauntga ulanishni boshlaydi."""
    if not _require_admin(update):
        return
    if not sms_configured():
        await update.message.reply_text(
            "\u26a0\ufe0f Bu funksiya sozlanmagan. .env fayliga TELEGRAM_API_ID va "
            "TELEGRAM_API_HASH (my.telegram.org'dan bepul olinadi) qo'shing."
        )
        return
    if not context.args:
        await update.message.reply_text(
            "Format: <code>/sms_ulash +998901234567</code>\n\n"
            "Bank SMS xabarlari (yoki SMS-forwarder ilovasi orqali) kelib "
            "turadigan Telegram akkountingiz raqamini kiriting.",
            parse_mode=ParseMode.HTML,
        )
        return
    phone = context.args[0].strip()
    client = TelegramClient(StringSession(), TELEGRAM_API_ID, TELEGRAM_API_HASH)
    await client.connect()
    try:
        sent = await client.send_code_request(phone)
    except Exception as e:
        await update.message.reply_text(f"\u26a0\ufe0f Kod yuborilmadi: {e}")
        await client.disconnect()
        return
    client._phone = phone
    client._phone_code_hash = sent.phone_code_hash
    _pending_clients[update.effective_user.id] = client
    await update.message.reply_text(
        "\U0001f4f2 Kod yuborildi. Endi: <code>/sms_kod 12345</code> deb, "
        "Telegram orqali kelgan kodni kiriting.",
        parse_mode=ParseMode.HTML,
    )


async def cmd_sms_kod(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/sms_kod <kod> — Telegram orqali kelgan tasdiqlash kodini kiritadi."""
    if not _require_admin(update):
        return
    admin_id = update.effective_user.id
    client = _pending_clients.get(admin_id)
    if client is None:
        await update.message.reply_text("Avval /sms_ulash <telefon> ni yuboring.")
        return
    if not context.args:
        await update.message.reply_text("Format: /sms_kod 12345")
        return
    code = context.args[0].strip()
    try:
        await client.sign_in(phone=client._phone, code=code, phone_code_hash=client._phone_code_hash)
    except SessionPasswordNeededError:
        await update.message.reply_text(
            "\U0001f512 Bu akkauntda 2 bosqichli parol yoqilgan. "
            "<code>/sms_parol parolingiz</code> deb yuboring.",
            parse_mode=ParseMode.HTML,
        )
        return
    except (PhoneCodeInvalidError, PhoneCodeExpiredError):
        await update.message.reply_text("\u26a0\ufe0f Kod noto'g'ri yoki eskirgan. /sms_ulash dan qayta boshlang.")
        _pending_clients.pop(admin_id, None)
        return
    except Exception as e:
        await update.message.reply_text(f"\u26a0\ufe0f Xatolik: {e}")
        return
    await _finish_login(update, admin_id)


async def cmd_sms_parol(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/sms_parol <parol> — 2 bosqichli tasdiqlash paroli (agar so'ralsa)."""
    if not _require_admin(update):
        return
    admin_id = update.effective_user.id
    client = _pending_clients.get(admin_id)
    if client is None:
        await update.message.reply_text("Avval /sms_ulash <telefon> ni yuboring.")
        return
    if not context.args:
        await update.message.reply_text("Format: /sms_parol parolingiz")
        return
    password = " ".join(context.args)
    try:
        await client.sign_in(password=password)
    except Exception as e:
        await update.message.reply_text(f"\u26a0\ufe0f Parol xato: {e}")
        return
    await _finish_login(update, admin_id)


async def _finish_login(update: Update, admin_id: int):
    client = _pending_clients.pop(admin_id, None)
    if client is None:
        return
    session_str = client.session.save()
    me = await client.get_me()
    await client.disconnect()
    storage.set_sms_session(admin_id, session_str)
    await update.message.reply_text(
        f"\u2705 Ulandi: <b>{me.first_name or ''}</b> ({me.phone or ''})\n\n"
        "Endi kiruvchi xabarlarni tinglash boshlanadi. Ishonchli manbani "
        "cheklash uchun (tavsiya etiladi):\n"
        "<code>/sms_filter @bank_bot_username</code>\n\n"
        "Holatni ko'rish: /sms_holati · O'chirish: /sms_ochirish",
        parse_mode=ParseMode.HTML,
    )
    await ensure_listener_running(admin_id)


async def cmd_sms_filter(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/sms_filter <@username|telefon|bo'sh> — faqat shu manbadan kelgan
    xabarlar avtomatik hisoblanadi. Bo'sh yuborilsa filtr o'chadi (xavfli:
    bunda hech narsa avtomatik kredit qilinmaydi, faqat adminga tasdiqlash
    uchun yuboriladi)."""
    if not _require_admin(update):
        return
    admin_id = update.effective_user.id
    value = " ".join(context.args).strip() if context.args else ""
    storage.set_sms_sender_filter(admin_id, value)
    if value:
        await update.message.reply_text(
            f"\u2705 Endi faqat <b>{value}</b> dan kelgan xabarlar avtomatik "
            "to'lov sifatida hisoblanadi.",
            parse_mode=ParseMode.HTML,
        )
    else:
        await update.message.reply_text(
            "\u2139\ufe0f Filtr o'chirildi. Xavfsizlik uchun endi hech qanday "
            "xabar o'z-o'zidan kredit qilinmaydi — mos summa topilsa ham, "
            "sizga (adminga) tasdiqlash tugmasi bilan yuboriladi."
        )


async def cmd_sms_holati(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _require_admin(update):
        return
    row = storage.get_sms_account(update.effective_user.id)
    if row is None or not row["session"]:
        await update.message.reply_text("\u274c Ulanmagan. /sms_ulash <telefon> orqali ulang.")
        return
    status = "\U0001f7e2 Yoqilgan" if row["enabled"] else "\u26aa O'chirilgan"
    filt = row["sender_filter"] or "(o'rnatilmagan — xavfsizlik uchun avto-kredit o'chiq)"
    await update.message.reply_text(
        f"{status}\n\U0001f4e5 Ishonchli manba: <code>{filt}</code>",
        parse_mode=ParseMode.HTML,
    )


async def cmd_sms_ochirish(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _require_admin(update):
        return
    admin_id = update.effective_user.id
    storage.clear_sms_session(admin_id)
    client = _active_clients.pop(admin_id, None)
    if client is not None:
        try:
            await client.disconnect()
        except Exception:
            pass
    _registered.discard(admin_id)
    await update.message.reply_text("\u2705 SMS avtomatik to'lov ulanishi o'chirildi.")


# --------------------------------------------------------------- tinglash --
async def _get_client(admin_id: int, session_str: str):
    client = _active_clients.get(admin_id)
    if client is None or not client.is_connected():
        client = TelegramClient(StringSession(session_str), TELEGRAM_API_ID, TELEGRAM_API_HASH)
        await client.connect()
        _active_clients[admin_id] = client
    return client


async def _notify_bot(context_bot, text: str, kb=None):
    if ADMIN_ID is None:
        return
    try:
        await context_bot.send_message(chat_id=ADMIN_ID, text=text, parse_mode=ParseMode.HTML, reply_markup=kb)
    except Exception as e:
        logger.warning("SMS: adminga xabar yuborilmadi: %s", e)


def _make_handler(admin_id: int, bot_ref):
    async def on_message(event):
        if not event.is_private:
            return
        row = storage.get_sms_account(admin_id)
        if row is None or not row["enabled"]:
            return

        sender_filter = (row["sender_filter"] or "").strip().lstrip("@")
        if sender_filter:
            sender = await event.get_sender()
            sender_username = (getattr(sender, "username", "") or "").lstrip("@")
            sender_phone = getattr(sender, "phone", "") or ""
            if sender_filter not in (sender_username, sender_phone):
                return  # ishonchsiz manba — e'tiborsiz qoldiramiz
            trusted = True
        else:
            trusted = False  # filtr yo'q — hech narsani avtomatik ishonib bo'lmaydi

        amounts = _extract_amounts(event.raw_text or "")
        if not amounts:
            return

        cutoff = datetime.now() - timedelta(minutes=SMS_PAYMENT_TTL_MINUTES)
        for amount in amounts:
            topup = storage.find_pending_topup_by_pay_amount(amount, method="card")
            if topup is None:
                continue
            try:
                created = datetime.fromisoformat(topup["created_at"])
            except Exception:
                created = datetime.now()
            if created < cutoff:
                continue  # muddati o'tgan so'rov — avtomatik hisoblanmaydi

            if trusted:
                storage.add_balance_som(topup["user_id"], topup["amount"])
                storage.set_topup_status(topup["id"], "approved_auto")
                if bot_ref is not None:
                    try:
                        await bot_ref.send_message(
                            chat_id=topup["user_id"],
                            text=(
                                f"\u2705 To'lovingiz avtomatik aniqlandi! "
                                f"{topup['amount']:,} so'm balansingizga qo'shildi.".replace(",", " ")
                            ),
                        )
                    except Exception:
                        pass
                    await _notify_bot(
                        bot_ref,
                        f"\U0001f7e2 <b>Avtomatik to'lov aniqlandi</b>\n"
                        f"\U0001f9fe So'rov: #{topup['id']}\n"
                        f"\U0001f464 User: <code>{topup['user_id']}</code>\n"
                        f"\U0001f4b5 Summa: {topup['amount']:,} so'm".replace(",", " "),
                    )
            else:
                # Manba tekshirilmagan — adminga qo'lda tasdiqlash tugmasi
                # bilan yuboramiz (payments.py dagi admin_topup_decision
                # callback'i bilan bir xil formatda ishlaydi).
                kb = InlineKeyboardMarkup([[
                    InlineKeyboardButton("\u2705 Tasdiqlash", callback_data=f"admin_topup:approve:{topup['id']}"),
                    InlineKeyboardButton("\u274c Rad etish", callback_data=f"admin_topup:reject:{topup['id']}"),
                ]])
                await _notify_bot(
                    bot_ref,
                    f"\U0001f7e1 <b>Mos summali xabar topildi (manba tasdiqlanmagan)</b>\n"
                    f"\U0001f9fe So'rov: #{topup['id']}\n"
                    f"\U0001f4b5 Summa: {topup['amount']:,} so'm\n".replace(",", " ") +
                    "Ishonchli manbani /sms_filter orqali sozlasangiz, "
                    "keyingi safar bu avtomatik bo'ladi.",
                    kb=kb,
                )
            return  # bitta xabarda faqat bitta so'rovga mos keladi, deb hisoblaymiz

    return on_message


async def ensure_listener_running(admin_id: int, bot_ref=None) -> bool:
    if not sms_configured():
        return False
    row = storage.get_sms_account(admin_id)
    if row is None or not row["session"]:
        return False
    if admin_id in _registered:
        return True
    client = await _get_client(admin_id, row["session"])
    handler = _make_handler(admin_id, bot_ref)
    client.add_event_handler(handler, events.NewMessage(incoming=True))
    _registered.add(admin_id)
    logger.info("SMS to'lov: tinglovchi ulandi admin=%s", admin_id)
    return True


async def start_all(storage_module, bot_ref=None):
    """Bot ishga tushganda (post_init) chaqiriladi."""
    if not sms_configured():
        return
    for row in storage.all_enabled_sms_accounts():
        try:
            await ensure_listener_running(row["admin_id"], bot_ref=bot_ref)
        except Exception as e:
            logger.warning("SMS to'lov: ulanmadi admin=%s: %s", row["admin_id"], e)


def register_handlers(app):
    """bot.py dan chaqiriladi: barcha /sms_* buyruqlarini ro'yxatga oladi."""
    app.add_handler(CommandHandler("sms_ulash", cmd_sms_ulash))
    app.add_handler(CommandHandler("sms_kod", cmd_sms_kod))
    app.add_handler(CommandHandler("sms_parol", cmd_sms_parol))
    app.add_handler(CommandHandler("sms_filter", cmd_sms_filter))
    app.add_handler(CommandHandler("sms_holati", cmd_sms_holati))
    app.add_handler(CommandHandler("sms_ochirish", cmd_sms_ochirish))
