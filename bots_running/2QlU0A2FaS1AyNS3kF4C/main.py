import asyncio
import os
import logging
import re
import html
import urllib.parse
from datetime import datetime
from io import BytesIO
from aiogram.filters import CommandObject
from aiogram import Bot, Dispatcher, types, F
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    BufferedInputFile,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    LabeledPrice,
    PreCheckoutQuery,
    FSInputFile,
)
from openpyxl import Workbook
import config
import database as db
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()
ADMIN_IDS = config.ADMIN_IDS
CARD_NUMBER = config.CARD_NUMBER
CLICK_TOKEN = config.CLICK_TOKEN

# Gift bo'limi uchun rasm (bu yerga rasm URL manzili yoki file_id qo'ying)
# Misol: "photo/rasm.jpg" - rasm nomini va papka nomini tekshiring
GIFT_PHOTO_PATH = "photo/gift.jpg"

LEXICON = {
    "uz": {
        "insufficient_balance": "⚠️ Hisobingizda mablag' yetarli emas!\nIltimos, avval hisobingizni to'ldiring.",
        "topup_btn": "💰 Hisobni to'ldirish",
        "choose_payment": "To'lov turini tanlang:",
        "lang_btn": "🌐 Tilni o'zgartirish",
        "balance_pay": "💰 Balansdan to'lash",
        "receipt_sent": "✅ Chekingiz adminlarga yuborildi. Tasdiqlanishini kuting.",
        "welcome": "👋 Assalom alaykum, {name}! Botga xush kelibsiz!\n\n🛒 Bot orqali «⭐️ Telegram Stars» va «💎 Telegram Premium» larni xarid qilishingiz mumkin\n\nQuyidagi menyudan keraklisini tanlang 👇",
        "profile_join": "📅 Qo'shilgan vaqti",
        "share_text": "Sizga arzon stars yoki premium kerakmi? Botga qo'shiling!",
        "share_btn": "🔗 Do'stlarga yuborish",
    },
    "ru": {
        "insufficient_balance": "⚠️ На вашем счету недостаточно средств!\nПожалуйста, сначала пополните счет.",
        "topup_btn": "💰 Пополнить баланс",
        "choose_payment": "Выберите способ оплаты:",
        "lang_btn": "🌐 Сменить язык",
        "balance_pay": "💰 Оплатить с баланса",
        "receipt_sent": "✅ Ваш чек отправлен админам. Ожидайте подтверждения.",
        "welcome": "👋 Здравствуйте, {name}! Добро пожаловать в бот!\n\n🛒 Через бот вы можете приобрести «⭐️ Telegram Stars» и «💎 Telegram Premium»\n\nВыберите нужное из меню ниже 👇",
        "profile_join": "📅 Дата регистрации",
        "share_text": "Вам нужны дешевые Stars или Premium? Присоединяйтесь к боту!",
        "share_btn": "🔗 Отправить друзьям",
    },
}


async def get_lang(user_id):
    user = await db.get_user_data(user_id)
    return user[5] if user and len(user) > 5 else "uz"


def t(lang, key):
    return LEXICON.get(lang, LEXICON["uz"]).get(key, key)


class BuyState(StatesGroup):
    waiting_star_amount = State()
    waiting_username = State()
    waiting_payment_method = State()
    waiting_broadcast_msg = State()
    waiting_for_receipt = State()
    waiting_admin_password = State()
    waiting_order_id = State()
    waiting_balance_topup_amount = State()
    waiting_gift_type = State()


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


async def get_bot_disabled_state() -> bool:
    value = await db.get_setting("bot_disabled", "false")
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


async def set_bot_disabled_state(enabled: bool) -> None:
    await db.set_setting("bot_disabled", "1" if enabled else "0")


async def notify_if_bot_disabled(source) -> bool:
    if is_admin(source.from_user.id):
        return False

    if await get_bot_disabled_state():
        message = "Bot vaqtinchalik ishlamayapti. Admin tomonidan yoqilgunga qadar xizmat to'xtatilgan."
        if isinstance(source, types.CallbackQuery):
            await source.answer(message, show_alert=True)
        else:
            await source.answer(message)
        return True

    return False


def chunk_text(text: str, limit: int = 3000) -> list[str]:
    chunks = []
    current = text
    while len(current) > limit:
        split_at = current.rfind("\n", 0, limit)
        if split_at == -1:
            split_at = limit
        chunks.append(current[:split_at].strip())
        current = current[split_at:].strip()
    if current:
        chunks.append(current)
    return chunks


def build_orders_excel_bytes(orders) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Buyurtmalar"
    worksheet.append(
        [
            "ID",
            "Foydalanuvchi ID",
            "Username",
            "Qabul qiluvchi",
            "Xizmat",
            "Summa (tiyin)",
            "Holat",
            "Yaratilgan vaqt",
            "Buyurtma kodi",
        ]
    )

    for row in orders:
        worksheet.append(
            [
                row[0],
                row[1],
                row[2] or "",
                row[3] or "",
                row[4],
                row[5],
                row[6],
                row[7],
                row[8] or "",
            ]
        )

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def format_amount(amount_tiyin: int) -> str:
    so_m = amount_tiyin // 100
    tiyin = amount_tiyin % 100
    if tiyin:
        return f"{so_m:,d}.{tiyin:02d} so'm"
    return f"{so_m:,d} so'm"


def is_balance_topup_order(order) -> bool:
    return bool(order) and str(order[3]).strip().lower() == "balance top-up"


def extract_order_id_from_payload(payload) -> int | None:
    if payload is None:
        return None

    payload = str(payload).strip()
    matches = re.findall(r"\d+", payload)
    if not matches:
        return None

    return int(matches[-1])


def balance_topup_method_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            # [
            #     InlineKeyboardButton(
            #         text="💳 Click orqali to'ldirish", callback_data="topup_click"
            #     )
            # ],
            [
                InlineKeyboardButton(
                    text=" Karta orqali qo'lda to'ldirish",
                    callback_data="topup_manual",
                )
            ],
            [
                InlineKeyboardButton(
                    text="⬅️ Profilga qaytish", callback_data="my_profile"
                )
            ],
        ]
    )


def profile_actions_markup(share_url: str, share_btn_text: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="💰 Hisobni to'ldirish", callback_data="profile_topup"
                )
            ],
            [
                InlineKeyboardButton(
                    text=share_btn_text,
                    url=share_url,
                )
            ],
            [
                InlineKeyboardButton(
                    text="🌐 Tilni o'zgartirish / Сменить язык",
                    callback_data="change_lang",
                )
            ],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")],
        ]
    )


def admin_panel_markup(bot_disabled: bool) -> InlineKeyboardMarkup:
    status_label = "✅ Botni yoqish" if bot_disabled else "🛑 Botni o'chirish"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=status_label,
                    callback_data="admin_toggle_bot",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📋 Buyurtmalar holati",
                    callback_data="admin_show_statuses",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📊 Buyurtmalarni Excelga chiqarish",
                    callback_data="admin_export_excel",
                )
            ],
            [
                InlineKeyboardButton(
                    text="👥 Barcha foydalanuvchilar",
                    callback_data="admin_show_users",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔍 Buyurtma ID orqali qidiruv",
                    callback_data="admin_lookup_order",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📅 Kunlik top xaridorlar",
                    callback_data="admin_top_spenders",
                )
            ],
        ]
    )


def format_user_list(users) -> str:
    lines = ["👥 Barcha foydalanuvchilar:", ""]
    for user in users:
        user_id, username, referred_by, balance_tiyin, joined_at = user
        lines.append(
            f"• ID: {user_id} | Username: {username or '—'} | Balans: {format_amount(balance_tiyin)} | Qo'shilgan: {joined_at}"
        )
    return "\n".join(lines)


