from telebot import types
import logging
from data import get_movie_by_title, get_random_movie, MOVIES
from utils import format_movie_details, create_movie_keyboard

logger = logging.getLogger(__name__)

def register_handlers(bot):

    @bot.message_handler(commands=['start'])
    def handle_start(message):
        logger.info(f"User {message.from_user.id} started the bot.")
        welcome_text = (
            "*Salom! Kino Botga xush kelibsiz!* 👋\n\n"
            "Men sizga filmlar haqida ma'lumot topishga yordam beraman.\n\n"
            "Mavjud buyruqlar:\n"
            "/find _<film nomi>_ - Ma'lum bir filmni qidirish\n"
            "/random - Tasodifiy film taklif qilish\n"
            "/help - Yordam xabarini ko'rsatish\n\n"
            "Marhamat, film nomini kiriting yoki buyruqlardan foydalaning!"
        )
        bot.send_message(message.chat.id, welcome_text, parse_mode='Markdown')

    @bot.message_handler(commands=['help'])
    def handle_help(message):
        logger.info(f"User {message.from_user.id} requested help.")
        help_text = (
            "*Yordam bo'limi* ❓\n\n"
            "Bu bot yordamida filmlar haqida ma'lumot olishingiz mumkin.\n\n"
            "*Qanday foydalanish kerak:*\n"
            "1. `/find Avengers` kabi yozib, o'zingiz xohlagan filmni qidiring.\n"
            "2. `/random` buyrug'i bilan tasodifiy film taklifini oling.\n\n"
            "Foydali bo'ldi degan umiddaman!"
        )
        bot.send_message(message.chat.id, help_text, parse_mode='Markdown')

    @bot.message_handler(commands=['find'])
    def handle_find(message):
        try:
            query = message.text.replace('/find ', '').strip()
            if not query:
                bot.send_message(message.chat.id, "Iltimos, film nomini `/find <film nomi>` formatida kiriting.")
                return
            
            logger.info(f"User {message.from_user.id} searching for: {query}")
            movie = get_movie_by_title(query)

            if movie:
                details_text = format_movie_details(movie)
                keyboard = create_movie_keyboard(movie['id'], movie.get('trailer_link', '#'))
                bot.send_photo(message.chat.id, movie['poster_url'], caption=details_text, reply_markup=keyboard, parse_mode='Markdown')
            else:
                bot.send_message(message.chat.id, f"Kechirasiz, '{query}' nomli film topilmadi. Boshqa nom bilan urinib ko'ring.")
        except Exception as e:
            logger.error(f"Error in /find handler for user {message.from_user.id}: {e}")
            bot.send_message(message.chat.id, "Film qidirishda xato yuz berdi. Iltimos, keyinroq urinib ko'ring.")

    @bot.message_handler(commands=['random'])
    def handle_random(message):
        try:
            logger.info(f"User {message.from_user.id} requested a random movie.")
            if not MOVIES:
                bot.send_message(message.chat.id, "Kechirasiz, hozircha filmlar bazasida ma'lumot yo'q.")
                return

            movie = get_random_movie()
            if movie:
                details_text = format_movie_details(movie)
                keyboard = create_movie_keyboard(movie['id'], movie.get('trailer_link', '#'))
                bot.send_photo(message.chat.id, movie['poster_url'], caption=details_text, reply_markup=keyboard, parse_mode='Markdown')
            else:
                bot.send_message(message.chat.id, "Tasodifiy film topilmadi. Iltimos, keyinroq urinib ko'ring.")
        except Exception as e:
            logger.error(f"Error in /random handler for user {message.from_user.id}: {e}")
            bot.send_message(message.chat.id, "Tasodifiy film olishda xato yuz berdi. Iltimos, keyinroq urinib ko'ring.")

    @bot.callback_query_handler(func=lambda call: call.data.startswith('watch_trailer_'))
    def callback_watch_trailer(call):
        try:
            movie_id = int(call.data.replace('watch_trailer_', ''))
            movie = next((m for m in MOVIES if m['id'] == movie_id), None)
            if movie and movie.get('trailer_link') and movie['trailer_link'] != '#':
                bot.answer_callback_query(call.id, text=f"{movie['title']} treyleri ochilmoqda...")
                bot.send_message(call.message.chat.id, f"*Treyler:* [{movie['title']} treyleri]({movie['trailer_link']})", parse_mode='Markdown')
            else:
                bot.answer_callback_query(call.id, text="Ushbu film uchun treyler topilmadi.")
        except Exception as e:
            logger.error(f"Error in callback_watch_trailer for user {call.from_user.id}: {e}")
            bot.answer_callback_query(call.id, text="Xato yuz berdi.")

    @bot.message_handler(func=lambda message: True)
    def echo_all(message):
        if message.text and not message.text.startswith('/'):
            query = message.text.strip()
            logger.info(f"User {message.from_user.id} sent free text: {query}")
            movie = get_movie_by_title(query)

            if movie:
                details_text = format_movie_details(movie)
                keyboard = create_movie_keyboard(movie['id'], movie.get('trailer_link', '#'))
                bot.send_photo(message.chat.id, movie['poster_url'], caption=details_text, reply_markup=keyboard, parse_mode='Markdown')
            else:
                bot.send_message(message.chat.id, f"Kechirasiz, '{query}' nomli film topilmadi. Boshqa nom bilan urinib ko'ring yoki /help buyrug'idan foydalaning.")
