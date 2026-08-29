import os
import unittest
from io import BytesIO

os.environ.setdefault(
    "BOT_TOKEN",
    "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
)

import main


class AdminExportTests(unittest.TestCase):
    def test_build_orders_excel_bytes_contains_expected_headers_and_rows(self):
        orders = [
            (
                7,
                1001,
                "@seller",
                "@buyer",
                "Telegram Stars - 100 ta",
                2100000,
                "paid",
                "2026-05-24 12:00:00",
                "ABC123",
            )
        ]

        data = main.build_orders_excel_bytes(orders)
        self.assertGreater(len(data), 0)

        from openpyxl import load_workbook

        with BytesIO(data) as buffer:
            workbook = load_workbook(buffer)
            worksheet = workbook["Buyurtmalar"]
            self.assertEqual(worksheet["A1"].value, "ID")
            self.assertEqual(worksheet["B1"].value, "Foydalanuvchi ID")
            self.assertEqual(worksheet["C1"].value, "Username")
            self.assertEqual(worksheet["D1"].value, "Qabul qiluvchi")
            self.assertEqual(worksheet["E1"].value, "Xizmat")
            self.assertEqual(worksheet["F1"].value, "Summa (tiyin)")
            self.assertEqual(worksheet["G1"].value, "Holat")
            self.assertEqual(worksheet["H1"].value, "Yaratilgan vaqt")
            self.assertEqual(worksheet["I1"].value, "Buyurtma kodi")
            self.assertEqual(worksheet["A2"].value, 7)
            self.assertEqual(worksheet["B2"].value, 1001)
            self.assertEqual(worksheet["C2"].value, "@seller")
            self.assertEqual(worksheet["D2"].value, "@buyer")
            self.assertEqual(worksheet["E2"].value, "Telegram Stars - 100 ta")
            self.assertEqual(worksheet["F2"].value, 2100000)
            self.assertEqual(worksheet["G2"].value, "paid")
            self.assertEqual(worksheet["H2"].value, "2026-05-24 12:00:00")
            self.assertEqual(worksheet["I2"].value, "ABC123")

    def test_balance_topup_helpers(self):
        self.assertTrue(
            main.is_balance_topup_order(
                (
                    1,
                    1001,
                    "1001",
                    "Balance top-up",
                    500000,
                    "pending",
                    "2026-05-24 12:00:00",
                    None,
                    None,
                    None,
                )
            )
        )
        self.assertFalse(
            main.is_balance_topup_order(
                (
                    1,
                    1001,
                    "1001",
                    "Telegram Stars",
                    500000,
                    "pending",
                    "2026-05-24 12:00:00",
                    None,
                    None,
                    None,
                )
            )
        )

        self.assertEqual(main.extract_order_id_from_payload("balance_topup_26"), 26)
        self.assertEqual(main.extract_order_id_from_payload("order_12"), 12)
        self.assertIsNone(main.extract_order_id_from_payload("balance_topup"))

        markup = main.balance_topup_method_markup()
        callbacks = [
            button.callback_data for row in markup.inline_keyboard for button in row
        ]
        self.assertEqual(
            ["topup_click", "topup_manual", "my_profile"],
            callbacks,
        )

    def test_build_order_status_text(self):
        text = main.build_order_status_text(
            {
                "pending": [
                    (
                        11,
                        1001,
                        "seller",
                        "Telegram Stars",
                        210000,
                        "pending",
                        "2026-05-24 10:00:00",
                    )
                ],
                "paid": [
                    (
                        12,
                        1002,
                        "buyer",
                        "Premium",
                        500000,
                        "paid",
                        "2026-05-24 11:00:00",
                    )
                ],
                "delivered": [],
                "rejected": [],
            }
        )

        self.assertIn("Kutayotgan: 1", text)
        self.assertIn("To'langan: 1", text)
        self.assertIn("Yuborilgan: 0", text)
        self.assertIn("Rad etilgan: 0", text)
        self.assertIn("#11", text)
        self.assertIn("Telegram Stars", text)


if __name__ == "__main__":
    unittest.main()
