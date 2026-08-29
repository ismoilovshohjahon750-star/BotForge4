import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters
)

# Configuration
BOT_TOKEN = "8833995681:AAHx4_yJTCW794GJHkHRXwbmNh6xdMVi5JY"
ADMIN_ID = 8453381252 # Telegram ID'ngizni yozing

# Bot ma'lumotlar bazasi (xotirada)
images_db = {}
user_states = {}
settings_db = {
    "channel": None,  # Masalan: "@kanalingiz"
    "sub_active": False  # Majburiy obuna holati
}

# Admin panel xabarlarining ID'larini saqlash uchun
admin_panel_messages = {} # {user_id: message_id}

logging.basicConfig(level=logging.INFO)

# --- MAJBURITY OBUNA TEKSHIRUVI ---
async def check_subscription(user_id: int, context: ContextTypes.DEFAULT_TYPE) -> bool:
    if not settings_db["sub_active"] or not settings_db["channel"]:
        return True
    try:
        member = await context.bot.get_chat_member(chat_id=settings_db["channel"], user_id=user_id)
        return member.status in ['creator', 'administrator', 'member']
    except Exception:
        return True

async def send_sub_channel_msg(update: Update):
    ch_username = settings_db["channel"].replace('@', '')
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("Kanalga a'zo bo'lish ", url=f"https://t.me/{ch_username}")],
        [InlineKeyboardButton("Tekshirish ", callback_data="check_sub")]
    ])
    msg = "Botdan foydalanish uchun rasmiy kanalimizga obuna bo'ling:"
    if update.message:
        await update.message.reply_text(msg, reply_markup=keyboard)
    elif update.callback_query:
        await update.callback_query.message.reply_text(msg, reply_markup=keyboard)

# --- START & RO'YXAT ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await check_subscription(user_id, context):
        await send_sub_channel_msg(update)
        return

    if not images_db:
        await update.message.reply_text("Hozircha hech qanday rasm mavjud emas.")
        return

    text = "<b>Mavjud rasmlar ro'yxati:</b>\n\n"
    for code, data in images_db.items():
        text += f"/{code}. {data['title']} ({data['views']})\n"
    
    await update.message.reply_text(text, parse_mode="HTML")

# --- RASMLARNI YUBORISH ---
async def handle_commands(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not await check_subscription(user_id, context):
        await send_sub_channel_msg(update)
        return

    cmd = update.message.text.replace("/", "").strip()
    if cmd in images_db:
        images_db[cmd]['views'] += 1
        item = images_db[cmd]
        
        caption = f"<b>Nomi:</b> {item['title']}\n<b>Ko'rilgan:</b> {item['views']} marta"
        await update.message.reply_photo(
            photo=item['file_id'], 
            caption=caption, 
            parse_mode="HTML"
        )

# --- ADMIN PANEL ---
def get_admin_keyboard():
    status = "YOQILGAN " if settings_db["sub_active"] else "O'CHIRILGAN "
    ch_name = settings_db["channel"] if settings_db["channel"] else "Ulanmagan"
    
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(" Rasm qo'shish", callback_data="add_img"),
         InlineKeyboardButton(" Rasm o'chirish", callback_data="delete_img")],
        [InlineKeyboardButton(f" Kanal: {ch_name}", callback_data="set_channel")],
        [InlineKeyboardButton(f"Obuna holati: {status}", callback_data="toggle_sub")]
    ])