def format_order_status_line(order) -> str:
    order_id, user_id, target_user, service_type, amount_tiyin, status, created_at = (
        order[:7]
    )
    return (
        f"• #{order_id} | @{target_user or user_id} | {service_type} | "
        f"{format_amount(amount_tiyin)} | {status} | {created_at}"
    )


def build_order_status_text(status_orders: dict[str, list]) -> str:
    pending = status_orders.get("pending", [])
    paid = status_orders.get("paid", [])
    delivered = status_orders.get("delivered", [])
    rejected = status_orders.get("rejected", [])

    lines = [
        "📋 **Buyurtmalar holati**",
        "",
        f"⏳ Kutayotgan: {len(pending)}",
        f"✅ To'langan: {len(paid)}",
        f"🚚 Yuborilgan: {len(delivered)}",
        f"❌ Rad etilgan: {len(rejected)}",
        "",
    ]

    for status_name, orders in (
        ("pending", pending),
        ("paid", paid),
        ("delivered", delivered),
        ("rejected", rejected),
    ):
        if not orders:
            lines.append(f"{status_name.capitalize()}: yo'q")
            continue

        lines.append(f"{status_name.capitalize()} buyurtmalar:")
        for order in orders[:5]:
            lines.append(format_order_status_line(order))
        lines.append("")

    return "\n".join(lines).strip()


def format_order_details(order, user_orders=None) -> str:
    (
        order_id,
        user_id,
        target_user,
        service_type,
        amount_tiyin,
        status,
        created_at,
        *_,
    ) = order
    details = [
        "🔍 Buyurtma ma'lumotlari",
        f"ID: {order_id}",
        f"Foydalanuvchi ID: {user_id}",
        f"Username: {target_user or '—'}",
        f"Xizmat: {service_type}",
        f"Summa: {format_amount(amount_tiyin)}",
        f"Holat: {status}",
        f"Yaratilgan vaqt: {created_at}",
    ]

    if user_orders:
        details.append("\n🧾 Foydalanuvchi buyurtmalari:")
        for item in user_orders:
            item_id, item_service, item_amount, item_status, item_created_at = item
            details.append(
                f"• #{item_id} | {item_service} | {format_amount(item_amount)} | {item_status} | {item_created_at}"
            )

    return "\n".join(details)


STAR_PACKAGES = [
    (50, 10500),
    (75, 15750),
    (100, 21000),
    (150, 31500),
    (250, 52500),
    (350, 73500),
    (500, 105000),
    (750, 157500),
    (1000, 210000),
    (1500, 315000),
    (2500, 525000),
    (5000, 1050000),
    (10000, 2100000),
]

PREMIUM_OPTIONS = {
    "login": [
        (1, 40000),
        (12, 300000),
    ],
    "nologin": [
        (3, 169000),
        (6, 225000),
        (12, 406000),
    ],
}

GIFT_OPTIONS = [
    ("Heart", 3000),
    ("Teddy", 3000),
    ("Present", 5000),
    ("Rose", 5000),
    ("Cake", 10000),
    ("Flowers", 10000),
    ("Rocket", 10000),
    ("Trophy", 20000),
    ("Ring", 20000),
    ("Diamond", 20000),
]


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="⭐ Stars", callback_data="buy_stars")],
            [InlineKeyboardButton(text="💎 Premium", callback_data="buy_premium")],
            [InlineKeyboardButton(text="🎁 Gift", callback_data="buy_gift")],
            [
                InlineKeyboardButton(
                    text="📦 Buyurtmalar", callback_data="my_orders_menu"
                ),
                InlineKeyboardButton(text="👤 Profil", callback_data="my_profile"),
            ],
            [InlineKeyboardButton(text="❓ Yordam", callback_data="help_info")],
        ]
    )


@dp.message(F.text == "/panel")
async def cmd_panel(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    await state.clear()
    await message.answer("Admin panelga kirish parolini kiriting:")
    await state.set_state(BuyState.waiting_admin_password)


@dp.message(F.text == "/start")
async def cmd_start(message: types.Message, command: CommandObject = None):
    if await notify_if_bot_disabled(message):
        return

    user = await db.get_user_data(message.from_user.id)

    if not user:
        referrer_id = None
        if command and command.args and command.args.isdigit():
            referrer_id = int(command.args)

        await db.get_or_create_user(
            message.from_user.id, message.from_user.username, referrer_id
        )

        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🇺🇿 O'zbekcha", callback_data="set_lang_uz"
                    )
                ],
                [InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang_ru")],
            ]
        )
        return await message.answer("Tilni tanlang / Выберите язык:", reply_markup=kb)

    lang = user[5] if len(user) > 5 else "uz"
    await message.answer(
        t(lang, "welcome").format(name=message.from_user.full_name),
        reply_markup=main_menu(),
    )


