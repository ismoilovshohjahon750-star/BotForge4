import asyncio
import os
import logging
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import CommandStart, Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ErrorEvent
from aiogram.client.default import DefaultBotProperties
from database import create_db_pool, init_db

BOT_TOKEN = os.getenv("BOT_TOKEN", "8863673291:AAGVDbBEWv_nmiw6ne0eYlUcKWogXo_00Qc")
DOCTOR_ID = int(os.getenv("DOCTOR_ID", "8453381252"))

logging.basicConfig(level=logging.INFO)
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode="Markdown"))
dp = Dispatcher()

@dp.error()
async def global_error_handler(event: ErrorEvent):
    logging.error(f"Kritik xatolik yuz berdi: {event.exception}", exc_info=True)
    return True

def get_doctor_keyboard(appointment_id: int):
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⏳ Keyinroqqa surish", callback_data=f"reschedule_{appointment_id}")]
    ])

@dp.message(CommandStart())
async def start_cmd(message: types.Message):
    await message.answer("Assalomu alaykum! Stomatologiya botimizga xush kelibsiz.")

@dp.message(Command("qabul"))
async def create_appointment(message: types.Message):
    user_id = message.from_user.id
    full_name = message.from_user.full_name
    phone = "+998901234567"
    
    appointment_time = datetime.now() + timedelta(days=2)
    time_str = appointment_time.strftime('%Y-%m-%d %H:%M')
    
    db = dp["db"]
    await db.execute(
        "INSERT OR IGNORE INTO users (user_id, full_name, phone_number) VALUES (?, ?, ?)",
        (user_id, full_name, phone)
    )
    cursor = await db.execute(
        "INSERT INTO appointments (user_id, doctor_id, appointment_time) VALUES (?, ?, ?)",
        (user_id, DOCTOR_ID, time_str)
    )
    app_id = cursor.lastrowid
    await db.commit()

    await message.answer(f"Sizning qabulingiz ro'yxatga olindi: {time_str}")
    
    doctor_text = (
        f"🔴 **Yangi qabul!**\n\n"
        f"Bemor: {full_name}\n"
        f"Tel: {phone}\n"
        f"Vaqti: {time_str}"
    )
    await bot.send_message(DOCTOR_ID, doctor_text, reply_markup=get_doctor_keyboard(app_id))

@dp.callback_query(F.data.startswith("reschedule_"))
async def reschedule_handler(callback: types.CallbackQuery):
    app_id = int(callback.data.split("_")[1])
    
    new_time = datetime.now() + timedelta(days=4)
    time_str = new_time.strftime('%Y-%m-%d %H:%M')
    
    db = dp["db"]
    async with db.execute("SELECT user_id FROM appointments WHERE id = ?", (app_id,)) as cursor:
        row = await cursor.fetchone()
        user_id = row[0] if row else None

    await db.execute(
        "UPDATE appointments SET appointment_time = ? WHERE id = ?",
        (time_str, app_id)
    )
    await db.commit()

    await callback.message.edit_text(
        f"{callback.message.text}\n\n✅ **Qabul vaqti {time_str} ga ko'chirildi.**"
    )
    
    if user_id:
        user_text = (
            f"Hurmatli bemor, sizning qabul vaqtingiz shifokor tomonidan "
            f"**{time_str}** ga ko'chirildi."
        )
        await bot.send_message(user_id, user_text)
        
    await callback.answer("Vaqt ko'chirildi!")

async def main():
    db = await create_db_pool()
    await init_db(db)
    dp["db"] = db
    try:
        await dp.start_polling(bot)
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(main())