async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        return
    msg = await update.message.reply_text("<b>Admin Panel:</b>", reply_markup=get_admin_keyboard(), parse_mode="HTML")
    admin_panel_messages[ADMIN_ID] = msg.message_id # Store the message ID

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "check_sub":
        if await check_subscription(query.from_user.id, context):
            await query.message.reply_text("Obuna tasdiqlandi! Endi /start bosing.")
        else:
            await query.message.reply_text("Hali obuna bo'lmadingiz!")
        return

    if query.from_user.id != ADMIN_ID:
        return

    admin_chat_id = ADMIN_ID
    admin_msg_id = admin_panel_messages.get(admin_chat_id)
    
    if not admin_msg_id: # Fallback if for some reason admin panel message ID is lost
        await context.bot.send_message(admin_chat_id, "Admin panelga qaytish uchun /admin bosing.")
        return

    if query.data == "add_img":
        user_states[ADMIN_ID] = "WAITING_CODE"
        await context.bot.edit_message_text(
            chat_id=admin_chat_id,
            message_id=admin_msg_id,
            text="Rasm uchun kod kiriting (masalan: 1 yoki 2):",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
        )
        
    elif query.data == "delete_img":
        if not images_db:
            await context.bot.edit_message_text(
                chat_id=admin_chat_id,
                message_id=admin_msg_id,
                text="O'chirish uchun rasmlar yo'q.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Orqaga", callback_data="back_to_admin_panel")]])
            )
            return
        buttons = [[InlineKeyboardButton(f" /{code} - {data['title']}", callback_data=f"del_{code}")] for code, data in images_db.items()]
        buttons.append([InlineKeyboardButton(" Orqaga", callback_data="back_to_admin_panel")])
        await context.bot.edit_message_text(
            chat_id=admin_chat_id,
            message_id=admin_msg_id,
            text="O'chirmoqchi bo'lgan rasmni tanlang:", 
            reply_markup=InlineKeyboardMarkup(buttons)
        )
        
    elif query.data.startswith("del_"):
        code = query.data.split("_")[1]
        if code in images_db:
            del images_db[code]
            await context.bot.edit_message_text(
                chat_id=admin_chat_id,
                message_id=admin_msg_id,
                text=f"/{code} kodi ostidagi rasm o'chirildi!\n\n<b>Admin Panel:</b>",
                reply_markup=get_admin_keyboard(),
                parse_mode="HTML"
            )
        else:
            await context.bot.edit_message_text(
                chat_id=admin_chat_id,
                message_id=admin_msg_id,
                text="Bunday rasm topilmadi.\n\n<b>Admin Panel:</b>",
                reply_markup=get_admin_keyboard(),
                parse_mode="HTML"
            )
    elif query.data == "set_channel":
        user_states[ADMIN_ID] = "WAITING_CHANNEL"
        await context.bot.edit_message_text(
            chat_id=admin_chat_id,
            message_id=admin_msg_id,
            text="Kanal username'ini kiriting (masalan: @kanalingiz):\n\nBotni kanalga admin qilishni unutmang!",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
        )

    elif query.data == "toggle_sub":
        if not settings_db["channel"]:
            await context.bot.edit_message_text(
                chat_id=admin_chat_id,
                message_id=admin_msg_id,
                text="Avval kanal username'ini kiriting!",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Orqaga", callback_data="back_to_admin_panel")]])
            )
            return
        settings_db["sub_active"] = not settings_db["sub_active"]
        await context.bot.edit_message_reply_markup(
            chat_id=admin_chat_id,
            message_id=admin_msg_id,
            reply_markup=get_admin_keyboard()
        )
    elif query.data == "back_to_admin_panel" or query.data == "cancel_admin_action":
        if ADMIN_ID in user_states:
            del user_states[ADMIN_ID] # Clear any pending state
        await context.bot.edit_message_text(
            chat_id=admin_chat_id,
            message_id=admin_msg_id,
            text="<b>Admin Panel:</b>",
            reply_markup=get_admin_keyboard(),
            parse_mode="HTML"
        )