@dp.message(BuyState.waiting_admin_password)
async def process_admin_password(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        await state.clear()
        return

    if message.text.strip() != config.ADMIN_PANEL_PASSWORD:
        await message.answer("Parol noto'g'ri. Qayta urinib ko'ring:")
        return

    await state.clear()
    try:
        await message.delete()
    except:
        pass

    disabled = await get_bot_disabled_state()
    await message.answer(
        f"✅ Admin panelga kirdingiz. Hozirgi holat: {'Oʻchirilgan' if disabled else 'Yoq'}",
        reply_markup=admin_panel_markup(disabled),
    )


@dp.callback_query(F.data == "admin_toggle_bot")
async def admin_toggle_bot(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    current = await get_bot_disabled_state()
    await set_bot_disabled_state(not current)
    new_state = await get_bot_disabled_state()
    await call.message.edit_text(
        f"✅ Admin panelga kirdingiz. Hozirgi holat: {'Oʻchirilgan' if new_state else 'Yoq'}",
        reply_markup=admin_panel_markup(new_state),
    )
    await call.answer("Bot holati yangilandi.")


@dp.callback_query(F.data == "admin_top_spenders")
async def admin_top_spenders(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return

    top_users = await db.get_top_spenders_today()
    if not top_users:
        return await call.answer(
            "Bugun hali xaridlar amalga oshirilmadi.", show_alert=True
        )

    text = "📅 **Bugungi top xaridorlar:**\n\n"
    for i, row in enumerate(top_users, 1):
        user_id, username, total = row
        text += f"{i}. {username or user_id} — {format_amount(total)}\n"

    await call.message.edit_text(
        text,
        reply_markup=admin_panel_markup(await get_bot_disabled_state()),
        parse_mode="Markdown",
    )
    await call.answer()


@dp.callback_query(F.data == "admin_export_excel")
async def admin_export_excel(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    orders = await db.get_all_orders()
    if not orders:
        return await call.answer("Hozircha buyurtmalar yo'q.", show_alert=True)

    excel_bytes = build_orders_excel_bytes(orders)
    await call.message.answer_document(
        BufferedInputFile(excel_bytes, filename="buyurtmalar.xlsx")
    )
    await call.answer("Excel fayl yuborildi.")


@dp.callback_query(F.data == "admin_show_statuses")
async def admin_show_statuses(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    status_orders = {
        "pending": await db.get_orders_by_status("pending", limit=5),
        "paid": await db.get_orders_by_status("paid", limit=5),
        "delivered": await db.get_orders_by_status("delivered", limit=5),
        "rejected": await db.get_orders_by_status("rejected", limit=5),
    }

    await call.message.edit_text(
        build_order_status_text(status_orders),
        reply_markup=admin_panel_markup(await get_bot_disabled_state()),
        parse_mode="Markdown",
    )
    await call.answer()


@dp.callback_query(F.data == "admin_show_users")
async def admin_show_users(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    users = await db.get_all_users_data()
    if not users:
        return await call.answer("Hozircha foydalanuvchilar yo'q.", show_alert=True)

    text = format_user_list(users)
    for chunk in chunk_text(text):
        await call.message.answer(chunk)
    await call.answer()


@dp.callback_query(F.data == "admin_lookup_order")
async def admin_lookup_order(call: types.CallbackQuery, state: FSMContext):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    await state.clear()
    await call.message.edit_text("🔍 Buyurtma ID ni kiriting:")
    await state.set_state(BuyState.waiting_order_id)
    await call.answer()


@dp.message(BuyState.waiting_order_id)
async def process_order_lookup(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        await state.clear()
        return

    if not message.text or not message.text.strip().isdigit():
        await message.answer("Iltimos, faqat buyurtma ID raqamini kiriting.")
        return

    order_id = int(message.text.strip())
    order = await db.get_order_by_id(order_id)
    if not order:
        await message.answer(f"{order_id} ID li buyurtma topilmadi.")
        await state.clear()
        return

    user_orders = await db.get_user_orders(order[1], limit=50)
    await message.answer(format_order_details(order, user_orders))
    await state.clear()


@dp.message(F.text == "/help")
async def cmd_help(message: types.Message):
    if await notify_if_bot_disabled(message):
        return

    await message.answer(
        "Yordam bo'limini ochish uchun /start ni bosing yoki menyudagi ❓ tugmani tanlang."
    )


@dp.message(F.text == "/stats")
async def admin_stats(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    today, total = await db.get_stats()
    today_count, today_sum = today
    total_count, total_sum = total
    msg = (
        f"📊 **Bot Statistikasi**\n\n"
        f"📅 **Bugun:**\n"
        f"   - Buyurtmalar: {today_count or 0} ta\n"
        f"   - Tushum: {format_amount(today_sum or 0)}\n\n"
        f"💰 **Jami:**\n"
        f"   - Buyurtmalar: {total_count or 0} ta\n"
        f"   - Tushum: {format_amount(total_sum or 0)}"
    )
    await message.answer(msg, parse_mode="Markdown")


@dp.message(F.text == "/pending")
async def admin_pending(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    orders = await db.get_orders_by_status("pending", limit=20)
    if not orders:
        return await message.answer("Hozircha kutayotgan buyurtmalar yo'q.")

    msg = "⏳ **Kutayotgan buyurtmalar:**\n\n"
    for order in orders:
        msg += f"ID: {order[0]} | @{order[2]} | {order[3]} | {format_amount(order[4])} | {order[6]}\n"
    await message.answer(msg, parse_mode="Markdown")


@dp.message(F.text == "/status")
async def admin_status(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    status_orders = {
        "pending": await db.get_orders_by_status("pending", limit=5),
        "paid": await db.get_orders_by_status("paid", limit=5),
        "delivered": await db.get_orders_by_status("delivered", limit=5),
        "rejected": await db.get_orders_by_status("rejected", limit=5),
    }

    await message.answer(build_order_status_text(status_orders), parse_mode="Markdown")


@dp.message(F.text == "/paid")
async def admin_paid(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    orders = await db.get_orders_by_status("paid", limit=20)
    if not orders:
        return await message.answer("Hozircha to'langan buyurtmalar yo'q.")

    msg = "✅ **To'langan buyurtmalar:**\n\n"
    for order in orders:
        msg += f"ID: {order[0]} | @{order[2]} | {order[3]} | {format_amount(order[4])} | {order[6]}\n"
    await message.answer(msg, parse_mode="Markdown")


@dp.callback_query(F.data == "my_profile")
async def show_profile(call: types.CallbackQuery):
    if await notify_if_bot_disabled(call):
        return

    user_id = call.from_user.id
    user_data = await db.get_user_data(user_id)
    if not user_data:
        return await call.answer("Xatolik: Profil topilmadi.")

    # joined_at bazada string formatida bo'ladi (CURRENT_TIMESTAMP)
    joined_at_str = user_data[4]
    lang = user_data[5]

    ref_count = await db.get_referral_count(user_id)
    balance = user_data[3]

    bot_info = await bot.get_me()
    ref_link = f"https://t.me/{bot_info.username}?start={user_id}"
    share_url = f"https://t.me/share/url?url={urllib.parse.quote(ref_link)}&text={urllib.parse.quote(t(lang, 'share_text'))}"

    # Sana formatini chiroyli qilish
    try:
        dt = datetime.strptime(joined_at_str, "%Y-%m-%d %H:%M:%S")
        formatted_date = dt.strftime("%d.%m.%Y %H:%M")
    except:
        formatted_date = joined_at_str

    profile_text = (
        f"👤 **Sizning profilingiz**\n\n"
        f"🆔 ID: `{user_id}`\n"
        f"💰 Balans: {format_amount(balance)}\n"
        f"👥 Taklif qilinganlar: {ref_count} ta\n\n"
        f"{t(lang, 'profile_join')}: `{formatted_date}`\n"
        f"Do'stlaringizni taklif qiling va ularning xarididan 5% bonus oling!"
    )

    await call.message.edit_text(
        profile_text,
        reply_markup=profile_actions_markup(share_url, t(lang, "share_btn")),
        parse_mode="Markdown",
    )
    await call.answer()


@dp.callback_query(F.data == "change_lang")
async def change_lang_menu(call: types.CallbackQuery):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🇺🇿 O'zbekcha", callback_data="set_lang_uz")],
            [InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang_ru")],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="my_profile")],
        ]
    )
    await call.message.edit_text("Tilni tanlang / Выберите язык:", reply_markup=kb)
    await call.answer()


@dp.callback_query(F.data.startswith("set_lang_"))
async def set_lang(call: types.CallbackQuery):
    lang = call.data.split("_")[-1]
    await db.set_user_language(call.from_user.id, lang)
    msg = "Til o'zgartirildi!" if lang == "uz" else "Язык изменен!"

    # Agar bu birinchi marta start bosilgandagi holat bo'lsa
    if call.message.text.startswith("Tilni tanlang"):
        await call.answer(msg)
        return await call.message.edit_text(
            t(lang, "welcome").format(name=call.from_user.full_name),
            reply_markup=main_menu(),
        )

    await call.answer(msg)
    await show_profile(call)


@dp.callback_query(F.data == "profile_topup")
async def profile_topup(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await state.clear()
    await call.message.edit_text(
        "💰 Hisobni to'ldirish uchun to'lov turini tanlang:",
        reply_markup=balance_topup_method_markup(),
    )
    await call.answer()


@dp.callback_query(F.data == "topup_click")
async def topup_click(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await state.update_data(topup_method="click")
    await call.message.edit_text(
        "💳 Click orqali to'ldirish uchun qancha so'm to'ldirmoqchisiz?\n\nMasalan: 50000"
    )
    await state.set_state(BuyState.waiting_balance_topup_amount)
    await call.answer()


@dp.callback_query(F.data == "topup_manual")
async def topup_manual(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await state.update_data(topup_method="manual")
    await call.message.edit_text(
        "📝 Karta orqali qo'lda to'ldirish uchun qancha so'm to'ldirmoqchisiz?\n\nMasalan: 50000"
    )
    await state.set_state(BuyState.waiting_balance_topup_amount)
    await call.answer()


@dp.message(BuyState.waiting_balance_topup_amount)
async def process_balance_topup_amount(message: types.Message, state: FSMContext):
    if await notify_if_bot_disabled(message):
        return

    raw_amount = message.text.strip().replace(" ", "")
    if not raw_amount.isdigit() or int(raw_amount) <= 1000:
        return await message.answer(
            "Iltimos, minimal 1000 so'mdan yuqori raqam kiriting."
        )

    amount_so_m = int(raw_amount)
    if amount_so_m > 100000000:
        return await message.answer("⚠️ Maksimal to'lov summasi 100,000,000 so'm.")

    amount_tiyin = amount_so_m * 100
    data = await state.get_data()
    method = data.get("topup_method")

    if method == "click":
        order_id, order_code, final_amount = await db.create_order(
            message.from_user.id,
            str(message.from_user.id),
            "Balance top-up",
            amount_tiyin,
            exact_amount_tiyin=amount_tiyin,
        )
        await bot.send_invoice(
            chat_id=message.chat.id,
            title="Hisobni to'ldirish",
            description=f"Hisobingizni {format_amount(final_amount)} miqdorida to'ldirish",
            provider_token=CLICK_TOKEN,
            currency="UZS",
            prices=[LabeledPrice(label="Hisobni to'ldirish", amount=int(final_amount))],
            payload=f"balance_topup_{order_id}",
            start_parameter=f"balance_topup_{order_id}",
        )
        await message.answer(
            f"💳 Click orqali to'lov yaratilindi!\n\nSumma: {format_amount(final_amount)}\nID: <code>{order_code}</code>\n\nClick ilovasi bo'lmaganda qo'lda to'lovni amalga oshiring va tekshirish tugmasini bosing.",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="✅ To'lovni tekshirish",
                            callback_data=f"verify_pay_{order_id}",
                        )
                    ]
                ]
            ),
        )
        await state.clear()
        return

    if method == "manual":
        # Unikal summa olish
        final_amount = await db.get_unique_pending_amount(amount_tiyin)
        order_id, order_code, final_amount = await db.create_order(
            message.from_user.id,
            str(message.from_user.id),
            "Balance top-up",
            amount_tiyin,  # base price
            exact_amount_tiyin=final_amount,  # unikal summa
        )
        await state.update_data(order_id=order_id, topup_flow=True)
        kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="✅ To'lovni tekshirish",
                        callback_data=f"verify_pay_{order_id}",
                    )
                ],
                [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="my_profile")],
            ]
        )
        await message.answer(
            f"<b>Hisob to'ldirish uchun buyurtma yaratildi:</b>\n\n"
            f"Summa: {format_amount(final_amount)}\n"
            f"ID: <code>{order_code}</code>\n\n"
            f"To'lovni quyidagi karta raqamiga aniq summani o'tkazing:\n\n"
            f"<code>{CARD_NUMBER}</code>\n\n"
            "⚠️ <b>DIQQAT:</b> Summani o'zgartirmasdan, qanday bo'lsa shunday o'tkazing (tiyinlari bilan). Aks holda to'lov avtomatik aniqlanmaydi.",
            parse_mode="HTML",
            reply_markup=kb,
        )
        await state.set_state(BuyState.waiting_for_receipt)
        return

    await message.answer("To'lov turi aniqlanmadi. Qaytadan urinib ko'ring.")
    await state.clear()


@dp.message(F.text == "/myorders")
async def my_orders(message: types.Message):
    if await notify_if_bot_disabled(message):
        return

    orders = await db.get_user_orders(message.from_user.id)
    if not orders:
        return await message.answer("Sizda hali buyurtmalar yo'q.")

    msg = "📋 **Sizning oxirgi 5 ta buyurtmangiz:**\n\n"
    for order in orders:
        status_icon = (
            "✅" if order[3] == "paid" else "🚚" if order[3] == "delivered" else "⏳"
        )
        msg += f"{status_icon} **#{order[0]}** | {order[1]}\n💰 Summa: {format_amount(order[2])}\n🕒 Vaqt: {order[4]}\n\n"

    await message.answer(msg, parse_mode="Markdown")


@dp.message(F.text == "/broadcast")
async def cmd_broadcast(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return
    await message.answer("Barcha foydalanuvchilarga yuboriladigan xabarni kiriting:")
    await state.set_state(BuyState.waiting_broadcast_msg)


@dp.message(BuyState.waiting_broadcast_msg)
async def process_broadcast(message: types.Message, state: FSMContext):
    if not is_admin(message.from_user.id):
        return

    users = await db.get_all_users()
    count = 0
    await message.answer(
        f"Xabar yuborish boshlandi ({len(users)} ta foydalanuvchiga)..."
    )

    for user_id in users:
        try:
            await message.send_copy(chat_id=user_id)
            count += 1
            await asyncio.sleep(0.05)  # Telegram limitlariga rioya qilish
        except Exception as e:
            logger.error(f"Xabar yuborishda xato ({user_id}): {e}")

    await message.answer(f"Tayyor! {count} ta foydalanuvchiga xabar yetkazildi.")
    await state.clear()


@dp.callback_query(F.data == "my_orders_menu")
async def my_orders_menu(call: types.CallbackQuery):
    if await notify_if_bot_disabled(call):
        return

    await my_orders(call.message)


@dp.callback_query(F.data == "help_info")
async def help_handler(call: types.CallbackQuery):
    if await notify_if_bot_disabled(call):
        return

    help_text = (
        "❓ **Yordam va Yo'riqnoma**\n\n"
        "1️⃣ **Buyurtma berish:** Stars, Premium yoki Gift bo'limini tanlang.\n"
        "2️⃣ **Username:** Xizmatni qabul qiluvchi username'ni @ belgisiz kiriting.\n"
        "3️⃣ **To'lov:** Karta raqamiga summani tiyinli shaklda o'zgartirib o'tkazing.\n"
        "4️⃣ **Tasdiqlash:** 'To'lovni tekshirish' tugmasini bosing. Tizim to'lovni avtomatik aniqlaydi.\n\n"
        f"📍 To'lovlar 30 daqiqa ichida amalga oshirilishi shart. Aks holda unikal summa bekor qilinadi.\n\n"
        f"👤 Muammolar bo'yicha: [Admin](tg://user?id={ADMIN_IDS[0]})"
    )

    back_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")]
        ]
    )

    await call.message.edit_text(help_text, reply_markup=back_kb, parse_mode="Markdown")
    await call.answer()  # Answer the callback query


def star_menu() -> InlineKeyboardMarkup:
    buttons = []
    for amount, price in STAR_PACKAGES:
        buttons.append(
            InlineKeyboardButton(
                text=f"⭐ {amount} - {price:,} so'm",
                callback_data=f"star_{amount}_{price}",
            )
        )
    keyboard = [buttons[i : i + 2] for i in range(0, len(buttons), 2)]
    keyboard.append(
        [InlineKeyboardButton(text="✏️ Boshqa miqdor", callback_data="star_custom")]
    )
    keyboard.append(
        [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")]
    )
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def username_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="👤 O'zimga", callback_data="self_username")],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")],
        ]
    )


