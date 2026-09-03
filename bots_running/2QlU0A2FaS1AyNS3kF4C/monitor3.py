import asyncio
import re
import logging
import sys
from telethon import TelegramClient, events
from aiogram import Bot
import config
import database as db

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logging.getLogger("telethon.network.connection.connection").setLevel(logging.ERROR)
logging.getLogger("telethon.network.mtprotosender").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

client = TelegramClient("humo_payment_session", config.API_ID, config.API_HASH)
bot = Bot(token=config.BOT_TOKEN)


@client.on(events.NewMessage(chats=config.HUMO_BOT_USERNAME))
async def handle_new_payment(event):
    msg_text = event.message.message
    logger.info(f"Yangi xabar keldi: {msg_text}")

    # Summani aniqlash uchun regex (so'm, UZS, sum va h.k.)
    match = re.search(
        r"([\d\s,.]+)\s*(?:so['`‘]m|UZS|sum|сўм)", msg_text, re.IGNORECASE
    )

    if match:
        # Tozalash: bo'shliqlarni olib tashlash
        raw_val = match.group(1).replace(" ", "")

        # Agar oxirgi separator vergul bo'lsa (masalan: 10.500,00)
        if "," in raw_val and (
            raw_val.find(",") > raw_val.find(".") or "." not in raw_val
        ):
            if len(raw_val.split(",")[-1]) <= 2:  # Decimal separator
                raw_val = raw_val.replace(".", "").replace(",", ".")
            else:  # Minglik separator
                raw_val = raw_val.replace(",", "").replace(".", "")
        else:
            # Agar nuqta minglik separator bo'lsa (masalan: 10.500)
            if raw_val.count(".") == 1 and len(raw_val.split(".")[-1]) == 3:
                raw_val = raw_val.replace(".", "")
            else:
                # Oddiy holatda vergullarni o'chirib, nuqtani decimal deb hisoblaymiz
                raw_val = raw_val.replace(",", "")

        try:
            # Precision xatoliklarini oldini olish uchun round ishlatamiz
            amount_tiyin = int(round(float(raw_val) * 100))
        except ValueError:
            logger.error(f"Summani tushunib bo'lmadi: {raw_val}")
            return

        logger.info(f"Qidirilmoqda: {amount_tiyin} tiyin ({amount_tiyin/100} so'm)")

        order = await db.mark_as_paid_and_get_order(amount_tiyin)
        if order:
            order_id, user_id, target_user, service_type, _, _, _ = order
            logger.info(f"💰 To'lov tasdiqlandi: Order {order_id}")

            if service_type == "Balance top-up":
                await db.add_user_balance(user_id, amount_tiyin)
                await bot.send_message(
                    user_id,
                    f"✅ Hisobingiz muvaffaqiyatli to'ldirildi!\nID: {order_id}\nSumma: {amount_tiyin // 100:,} so'm",
                )
            else:
                await bot.send_message(
                    user_id,
                    f"✅ To'lov qabul qilindi!\nID: {order_id}\nXizmat: {service_type}\n\nAdmin tez orada xizmatni faollashtiradi.",
                )

            await bot.send_message(
                config.ADMIN_IDS[0],
                f"💳 To'lov keldi!\nID: {order_id}\nUser: @{target_user}\nXizmat: {service_type}",
            )
        else:
            logger.warning(
                f"No pending order found for amount: {amount_tiyin} tiyin. Message: {msg_text}"
            )


async def main():
    phone = (config.HUMO_PHONE or "").strip()
    if not phone or not config.API_ID or not config.API_HASH:
        logger.warning("⚠️ Monitor3: HUMO_PHONE yoki API_ID/API_HASH sozlanmagan. Monitor3 kutish rejimida.")
        while True:
            await asyncio.sleep(60)
        return

    try:
        if not phone.startswith("+"):
            phone = "+" + phone

        await client.connect()
        if not await client.is_user_authorized():
            logger.warning("⚠️ Monitor3 (Humo) sessiyasi avtorizatsiyadan o'tmagan. Iltimos, sessiya faylini yangilang.")
            while True:
                await asyncio.sleep(60)
            return
        logger.info("✅ Monitor3 (To'lov) ishga tushdi.")
        await client.run_until_disconnected()
    except Exception as e:
        logger.error(f"❌ Monitor3 xatolik: {e}")
        while True:
            await asyncio.sleep(60)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
