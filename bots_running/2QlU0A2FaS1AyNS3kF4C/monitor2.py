import asyncio
import logging
from telethon import TelegramClient, functions
import config
import database as db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

client = TelegramClient("std_account_session", config.API_ID, config.API_HASH)
GIFT_ID_MAP = {
    "Heart": 1,
    "Teddy": 2,
    "Present": 3,
    "Rose": 4,
    "Cake": 5,
    "Flowers": 6,
    "Rocket": 7,
    "Trophy": 8,
    "Ring": 9,
    "Diamond": 10,
}


async def init_monitor():
    await db.init_db()


async def process_gifts():
    while True:
        try:
            rows = await db.execute_query(
                "SELECT * FROM orders WHERE status = 'paid' AND service_type LIKE 'Gift (Standart)%'",
                fetch_all=True,
            )
            for row in rows:
                order_id = row["id"]
                target = row["target_user"]
                service = row["service_type"]
                gift_name = service.split(":")[-1].strip()

                logger.info(f"🚀 Standart (Anonim) gift yuborilmoqda: {order_id}")

                try:
                    # Anonim yuborish: hide_name=True, message=None
                    await client(
                        functions.payments.SendGiftRequest(
                            user_id=target,
                            gift_id=GIFT_ID_MAP.get(gift_name, 1),
                            message=None,
                            hide_name=True,
                        )
                    )
                    await db.update_order_status(order_id, "delivered")
                    logger.info(f"✅ Bajarildi: {order_id}")
                except Exception as e:
                    logger.error(f"❌ Xatolik {order_id}: {e}")

        except Exception as e:
            logger.error(f"Polling error: {e}")

        await asyncio.sleep(10)


async def main():
    phone = config.GIRL_ACCOUNT_PHONE  # Yoki boshqa mos telefon raqami
    if not phone.startswith("+"):
        phone = "+" + phone

    await init_monitor()
    await client.start(
        phone=phone,
        password=lambda: config.GIRL_ACCOUNT_PASSWORD
        or input("2FA paroli (Standart akkaunt): "),
        code_callback=lambda: input("Standart akkaunt kodi: "),
    )
    logger.info("✅ Monitor2 (Standart akkaunt) ishga tushdi.")
    await process_gifts()


if __name__ == "__main__":
    asyncio.run(main())
