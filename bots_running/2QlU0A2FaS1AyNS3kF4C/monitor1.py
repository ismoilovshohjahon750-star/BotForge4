import asyncio
import logging
import sys
import random
from telethon import TelegramClient, functions
import config
import database as db

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logging.getLogger("telethon.network.connection.connection").setLevel(logging.ERROR)
logging.getLogger("telethon.network.mtprotosender").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

client = TelegramClient("girl_account_session", config.API_ID, config.API_HASH)

GIFT_MESSAGES = [
    "Siz uchun maxsus! 🎁",
    "Love you! ❤️",
    "Yaxshi kayfiyat tilayman! ✨",
    "Kichik sovg'a, katta mehr bilan! 😊",
    "Siz eng yaxshisisiz! ⭐",
]

GIFT_ID_MAP = {"Heart": 1, "Teddy": 2, "Present": 3, "Rose": 4, "Cake": 5}


async def process_gifts():
    while True:
        try:
            # 'paid' holatidagi va 'Gift (Qiz)' turidagi buyurtmalarni olish
            rows = await db.execute_query(
                "SELECT * FROM orders WHERE status = 'paid' AND service_type LIKE 'Gift (Qiz)%'",
                fetch_all=True,
            )
            for row in rows:
                order_id = row["id"]
                target = row["target_user"]
                service = row["service_type"]
                gift_name = service.split(":")[-1].strip()

                logger.info(f"🚀 Qiz akkauntidan gift yuborilmoqda: {order_id}")

                try:
                    await client(
                        functions.payments.SendGiftRequest(
                            user_id=target,
                            gift_id=GIFT_ID_MAP.get(gift_name, 1),
                            message=random.choice(GIFT_MESSAGES),
                            hide_name=False,
                        )
                    )
                    await db.update_order_status(order_id, "delivered")
                    logger.info(f"✅ Bajarildi: {order_id}")
                except Exception as e:
                    logger.error(f"❌ Xatolik {order_id}: {e}")

        except Exception as e:
            logger.error(f"Polling error: {e}")

        await asyncio.sleep(10)


async def init_monitor():
    await db.init_db()


async def main():
    phone = (config.GIRL_ACCOUNT_PHONE or "").strip()
    if not phone or not config.API_ID or not config.API_HASH:
        logger.warning("⚠️ Monitor1: GIRL_ACCOUNT_PHONE yoki API_ID/API_HASH sozlanmagan. Monitor1 kutish rejimida.")
        while True:
            await asyncio.sleep(60)
        return

    if not phone.startswith("+"):
        phone = "+" + phone

    await init_monitor()
    try:
        await client.connect()
        if not await client.is_user_authorized():
            logger.warning("⚠️ Monitor1 sessiyasi avtorizatsiyadan o'tmagan. Iltimos, sessiya faylini yangilang.")
            while True:
                await asyncio.sleep(60)
            return
        logger.info("✅ Monitor1 (Qiz akkaunt) ishga tushdi.")
        await process_gifts()
    except Exception as e:
        logger.error(f"❌ Monitor1 xatolik: {e}")
        while True:
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
