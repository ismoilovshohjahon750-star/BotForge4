import ast

def get_clean_settings_code():
    return '''def settings_text(user) -> str:
    s = user.settings
    is_pro = user.tariff == "pro"
    lines = ["⚙️ <b>Sozlamalar</b>\\n"]

    if is_pro:
        lines.append(
            f"⏰ Profilga soat: {'on ✅' if s.profil_soat else 'off ❌'}\\n(batafsil — «⏰ Profilga soat» tugmasi)"
        )
        lines.append(
            f"🟢 24/7 online: {'on ✅' if s.online_24_7 else 'off ❌'}"
        )
        if s.online_24_7 and not user.telethon_session:
            lines.append(
                "  <i>⚠️ Hisobingiz Telegram'da haqiqatan \\"online\\" ko'rinishi\\n"
                "uchun avval «⏰ Profilga soat» orqali telefon raqamingizni\\n"
                "tasdiqlang (bitta tasdiqlash ikkalasi uchun ham yetarli).</i>"
            )

    lines.append(f"✉️ «.ok» so'zi: <code>{s.ok_text}</code>")
    lines.append(f"📍 «.loc» so'zi: <code>{s.loc_text}</code>")

    if is_pro:
        lines.append(f"🕵️ Shpion rejimi: {'on ✅' if s.spy_mode else 'off ❌'}")
        if s.spy_mode:
            lines.append(
                "  <i>Yoqilgan: akkauntingizga kelgan har bir xabar (matn/rasm/\\n"
                "video) — o'zingiz uni telefoningizdan hali ochib ulgurmagan\\n"
                "bo'lsangiz ham — shu botga darhol nusxa qilib yuboriladi.</i>"
            )
    else:
        lines.append(
            "\\n🔒 <i>⏰ Profilga soat, 🟢 24/7 online va 🕵️ Shpion rejimi —\\n"
            "faqat 💎 Pro tarifida mavjud.</i>"
        )

    return "\\n".join(lines)

def chatbot_settings_text(user) -> str:
    s = user.settings
    if s.autoreply_mode == "once":
        mode_desc = (
            "Har bir suhbatdoshga <b>FAQAT bir marta</b> avto-javob yuboriladi —\\n"
            "keyin u qancha yozsa ham bot jim turadi (siz shaxsan javob berguningizcha)."
        )
    else:
        mode_desc = "Suhbatdosh <b>har safar</b> yozganda avto-javob qayta yuboriladi."

    if s.work_hours_enabled:
        after_text = f"«{s.after_hours_text}» matni yuboriladi." if s.after_hours_text else "hech narsa yuborilmaydi (matn qo'yilmagan)."
        wh_desc = (
            f"Faqat <b>{s.work_hours_start}–{s.work_hours_end}</b> oralig'ida "
            f"oddiy avto-javob yuboriladi; undan tashqarida {after_text}"
        )
    else:
        wh_desc = "O'chirilgan — avto-javob kuning istalgan vaqtida yuboriladi."

    autoreply_label = 'Faqat 1 marta' if s.autoreply_mode == 'once' else 'Har doim'
    wh_label = 'yoqilgan' if s.work_hours_enabled else "o'chirilgan"

    lines = [
        "🐥 <b>Chatbotni sozlash</b>\\n",
        f"🔁 Avto-javob rejimi: <b>{autoreply_label}</b>\\n  <i>{mode_desc}</i>\\n",
        f"⏰ Ish vaqti: <b>{wh_label}</b>\\n  <i>{wh_desc}</i>\\n",
        f"✏️ Tahrirlanish: {'on ✅' if s.edit_notify else 'off ❌'}\\n"
        "  <i>Suhbatdosh o'ziga yuborilgan xabarini tahrirlasa, shu suhbatga\\n"
        "avtomatik javob (pastdagi matn) yuboriladi.</i>\\n",
        f"🗑 O'chirishlar: {'on ✅' if s.delete_notify else 'off ❌'}\\n"
        "  <i>Suhbatdosh o'zi yuborgan xabarini o'chirsa, shu suhbatga\\n"
        "avtomatik javob (pastdagi matn) yuboriladi.</i>\\n",
        f"🤖 APK o'chirish: {'on ✅' if s.apk_autodelete else 'off ❌'}\\n"
        "  <i>Suhbatdosh sizga .apk fayl yuborsa, avtomatik o'chiriladi.\\n"
        "Buning uchun botni ulaganda Telegram'dan bu botga \\"Xabarlarni\\n"
        "o'chirish\\" huquqini berishingiz kerak.</i>\\n",
        f"⌨️ Yozmoqda: {'on ✅' if s.typing_notify else 'off ❌'}\\n"
        "  <i>Avto-javob yuborishdan oldin bir necha soniya \\"yozmoqda...\\"\\n"
        "holati ko'rsatiladi — javob tabiiyroq ko'rinadi.</i>\\n",
        f"✏️ Tahrirlash matni: <code>{s.edit_notify_text}</code>",
        f"🗑 O'chirish matni: <code>{s.delete_notify_text}</code>",
    ]
    return "\\n".join(lines)

'''

for p in ['./bots_running/rE8KhEFgQ4h0anaCUDzO/texts.py', './bots_running/1ggrjy867WfyJzOLHopQ/texts.py']:
    with open(p, 'r', encoding='utf-8') as f:
        text = f.read()
    p1 = text.find('def settings_text(user) -> str:')
    p2 = text.find('def soat_text(user) -> str:')
    if p1 != -1 and p2 != -1:
        text = text[:p1] + get_clean_settings_code() + text[p2:]
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)
        print('Updated settings_text in:', p)