def premium_type_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Akkountga kirib", callback_data="premium_type_login"
                )
            ],
            [
                InlineKeyboardButton(
                    text="Akkountga kirmasdan", callback_data="premium_type_nologin"
                )
            ],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")],
        ]
    )


def premium_duration_menu(premium_type: str) -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton(
                text=f"{month} oy — {price:,} so'm",
                callback_data=f"premium_dur_{premium_type}_{month}_{price}",
            )
        ]
        for month, price in PREMIUM_OPTIONS[premium_type]
    ]
    keyboard.append(
        [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="buy_premium")]
    )
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def gift_menu_markup(is_girl_acc: bool = False) -> InlineKeyboardMarkup:
    buttons = []
    for code, price in GIFT_OPTIONS:
        final_price = price + 5000 if is_girl_acc else price
        buttons.append(
            InlineKeyboardButton(
                text=f"{code} | {final_price:,} so'm",
                callback_data=f"gift_{code}_{final_price}",
            )
        )
    keyboard = [buttons[i : i + 2] for i in range(0, len(buttons), 2)]
    keyboard.append(
        [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")]
    )
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@dp.callback_query(F.data == "buy_stars")
async def start_stars(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await state.clear()
    await call.message.edit_text(
        "Raqamlar bilan yuboring yoki kerakli miqdorni tanlang.\nMinimal: 50 ta\nMaksimal: 21378 ta",  # This will be a new message
        reply_markup=star_menu(),
    )


@dp.callback_query(F.data.startswith("star_"))
async def star_select(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    parts = call.data.split("_")
    if parts[1] == "custom":
        await state.set_state(BuyState.waiting_star_amount)
        msg = await call.message.edit_text(
            "Iltimos, star miqdorini raqam sifatida kiriting.\nMinimal: 50 ta, maksimal: 21378 ta."  # New message
        )
        await state.update_data(prompt_id=msg.message_id)
        await call.answer()
        return

    _, amount, price = parts
    price_tiyin = int(price) * 100
    await state.update_data(
        service=f"Telegram Stars - {amount} ta", base_price_tiyin=price_tiyin
    )
    msg = await call.message.edit_text(
        "Username kiriting yoki 👤 O'zimga tugmasini bosing:",
        reply_markup=username_keyboard(),
    )
    await state.update_data(prompt_id=msg.message_id)
    await state.set_state(BuyState.waiting_username)
    await call.answer()


@dp.message(BuyState.waiting_star_amount)
async def star_amount_input(message: types.Message, state: FSMContext):
    if await notify_if_bot_disabled(message):
        return

    if not message.text.isdigit():
        return await message.answer("Iltimos, faqat raqam kiriting!")

    amount = int(message.text)
    if amount < 50 or amount > 21378:
        return await message.answer(
            "Minimal 50 ta, maksimal 21378 ta. Iltimos, miqdorni qayta kiriting."
        )

    data = await state.get_data()
    if "prompt_id" in data:
        try:
            await bot.delete_message(
                message.chat.id, data["prompt_id"]
            )  # Botning oldingi so'rovini o'chirish
        except:
            pass

    price_tiyin = amount * 210 * 100
    await state.update_data(
        service=f"Telegram Stars - {amount} ta", base_price_tiyin=price_tiyin
    )
    msg = await message.answer(
        "Username kiriting yoki 👤 O'zimga tugmasini bosing:",
        reply_markup=username_keyboard(),
    )
    await state.update_data(prompt_id=msg.message_id)
    await state.set_state(BuyState.waiting_username)


@dp.callback_query(F.data == "buy_premium")
async def premium_menu(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await state.clear()
    await call.message.edit_text(
        "Telegram Premium olish turini tanlang:",
        reply_markup=premium_type_menu(),  # New message
    )


@dp.callback_query(F.data.startswith("premium_type_"))
async def premium_type_select(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    premium_type = call.data.split("_")[-1]
    await state.update_data(service=f"Telegram Premium ({premium_type})")
    await call.message.edit_text(
        "Telegram Premium muddatini tanlang:",  # New message
        reply_markup=premium_duration_menu(premium_type),
    )


@dp.callback_query(F.data.startswith("premium_dur_"))
async def premium_duration_select(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    _, _, premium_type, month, price = call.data.split("_")
    price_tiyin = int(price) * 100
    await state.update_data(
        service=f"Telegram Premium {month} oy ({premium_type})",
        base_price_tiyin=price_tiyin,
    )
    msg = await call.message.edit_text(
        "Username kiriting yoki 👤 O'zimga tugmasini bosing:",
        reply_markup=username_keyboard(),
    )
    await state.update_data(prompt_id=msg.message_id)
    await state.set_state(BuyState.waiting_username)
    await call.answer()


@dp.callback_query(F.data == "buy_gift")
async def gift_menu(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="👤 Standart Akkaunt (Anonim)", callback_data="gift_acc_std"
                )
            ],
            [
                InlineKeyboardButton(
                    text="👩 Qiz Akkaunt", callback_data="gift_acc_girl"
                )
            ],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")],
        ]
    )
    await call.message.edit_text(
        "🎁 Gift yuborish uchun akkaunt turini tanlang:", reply_markup=kb
    )
    await call.answer()


@dp.callback_query(F.data.startswith("gift_acc_"))
async def gift_acc_type_handler(call: types.CallbackQuery, state: FSMContext):
    await call.answer()
    acc_type = call.data.split("_")[-1]
    is_girl = acc_type == "girl"
    await state.update_data(gift_acc_label="Qiz" if is_girl else "Standart")

    try:
        await call.message.delete()
    except:
        pass

    if os.path.exists(GIFT_PHOTO_PATH):
        await call.message.answer_photo(
            photo=FSInputFile(GIFT_PHOTO_PATH),
            caption=f"🎁 [{ 'Qiz akkaunt' if is_girl else 'Standart' }] Iltimos, yuboriladigan giftni tanlang:",
            reply_markup=gift_menu_markup(is_girl),
        )
    else:
        logger.warning(
            f"GIFT_PHOTO_PATH not found: {GIFT_PHOTO_PATH}. Sending text message instead."
        )
        await call.message.answer(
            f"🎁 [{ 'Qiz akkaunt' if is_girl else 'Standart' }] Iltimos, yuboriladigan giftni tanlang:",
            reply_markup=gift_menu_markup(is_girl),
        )


@dp.callback_query(F.data.startswith("gift_"), ~F.data.startswith("gift_acc_"))
async def gift_select(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    await call.answer()
    parts = call.data.split("_")

    if len(parts) < 3:
        return

    _, name, price = parts
    price_tiyin = int(price) * 100
    data = await state.get_data()
    acc_label = data.get("gift_acc_label", "Standart")

    await state.update_data(
        service=f"Gift ({acc_label}): {name}", base_price_tiyin=price_tiyin
    )
    text = "Username kiriting yoki 👤 O'zimga tugmasini bosing:"
    kb = username_keyboard()

    try:
        if call.message.photo:
            msg = await call.message.edit_caption(caption=text, reply_markup=kb)
        else:
            msg = await call.message.edit_text(text, reply_markup=kb)

        if msg:
            await state.update_data(prompt_id=msg.message_id)
    except Exception as e:
        logger.error(f"Error in gift_select edit: {e}")
        msg = await call.message.answer(text, reply_markup=kb)
        await state.update_data(prompt_id=msg.message_id)

    await state.set_state(BuyState.waiting_username)


async def process_username(
    username: str, state: FSMContext, message: types.Message, user_id: int
):
    if await notify_if_bot_disabled(message):
        return

    data = await state.get_data()

    if len(username) < 3 or " " in username:
        return await message.answer(
            "Iltimos, username-ni to'g'ri kiriting (masalan: @username)."
        )

    if username.lower().endswith("bot") and username.lower() != "@kasbli_admin":
        return await message.answer("Botlarga xizmat ko'rsatilmaydi.")

    verified_name = html.escape(username)
    try:
        chat = await bot.get_chat(username)
        is_gift = data.get("service", "").startswith("Telegram Gift")

        if chat.type == "channel" and not is_gift:
            return await message.answer("Kanalga faqat Gift yuborish mumkin.")
        elif chat.type in ["group", "supergroup"]:
            return await message.answer("Guruhlarga xizmat ko'rsatish imkoniyati yo'q.")

        if chat.full_name:
            verified_name = f"{html.escape(chat.full_name)} ({html.escape(username)})"
        elif chat.title:
            verified_name = f"{html.escape(chat.title)} ({html.escape(username)})"
    except:
        # Foydalanuvchi topilmasa ham davom etamiz (Telegram cheklovi bo'lishi mumkin)
        pass

    prompt_id = data.get("prompt_id")
    if prompt_id:
        try:
            await bot.delete_message(
                message.chat.id, prompt_id
            )  # Botning oldingi so'rovini o'chirish
            await state.update_data(prompt_id=None)  # prompt_id ni o'chirish
        except:
            pass

    await state.update_data(username=username)
    user_data = await db.get_user_data(user_id)
    balance = user_data[3] if user_data else 0
    price = data.get("base_price_tiyin", 0)
    lang = user_data[5] if user_data and len(user_data) > 5 else "uz"

    if balance >= price:
        buttons = [
            [
                InlineKeyboardButton(
                    text=f"{t(lang, 'balance_pay')} ({format_amount(balance)})",
                    callback_data="pay_balance",
                )
            ],
            # [InlineKeyboardButton(text="💳 Click", callback_data="pay_click")],
            [
                InlineKeyboardButton(
                    text="💳 Karta orqali to'lash", callback_data="pay_manual"
                )
            ],
        ]
        msg_text = (
            f"👤 Qabul qiluvchi: <b>{verified_name}</b>\n\n{t(lang, 'choose_payment')}"
        )
    else:
        # Balans yetarli bo'lmaganda faqat to'ldirish tugmasi chiqadi
        buttons = [
            [
                InlineKeyboardButton(
                    text=t(lang, "topup_btn"), callback_data="profile_topup"
                )
            ]
        ]
        msg_text = (
            f"👤 Qabul qiluvchi: <b>{verified_name}</b>\n"
            f"💰 Kerakli summa: {format_amount(price)}\n"
            f"💳 Sizning balansingiz: {format_amount(balance)}\n\n"
            f"{t(lang, 'insufficient_balance')}"
        )

    buttons.append(
        [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")]
    )
    payment_kb = InlineKeyboardMarkup(inline_keyboard=buttons)

    await message.answer(
        msg_text,
        reply_markup=payment_kb,
        parse_mode="HTML",
    )
    await state.set_state(BuyState.waiting_payment_method)


@dp.callback_query(BuyState.waiting_username, F.data == "self_username")
async def self_username_handler(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    username = call.from_user.username
    if not username:
        return await call.answer(
            "Sizda username o'rnatilmagan! Iltimos qo'lda kiriting.", show_alert=True
        )

    await call.answer()  # Loading animatsiyasini to'xtatish
    username = f"@{username}"
    await process_username(username, state, call.message, call.from_user.id)


@dp.message(BuyState.waiting_username)
async def get_username(message: types.Message, state: FSMContext):
    if await notify_if_bot_disabled(message):
        return

    raw_text = message.text.strip()
    # Username formatini to'g'rilash (agar @ bo'lmasa, o'zimiz qo'shamiz)
    username = raw_text if raw_text.startswith("@") else f"@{raw_text}"
    await process_username(username, state, message, message.from_user.id)


@dp.callback_query(F.data == "pay_balance")
async def pay_balance(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    data = await state.get_data()
    user_id = call.from_user.id
    user_data = await db.get_user_data(user_id)
    balance = user_data[3] if user_data else 0
    price = data["base_price_tiyin"]

    if balance < price:
        return await call.answer("Balansda mablag' yetarli emas!", show_alert=True)

    # Buyurtma yaratish va balansdan ayirish
    order_id, order_code, _ = await db.create_order(
        user_id, data["username"], data["service"], price
    )
    await db.add_user_balance(user_id, -price)
    await db.update_order_status(order_id, "paid")

    try:
        await call.message.delete()  # To'lov usulini tanlash xabarini o'chirish
    except Exception as e:
        logger.warning(f"Failed to delete message in pay_balance: {e}")

    # Referal bonusini berish
    await reward_referrer(user_id, price)

    await call.message.answer(
        f"✅ Balansdan to'landi! Buyurtma ID: {order_id}\nAdmin tez orada bajaradi."
    )

    # Admin uchun "Yubordim" tugmasi
    admin_deliver_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Yubordim",
                    callback_data=f"admin_deliver_order_{order_id}",
                )
            ]
        ]
    )
    await bot.send_message(
        ADMIN_IDS[0],
        f"💰 BALANSDAN TO'LOV!\nID: {order_id}\nUser: @{data['username']}\nXizmat: {data['service']}\nSumma: {format_amount(price)}",
        reply_markup=admin_deliver_kb,
        parse_mode="HTML",
    )
    await call.answer()
    await state.clear()


async def reward_referrer(user_id, base_price_tiyin):
    user = await db.get_user_data(user_id)
    if user and user[2]:  # user[2] is referred_by
        referrer_id = user[2]
        # 5% bonus (sozlamalardan olish ham mumkin)
        bonus = int(base_price_tiyin * 0.05)
        if bonus > 0:
            await db.add_user_balance(referrer_id, bonus)
            try:
                await bot.send_message(
                    referrer_id,
                    f"🎁 Sizga referal bonus kelib tushdi: {format_amount(bonus)}",
                )
            except:
                pass


@dp.callback_query(F.data == "pay_click")
async def pay_click(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    data = await state.get_data()
    if not data or "base_price_tiyin" not in data:
        return await call.answer(
            "Iltimos, buyurtma qilishingiz kerak.", show_alert=True
        )

    order_id, order_code, final_amount = await db.create_order(
        call.from_user.id,
        data["username"],
        data["service"],
        data["base_price_tiyin"],
    )
    await bot.send_invoice(
        chat_id=call.message.chat.id,
        title=data["service"],
        description=f"@{data['username']} uchun {data['service']} xarid qilish",
        provider_token=CLICK_TOKEN,
        currency="UZS",
        prices=[LabeledPrice(label=data["service"], amount=int(final_amount))],
        payload=f"order_{order_id}",
        start_parameter=f"order_{order_id}",
    )

    try:
        await call.message.delete()  # To'lov usulini tanlash xabarini o'chirish
    except Exception as e:
        logger.warning(f"Failed to delete message in pay_click: {e}")

    sent_message = await call.message.answer(
        f"Buyurtma yaratildi:\n\n"
        f"Turi: {data['service']}\n"
        f"Qabul qiluvchi: @{data['username']}\n"
        f"Summa: {format_amount(final_amount)}\n"
        f"ID: [{order_code}]\n\n"
        "Click ilovasi bo'lmaganda to'lovni qo'lda amalga oshiring va tekshirish tugmasini bosing.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="✅ To'lovni tekshirish",
                        callback_data=f"verify_pay_{order_id}",
                    )
                ]
            ]
        ),
    )
    await call.answer()
    await state.clear()


