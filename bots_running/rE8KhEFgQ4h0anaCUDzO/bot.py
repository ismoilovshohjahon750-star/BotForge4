"""
ArdoChat Bot — ishga tushirish nuqtasi.

Ishga tushirish:
    1) python -m venv venv && source venv/bin/activate
    2) pip install -r requirements.txt
    3) cp .env.example .env   # va BOT_TOKEN, ADMIN_ID ni kiriting
    4) python bot.py
"""
import logging

from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    PreCheckoutQueryHandler,
    BusinessConnectionHandler,
    filters,
)

from config import BOT_TOKEN, BOT_NAME, SOAT_UPDATE_INTERVAL
import handlers
import business
import payments
import profile_clock
import spy
import sms_payment
import storage as storage_module

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def _global_error_handler(update, context):
    """Har qanday ushlanmagan xato shu yerga tushadi. Botni yiqitmaydi —
    faqat logga yozadi (va imkon bo'lsa foydalanuvchiga qisqa xabar
    beradi), shunda bitta xato (masalan tarmoq uzilishi) butun botni
    to'xtatib qo'ymaydi."""
    logger.error("Ushlanmagan xato: %s", context.error, exc_info=context.error)


async def _post_init(app: Application):
    """Bot ishga tushgach (polling boshlanishidan oldin) bir marta
    chaqiriladi: session-yo'qolishi haqida xabar yubora olishi uchun
    profile_clock'ga bot obyektini beradi va oldin «Shpion rejimi» yoqilgan
    barcha foydalanuvchilar uchun Telethon tinglovchilarini qayta ulaydi
    (aks holda bot qayta ishga tushgach ular ishlamay qolar edi)."""
    profile_clock.set_bot_ref(app.bot)
    try:
        await spy.start_all(storage_module)
    except Exception as e:
        logger.warning("Spy: start_all bajarilmadi: %s", e)
    try:
        await sms_payment.start_all(storage_module, bot_ref=app.bot)
    except Exception as e:
        logger.warning("SMS to'lov: start_all bajarilmadi: %s", e)


def build_app() -> Application:
    app = Application.builder().token(BOT_TOKEN).post_init(_post_init).build()
    app.add_error_handler(_global_error_handler)

    # --- oddiy buyruqlar ---
    app.add_handler(CommandHandler("start", handlers.start))
    app.add_handler(CommandHandler("myid", handlers.myid))
    app.add_handler(CommandHandler("admin_stats", handlers.admin_stats))
    app.add_handler(CommandHandler("credit", handlers.admin_credit))
    app.add_handler(CommandHandler("admin", handlers.admin_panel))

    # --- 📲 SMS orqali avtomatik to'lovni aniqlash (faqat admin) ---
    sms_payment.register_handlers(app)

    # --- menyu tugmalari ---
    app.add_handler(CallbackQueryHandler(handlers.on_callback))

    # --- oddiy matn xabarlari (nuqta-buyruqlar, summalar, sozlama matnlari) ---
    # MUHIM: filters.UpdateType.MESSAGE qo'shilmasa, bu handler business_message
    # (Telegram Business orqali kelgan mijoz xabarlari) larni ham "ushlab qolib",
    # ularni on_text ga yuborardi — u yerda update.message har doim None bo'lgani
    # uchun "'NoneType' object has no attribute 'text'" xatosi bilan qulardi va
    # business.on_business_message hech qachon ishga tushmasdi (shu sabab avto
    # javob / 24-7 online umuman ishlamayotgan edi).
    app.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.UpdateType.MESSAGE,
            handlers.on_text,
        )
    )

    # --- HAQIQIY to'lovlar (Stars / Click / Payme) ---
    app.add_handler(PreCheckoutQueryHandler(payments.pre_checkout_handler))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, payments.successful_payment_handler))

    # --- HAQIQIY Telegram Business ulanish va avto-javob ---
    app.add_handler(BusinessConnectionHandler(business.on_business_connection))
    app.add_handler(MessageHandler(filters.UpdateType.BUSINESS_MESSAGE, business.on_business_message))
    app.add_handler(MessageHandler(filters.UpdateType.EDITED_BUSINESS_MESSAGE, business.on_edited_business_message))
    # "filters.UpdateType" ichida deleted_business_messages uchun tayyor
    # filter yo'q (faqat business_message/edited_business_message uchun bor),
    # shuning uchun maxsus filter yozamiz.
    app.add_handler(MessageHandler(business.DeletedBusinessMessagesFilter(), business.on_deleted_business_messages))

    # --- HAQIQIY «Profilga soat» — davriy fon vazifasi (agar sozlangan bo'lsa) ---
    # Eslatma: ism DARHOL (login/tugma bosilganda) ham yangilanadi (handlers.py),
    # bu yerdagi job esa faqat vaqtni har daqiqada yangilab turish uchun.
    if profile_clock.soat_configured():
        if app.job_queue is not None:
            app.job_queue.run_repeating(
                lambda context: profile_clock.update_all_clocks(storage_module, context.bot),
                interval=SOAT_UPDATE_INTERVAL,
                first=5,
                name="soat_updater",
            )
            # --- HAQIQIY 24/7 online (yashil status) — davriy keep-alive ---
            app.job_queue.run_repeating(
                lambda context: profile_clock.keep_all_online(storage_module, bot=context.bot),
                interval=45,
                first=7,
                name="online_keepalive",
            )
        else:
            logger.warning(
                "«Profilga soat» uchun TELEGRAM_API_ID/HASH sozlangan, lekin "
                "JobQueue mavjud emas — soat FAQAT bir martalik (login/tugma "
                "bosilganda) yangilanadi, har daqiqada AVTOMATIK yangilanmaydi. "
                "Buni tuzatish uchun: pip install \"python-telegram-bot[job-queue]\""
            )
    else:
        logger.info(
            "«Profilga soat» o'chirilgan holatda (.env da TELEGRAM_API_ID/"
            "TELEGRAM_API_HASH yo'q yoki telethon o'rnatilmagan)."
        )

    return app


import sys
import telegram.error

def main():
    logger.info("%s ishga tushmoqda...", BOT_NAME)
    try:
        app = build_app()
        app.run_polling(
            allowed_updates=[
                "message",
                "callback_query",
                "pre_checkout_query",
                "business_connection",
                "business_message",
                "edited_business_message",
                "deleted_business_messages",
            ]
        )
    except (telegram.error.InvalidToken, telegram.error.Forbidden) as e:
        logger.error(
            "❌ BOT TOKENI XATOSI: Bot tokeni (BOT_TOKEN) yaroqsiz yoki Telegram tomonidan rad etilgan (401 Unauthorized).\n"
            "Iltimos, @BotFather botiga kirib yangi yoki to'g'ri tokenni oling va uni .env faylidagi BOT_TOKEN qatoriga yozing!"
        )
        sys.exit(1)
    except Exception as e:
        logger.error("❌ Bot ishga tushishida kutilmagan xatolik: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
