import asyncio
import logging
import sys
from telethon import TelegramClient, functions
import config
import database as db

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logging.getLogger("telethon.network.connection.connection").setLevel(logging.ERROR)
logging.getLogger("telethon.network.mtprotosender").setLevel(logging.WARNING)
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
    phone = (config.GIRL_ACCOUNT_PHONE or "").strip()
    if not phone or not config.API_ID or not config.API_HASH:
        logger.warning("⚠️ Monitor2: GIRL_ACCOUNT_PHONE yoki API_ID/API_HASH sozlanmagan. Monitor2 kutish rejimida.")
        while True:
            await asyncio.sleep(60)
        return

    if not phone.startswith("+"):
        phone = "+" + phone

    await init_monitor()
    try:
        await client.connect()
        if not await client.is_user_authorized():
            logger.warning("⚠️ Monitor2 sessiyasi avtorizatsiyadan o'tmagan. Iltimos, sessiya faylini yangilang.")
            while True:
                await asyncio.sleep(60)
            return
        logger.info("✅ Monitor2 (Standart akkaunt) ishga tushdi.")
        await process_gifts()
    except Exception as e:
        logger.error(f"❌ Monitor2 xatolik: {e}")
        while True:
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