@dp.callback_query(F.data == "pay_manual")
async def pay_manual(call: types.CallbackQuery, state: FSMContext):
    if await notify_if_bot_disabled(call):
        return

    data = await state.get_data()
    if not data or "base_price_tiyin" not in data:
        return await call.answer(
            "Iltimos, buyurtma qilishingiz kerak.", show_alert=True
        )

    # Unikal summa olish
    final_amount = await db.get_unique_pending_amount(data["base_price_tiyin"])
    order_id, order_code, final_amount = await db.create_order(
        call.from_user.id,
        data["username"],
        data["service"],
        data["base_price_tiyin"],  # base price
        exact_amount_tiyin=final_amount,  # unikal summa
    )
    await state.update_data(order_id=order_id)  # Store order_id for receipt
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ To'lovni tekshirish",
                    callback_data=f"verify_pay_{order_id}",
                )
            ],
            [InlineKeyboardButton(text="⬅️ Orqaga", callback_data="back_to_main")],
        ]
    )
    await call.message.answer(
        f"<b>Buyurtma yaratildi:</b>\n\n"
        f"Turi: {html.escape(data['service'])}\n"
        f"Qabul qiluvchi: {html.escape(data['username'])}\n"
        f"Summa: {format_amount(final_amount)}\n"
        f"ID: <code>{order_code}</code>\n\n"
        f"To'lovni quyidagi karta raqamiga aniq summani o'tkazing:\n\n"
        f"<code>{CARD_NUMBER}</code>\n\n"
        "⚠️ <b>DIQQAT:</b> Summani o'zgartirmasdan, qanday ko'rsatilgan bo'lsa shunday o'tkazing. Aks holda to'lov avtomatik aniqlanmaydi.",
        parse_mode="HTML",
        reply_markup=kb,
    )
    try:
        await call.message.delete()  # To'lov usulini tanlash xabarini o'chirish
    except Exception as e:
        logger.warning(f"Failed to delete message in pay_manual: {e}")
    await state.set_state(BuyState.waiting_for_receipt)
    await call.answer()