async def handle_admin_inputs(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id != ADMIN_ID or user_id not in user_states:
        return

    state = user_states[user_id]
    admin_msg_id = admin_panel_messages.get(user_id)
    if not admin_msg_id:
        await update.message.reply_text("Admin panelga qaytish uchun /admin bosing.")
        if user_id in user_states: # Ensure state is cleared if message ID is lost
            del user_states[user_id]
        return

    if state == "WAITING_CHANNEL":
        channel_input = update.message.text.strip()
        if not channel_input.startswith("@"):
            channel_input = f"@{channel_input}"
        settings_db["channel"] = channel_input
        del user_states[user_id]
        
        await context.bot.edit_message_text(
            chat_id=user_id,
            message_id=admin_msg_id,
            text=f"✅ Kanal saqlandi: {channel_input}\nBotni kanalga admin qilishni unutmang!\n\n<b>Admin Panel:</b>",
            reply_markup=get_admin_keyboard(),
            parse_mode="HTML"
        )
        if update.message.message_id:
             await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)

    elif state == "WAITING_CODE":
        new_code = update.message.text.replace("/", "").strip()
        if not new_code.isalnum(): # Basic validation for code
            await context.bot.edit_message_text(
                chat_id=user_id,
                message_id=admin_msg_id,
                text="Kod faqat harf va raqamlardan iborat bo'lishi kerak. Qaytadan kiriting yoki 'Bekor qilish' tugmasini bosing.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
            )
            if update.message.message_id:
                 await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)
            return

        context.user_data['new_code'] = new_code
        user_states[user_id] = "WAITING_TITLE"
        await context.bot.edit_message_text(
            chat_id=user_id,
            message_id=admin_msg_id,
            text="Rasm nomini kiriting:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
        )
        if update.message.message_id:
             await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)

    elif state == "WAITING_TITLE":
        context.user_data['new_title'] = update.message.text
        user_states[user_id] = "WAITING_PHOTO"
        await context.bot.edit_message_text(
            chat_id=user_id,
            message_id=admin_msg_id,
            text="Endi rasmni yuboring:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
        )
        if update.message.message_id:
             await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)

    elif state == "WAITING_PHOTO" and update.message.photo:
        file_id = update.message.photo[-1].file_id
        code = context.user_data.pop('new_code', None) 
        title = context.user_data.pop('new_title', None) 

        if code and title:
            images_db[code] = {"file_id": file_id, "title": title, "views": 0}
            del user_states[user_id]
            
            await context.bot.edit_message_text(
                chat_id=user_id,
                message_id=admin_msg_id,
                text=f"✅ Rasm qo'shildi!\nBuyruq: /{code}\nNomi: {title}\n\n<b>Admin Panel:</b>",
                reply_markup=get_admin_keyboard(),
                parse_mode="HTML"
            )
            if update.message.message_id:
                await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)
        else:
            del user_states[user_id]
            await context.bot.edit_message_text(
                chat_id=user_id,
                message_id=admin_msg_id,
                text="Xatolik: Rasm qo'shish jarayoni yakunlanmadi. Qaytadan urinib ko'ring.\n\n<b>Admin Panel:</b>",
                reply_markup=get_admin_keyboard(),
                parse_mode="HTML"
            )
            if update.message.message_id:
                await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)

    elif state == "WAITING_PHOTO" and not update.message.photo:
        # If admin sent text instead of photo
        await context.bot.edit_message_text(
            chat_id=user_id,
            message_id=admin_msg_id,
            text="Iltimos, rasm yuboring. Boshqa turdagi xabar qabul qilinmaydi.\n\nEndi rasmni yuboring:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton(" Bekor qilish", callback_data="cancel_admin_action")]])
        )
        if update.message.message_id:
             await context.bot.delete_message(chat_id=user_id, message_id=update.message.message_id)


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

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("admin", admin_panel))
    app.add_handler(CallbackQueryHandler(callback_handler))
    
    app.add_handler(MessageHandler(filters.PHOTO & filters.User(ADMIN_ID), handle_admin_inputs))
    app.add_handler(MessageHandler(filters.TEXT & filters.User(ADMIN_ID) & ~filters.COMMAND, handle_admin_inputs))
    app.add_handler(MessageHandler(filters.COMMAND, handle_commands))

    print("Bot ishga tushdi...")
    app.add_error_handler(_cloudbot_error_handler)
    app.run_polling()

if __name__ == "__main__":
    main()