@dp.message(BuyState.waiting_for_receipt)
async def process_receipt(message: types.Message, state: FSMContext):
    if await notify_if_bot_disabled(message):
        return

    data = await state.get_data()
    order_id = data.get("order_id")

    if not order_id:
        await message.answer(
            "Xatolik: Buyurtma topilmadi. Iltimos, qaytadan urinib ko'ring."
        )
        await state.clear()
        return

    if message.photo:
        receipt_file_id = message.photo[-1].file_id
    elif (
        message.document
        and message.document.mime_type
        and message.document.mime_type.startswith("image/")
    ):
        receipt_file_id = message.document.file_id
    else:
        return await message.answer("Iltimos, faqat rasm (skrinshot) yuboring.")

    order = await db.get_order_by_id(order_id)
    if not order:
        await message.answer(
            "Xatolik: Buyurtma topilmadi. Iltimos, qaytadan urinib ko'ring."
        )
        await state.clear()
        return

    user_info = await db.get_user_by_id(message.from_user.id)
    username = (
        user_info[1] if user_info and user_info[1] else message.from_user.full_name
    )

    admin_receipt_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Tasdiqlash",
                    callback_data=f"admin_approve_receipt_{order_id}",
                ),
                InlineKeyboardButton(
                    text="❌ Rad etish",
                    callback_data=f"admin_reject_receipt_{order_id}",
                ),
            ]
        ]
    )

    # Username va ismdagi maxsus belgilarni HTML uchun xavfsiz qilish
    safe_username = html.escape(str(username))
    safe_service = html.escape(str(order[3]))

    admin_msg_text = (
        f"🧾 <b>Yangi to'lov cheki!</b>\n\n"
        f"ID: <code>{order_id}</code>\n"
        f"Foydalanuvchi: {safe_username}\n"
        f"Xizmat: {safe_service}\n"
        f"Summa: {format_amount(order[4])}\n"
        f"Holat: Kutishda..."
    )

    if not ADMIN_IDS:
        logger.error("ADMIN_IDS topilmadi! .env faylni tekshiring.")
        return await message.answer(
            "Xatolik: Adminlar ro'yxati topilmadi. Iltimos, keyinroq urinib ko'ring."
        )

    try:
        # Adminlar ro'yxati bo'sh bo'lmasligini tekshirish
        if not ADMIN_IDS:
            raise ValueError("Admin IDs list is empty")

        admin_id = ADMIN_IDS[0]
        if message.photo:
            admin_message = await bot.send_photo(
                chat_id=admin_id,
                photo=receipt_file_id,
                caption=admin_msg_text,
                reply_markup=admin_receipt_kb,
                parse_mode="HTML",
            )
        else:
            admin_message = await bot.send_document(
                chat_id=admin_id,
                document=receipt_file_id,
                caption=admin_msg_text,
                reply_markup=admin_receipt_kb,
                parse_mode="HTML",
            )

        lang = await get_lang(message.from_user.id)
        msg = await message.answer(t(lang, "receipt_sent"))

        await db.update_order_receipt_info(
            order_id, receipt_file_id, admin_message.message_id, msg.message_id
        )
        await state.clear()
    except Exception as e:
        logger.error(f"Receipt notification error: {e}")
        await message.answer(
            "⚠️ Chek yuborildi, ammo adminlarga xabar berishda xatolik yuz berdi. "
            "Xavotir olmang, buyurtmangiz bazada saqlandi. Tez orada ko'rib chiqiladi."
        )
        await state.clear()


@dp.callback_query(F.data.startswith("admin_approve_receipt_"))
async def admin_approve_receipt(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    order_id = int(call.data.split("_")[3])
    order = await db.get_order_by_id(order_id)
    if not order:
        return await call.answer("Buyurtma topilmadi.", show_alert=True)

    if order[5] == "paid" or order[5] == "delivered":
        return await call.answer(
            "Bu buyurtma allaqachon tasdiqlangan/bajarilgan.", show_alert=True
        )

    await db.update_order_status(order_id, "paid")

    if is_balance_topup_order(order):
        await db.add_user_balance(order[1], order[4])
        user_msg = await bot.send_message(
            order[1],
            f"✅ Hisobingiz muvaffaqiyatli to'ldirildi!\nSumma: {format_amount(order[4])}",
        )
        await db.update_order_feedback_id(order_id, user_msg.message_id)
    else:
        await reward_referrer(order[1], order[4])  # Mukofotlash
        new_msg = await bot.send_message(
            order[1],
            f"✅ To'lov tasdiqlandi! Buyurtma ID: `{order_id}`. Admin tez orada xizmatni faollashtiradi.",
        )
        await db.update_order_feedback_id(order_id, new_msg.message_id)

    # "Chek yuborildi" xabarini o'chirish
    if len(order) > 9 and order[9]:
        try:
            await bot.delete_message(
                order[1], order[9]
            )  # Foydalanuvchining "chek yuborildi" xabarini o'chirish
        except:
            pass

    await call.message.edit_caption(
        caption=(call.message.caption or "") + "\n\n✅ Admin tomonidan tasdiqlandi.",
        reply_markup=None,  # Remove buttons
        parse_mode="HTML",
    )

    if not is_balance_topup_order(order):
        admin_deliver_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="✅ Yubordim",
                        callback_data=f"admin_deliver_order_{order_id}",
                    )
                ]
            ]
        )
        await bot.send_message(
            ADMIN_IDS[0],
            f"📦 <b>Buyurtmani yuboring:</b>\n\n"
            f"ID: <code>{order_id}</code>\n"
            f"Foydalanuvchi: {html.escape(str(order[2]))}\n"
            f"Xizmat: {html.escape(str(order[3]))}\n"
            f"Summa: {format_amount(order[4])}",
            reply_markup=admin_deliver_kb,
            parse_mode="HTML",
        )

    await call.answer("To'lov tasdiqlandi va foydalanuvchiga xabar berildi.")


@dp.callback_query(F.data.startswith("admin_reject_receipt_"))
async def admin_reject_receipt(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    order_id = int(call.data.split("_")[3])
    order = await db.get_order_by_id(order_id)
    if not order:
        return await call.answer("Buyurtma topilmadi.", show_alert=True)

    if order[5] == "paid" or order[5] == "delivered":
        return await call.answer(
            "Bu buyurtma allaqachon tasdiqlangan/bajarilgan.", show_alert=True
        )

    await db.update_order_status(order_id, "rejected")
    await bot.send_message(
        order[1],
        f"❌ To'lov chekingiz rad etildi. Iltimos, to'lovni to'g'ri amalga oshirganingizga ishonch hosil qiling va qaytadan urinib ko'ring yoki admin bilan bog'laning. Buyurtma ID: `{order_id}`.",
    )

    await call.message.edit_caption(
        caption=(call.message.caption or "") + "\n\n❌ Admin tomonidan rad etildi.",
        reply_markup=None,  # Remove buttons
        parse_mode="HTML",
    )
    await call.answer("To'lov rad etildi va foydalanuvchiga xabar berildi.")


@dp.callback_query(F.data.startswith("verify_pay_"))
async def check_payment(call: types.CallbackQuery):
    if await notify_if_bot_disabled(call):
        return

    await call.answer()  # Darhol yuklanishni to'xtatish

    try:
        order_id = int(call.data.split("_")[2])
        order = await db.get_order_by_id(order_id)
        if not order:
            return await call.answer("Buyurtma topilmadi.", show_alert=True)

        if order[1] != call.from_user.id:
            return await call.answer(
                "Siz ushbu buyurtma egasi emassiz.", show_alert=True
            )

        status = order[5]
        if status in ["paid", "delivered"]:
            return await call.message.edit_text(
                f"✅ To'lov tasdiqlandi!\nID: {order_id}\nHolat: {status.capitalize()}\n\nBalansingiz yangilandi yoki xizmat ko'rsatish jarayonida."
            )
        elif status == "pending_receipt_verification":
            return await call.message.answer(
                "⏳ Chekingiz adminlar tomonidan tekshirilmoqda. Iltimos, biroz kuting."
            )
        elif status == "rejected":
            return await call.message.answer(
                "❌ To'lov rad etilgan. Muammo bo'lsa admin bilan bog'laning."
            )

        # Agar holat pending bo'lsa, foydalanuvchiga tushuntirish
        await call.message.answer(
            "🔄 To'lov hali tizimda ko'rinmadi.\n\n"
            "Agar pul o'tkazgan bo'lsangiz:\n"
            "1. 1-2 daqiqa kuting (bank tizimi kechikishi mumkin).\n"
            "2. Summani tiyinlarigacha aniq o'tkazganingizni tekshiring.\n"
            "3. Baribir tasdiqlanmasa, to'lov chekini (skrinshot) shu yerga yuboring."
        )
    except Exception as e:
        logger.error(f"Error in check_payment: {e}")
        await call.answer(
            "Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", show_alert=True
        )


@dp.callback_query(F.data.startswith("admin_deliver_order_"))
async def admin_deliver_order(call: types.CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer("Sizda admin huquqlari yo'q.", show_alert=True)

    order_id = int(call.data.split("_")[3])
    order = await db.get_order_by_id(order_id)
    if not order:
        return await call.answer("Buyurtma topilmadi.", show_alert=True)

    if order[5] != "paid":
        return await call.answer("Buyurtma hali to'lanmagan.", show_alert=True)

    if await db.update_order_status(order_id, "delivered"):
        # "To'lov tasdiqlandi" xabarini o'chirish
        if len(order) > 9 and order[9]:
            try:
                await bot.delete_message(
                    order[1], order[9]
                )  # Foydalanuvchining "to'lov tasdiqlandi" xabarini o'chirish
            except:
                pass

        await bot.send_message(order[1], "🌟 Buyurtmangiz muvaffaqiyatli yuborildi!")
        await call.message.edit_text(call.message.text + "\n\n✅ BAJARILDI")
    else:
        await call.answer(
            "Buyurtma holatini yangilashda xatolik yuz berdi.", show_alert=True
        )


@dp.pre_checkout_query(lambda query: True)
async def pre_checkout_handler(pre_checkout_query: PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)


@dp.message(F.successful_payment)
async def successful_payment_handler(message: types.Message, state: FSMContext):
    if await notify_if_bot_disabled(message):
        return

    payment_info = message.successful_payment
    amount_tiyin = payment_info.total_amount
    payload = getattr(payment_info, "invoice_payload", "")
    order_id = extract_order_id_from_payload(payload)

    order = await db.mark_as_paid_and_get_order(amount_tiyin, order_id=order_id)
    is_balance_topup = is_balance_topup_order(order)

    if not order:
        logger.warning(
            "Successful payment not matched for user=%s amount=%s payload=%s order_id=%s",
            message.from_user.id,
            amount_tiyin,
            payload,
            order_id,
        )
        await message.answer(
            "⚠️ To'lov qabul qilindi, lekin buyurtma bilan bog'lanmadi. Iltimos admin bilan bog'laning."
        )
        return

    # Oldingi to'lov so'rovi xabarini o'chirishga urinish (masalan, pay_click dan "Buyurtma yaratildi")
    state_data = await state.get_data()
    payment_prompt_message_id = state_data.get("payment_prompt_message_id")
    if payment_prompt_message_id:
        try:
            await bot.delete_message(message.chat.id, payment_prompt_message_id)
        except Exception as e:
            logger.warning(
                f"Failed to delete payment prompt message {payment_prompt_message_id}: {e}"
            )

    if not is_balance_topup:
        await reward_referrer(message.from_user.id, amount_tiyin)

    if is_balance_topup:
        await db.add_user_balance(order[1], order[4])
        msg = await message.answer(
            f"✅ Hisobingiz muvaffaqiyatli to'ldirildi!\nSumma: {format_amount(order[4])}"
        )
        await db.update_order_feedback_id(order[0], msg.message_id)
        await state.clear()  # Balans to'ldirilgandan so'ng holatni tozalash
        return

    msg = await message.answer(
        "🚀 To'lov muvaffaqiyatli qabul qilindi! Admin tez orada xizmatni faollashtiradi."
    )
    await db.update_order_feedback_id(order[0], msg.message_id)
    adm_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Yubordim",
                    callback_data=f"admin_deliver_order_{order[0]}",
                )
            ]
        ]
    )
    await bot.send_message(
        ADMIN_IDS[0],
        f"💳 To'lov tasdiqlandi!\nID: {order[0]}\nUser: @{order[2]}\nXizmat: {order[3]}\nSumma: {format_amount(amount_tiyin)}",
        reply_markup=adm_kb,
    )


@dp.callback_query(F.data == "back_to_main")
async def back_to_main(call: types.CallbackQuery):
    if await notify_if_bot_disabled(call):
        return

    if call.message.photo:
        try:
            await call.message.delete()  # Rasm xabarini o'chirish
        except:
            pass
        await call.message.answer("Xizmatni tanlang:", reply_markup=main_menu())
    else:
        await call.message.edit_text("Xizmatni tanlang:", reply_markup=main_menu())
    await call.answer()


async def main():
    logger.info("Bot tayyorlanmoqda...")
    try:
        await db.init_db()
        logger.info("🚀 Polling ishga tushmoqda...")
        await dp.start_polling(bot)
    except Exception as e:
        logger.critical(f"💥 Botni ishga tushirishda jiddiy xatolik: {e}")
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
