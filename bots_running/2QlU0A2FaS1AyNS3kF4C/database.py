import random
import string
from datetime import datetime, timedelta
import sqlite3
import asyncio
import logging

logger = logging.getLogger(__name__)

DATABASE_FILE = "bot_store.db"

# Connection pool (for re-use across async functions)
_db_connection = None


async def get_db_connection():
    """Returns a connection to the SQLite database."""
    global _db_connection
    if _db_connection is None:
        _db_connection = sqlite3.connect(
            DATABASE_FILE, timeout=30, check_same_thread=False
        )
        _db_connection.row_factory = sqlite3.Row  # Access columns by name
    return _db_connection


async def execute_query(query: str, params=(), fetch_one=False, fetch_all=False):
    """
    Executes an SQL query in a separate thread to avoid blocking the event loop.
    """
    conn = await get_db_connection()
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, _execute_blocking_query, conn, query, params, fetch_one, fetch_all
        )
    except Exception as e:
        logger.error(f"Database query failed: {query} with params {params}. Error: {e}")
        raise


def _execute_blocking_query(conn, query, params, fetch_one, fetch_all):
    """Blocking part of query execution, runs in an executor."""
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    if fetch_one:
        return cursor.fetchone()
    if fetch_all:
        return cursor.fetchall()
    return cursor.lastrowid


def generate_order_code(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


# get_next_sequence_value is no longer needed with AUTOINCREMENT
async def get_next_sequence_value(sequence_name):
    # For SQLite, the 'id' column with AUTOINCREMENT will handle this.
    # This function is kept to maintain the signature, but its logic is now within create_order.
    return None


async def init_db():
    conn = await get_db_connection()

    def _init():
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                referred_by INTEGER,
                balance_tiyin INTEGER DEFAULT 0,
                joined_at TEXT,
                language TEXT DEFAULT 'uz'
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                target_user TEXT,
                service_type TEXT,
                base_price_tiyin INTEGER,
                amount_tiyin INTEGER,
                order_code TEXT UNIQUE,
                status TEXT,
                created_at TEXT,
                receipt_file_id TEXT,
                admin_receipt_message_id INTEGER,
                user_feedback_message_id INTEGER
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.commit()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _init)
    logger.info("ℹ️ SQLite ma'lumotlar bazasi initsializatsiya qilindi.")
    return True


async def get_or_create_user(user_id, username, referrer_id=None):
    user = await execute_query(
        "SELECT * FROM users WHERE user_id = ?", (user_id,), fetch_one=True
    )
    if not user:
        if referrer_id == user_id:  # Prevent self-referral
            referrer_id = None
        await execute_query(
            "INSERT INTO users (user_id, username, referred_by, joined_at, language) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, referrer_id, datetime.now().isoformat(), "uz"),
        )


async def get_setting(key: str, default: str = None):
    row = await execute_query(
        "SELECT value FROM settings WHERE key = ?", (key,), fetch_one=True
    )
    return row["value"] if row else default


async def set_setting(key: str, value: str):
    await execute_query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value)
    )


async def set_user_language(user_id, lang):
    await execute_query(
        "UPDATE users SET language = ? WHERE user_id = ?", (lang, user_id)
    )


async def get_unique_pending_amount(base_price_tiyin):
    """
    Kutayotgan buyurtmalar orasida takrorlanmaydigan unikal summa qaytaradi.
    Tasodifiy tiyinlar o'rniga har bir to'lovga 100 so'mdan (10000 tiyin) qo'shib boradi.
    """
    for i in range(1, 101):
        # 100 so'm (10000 tiyin) qadam bilan oshiramiz
        extra_tiyin = i * 100 * 100
        test_amount = base_price_tiyin + extra_tiyin

        row = await execute_query(
            "SELECT id FROM orders WHERE amount_tiyin = ? AND status = 'pending'",
            (test_amount,),
            fetch_one=True,
        )
        if not row:
            return test_amount

    return base_price_tiyin + (random.randint(1, 10) * 100 * 100)


async def get_top_spenders_today():
    today_start = (datetime.now() - timedelta(days=1)).isoformat()
    rows = await execute_query(
        """
        SELECT u.user_id, u.username, SUM(o.amount_tiyin) as total_spent
        FROM orders o
        JOIN users u ON o.user_id = u.user_id
        WHERE o.status = 'paid' AND o.created_at >= ? AND o.service_type != 'Balance top-up'
        GROUP BY u.user_id, u.username
        ORDER BY total_spent DESC
        LIMIT 10
        """,
        (today_start,),
        fetch_all=True,
    )
    return [(row["user_id"], row["username"], row["total_spent"]) for row in rows]


async def get_all_users_data():
    rows = await execute_query("SELECT * FROM users", fetch_all=True)
    return [
        (
            row["user_id"],
            row["username"],
            row["referred_by"],
            row["balance_tiyin"],
            row["joined_at"],
        )
        for row in rows
    ]


async def get_all_orders():
    rows = await execute_query(
        """
        SELECT o.*, u.username as user_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.user_id
        ORDER BY o.id DESC
        """,
        fetch_all=True,
    )
    return [
        (
            row["id"],
            row["user_id"],
            row["user_name"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
            row["order_code"],
        )
        for row in rows
    ]


async def get_user_data(user_id):
    row = await execute_query(
        "SELECT * FROM users WHERE user_id = ?", (user_id,), fetch_one=True
    )
    if row:
        return (
            row["user_id"],
            row["username"],
            row["referred_by"],
            row["balance_tiyin"],
            row["joined_at"],
            row["language"],
        )
    return None


async def add_user_balance(user_id, amount_tiyin):
    await execute_query(
        "UPDATE users SET balance_tiyin = balance_tiyin + ? WHERE user_id = ?",
        (amount_tiyin, user_id),
    )


async def get_referral_count(user_id):
    row = await execute_query(
        "SELECT COUNT(*) as count FROM users WHERE referred_by = ?",
        (user_id,),
        fetch_one=True,
    )
    return row["count"] if row else 0


async def cleanup_expired_orders():
    # 24 soatdan eski 'pending' buyurtmalarni o'chirish (ixtiyoriy)
    limit = (datetime.now() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    await execute_query(
        "DELETE FROM orders WHERE status = 'pending' AND created_at < ?", (limit,)
    )
    return 0


async def update_order_receipt_info(
    order_id, receipt_file_id, admin_receipt_message_id, user_feedback_message_id
):
    await execute_query(
        """
        UPDATE orders
        SET receipt_file_id = ?, admin_receipt_message_id = ?, user_feedback_message_id = ?, status = ?
        WHERE id = ?
        """,
        (
            receipt_file_id,
            admin_receipt_message_id,
            user_feedback_message_id,
            "pending_receipt_verification",
            order_id,
        ),
    )


async def update_order_feedback_id(order_id, user_feedback_message_id):
    await execute_query(
        "UPDATE orders SET user_feedback_message_id = ? WHERE id = ?",
        (user_feedback_message_id, order_id),
    )


async def update_order_status(order_id, status):
    await execute_query("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    return True


async def get_user_by_id(user_id):
    row = await execute_query(
        "SELECT user_id, username FROM users WHERE user_id = ?",
        (user_id,),
        fetch_one=True,
    )
    if row:
        return (row["user_id"], row["username"])
    return None


async def create_order(
    user_id, target_user, service, base_price_tiyin, exact_amount_tiyin=None
):
    order_code = generate_order_code()
    if exact_amount_tiyin is not None:
        final_amount = exact_amount_tiyin
    else:
        final_amount = base_price_tiyin

    order_id = await execute_query(
        """
        INSERT INTO orders (user_id, target_user, service_type, base_price_tiyin, amount_tiyin, order_code, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            target_user,
            service,
            base_price_tiyin,
            final_amount,
            order_code,
            "pending",
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    return order_id, order_code, final_amount


async def mark_as_paid(amount_tiyin, order_id=None):
    if order_id:
        await execute_query(
            "UPDATE orders SET status = 'paid' WHERE id = ? AND amount_tiyin = ?",
            (order_id, amount_tiyin),
        )
    else:
        await execute_query(
            "UPDATE orders SET status = 'paid' WHERE amount_tiyin = ? AND status = 'pending'",
            (amount_tiyin,),
        )
    return True


async def get_pending_order_by_amount(amount_tiyin):
    row = await execute_query(
        "SELECT * FROM orders WHERE amount_tiyin = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        (amount_tiyin,),
        fetch_one=True,
    )
    if row:
        return (
            row["id"],
            row["user_id"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
        )
    return None


async def mark_as_paid_and_get_order(amount_tiyin, order_id=None):
    limit = (datetime.now() - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    if order_id:
        row = await execute_query(
            "SELECT * FROM orders WHERE id = ? AND amount_tiyin = ? AND status = 'pending'",
            (order_id, amount_tiyin),
            fetch_one=True,
        )
    else:
        row = await execute_query(
            "SELECT * FROM orders WHERE amount_tiyin = ? AND status = 'pending' AND created_at >= ? ORDER BY id DESC LIMIT 1",
            (amount_tiyin, limit),
            fetch_one=True,
        )

    if row:
        await execute_query(
            "UPDATE orders SET status = 'paid' WHERE id = ?", (row["id"],)
        )
        return (
            row["id"],
            row["user_id"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            "paid",
            row["created_at"],
        )
    return None


async def mark_as_delivered(order_id):
    await execute_query(
        "UPDATE orders SET status = 'delivered' WHERE id = ? AND status = 'paid'",
        (order_id,),
    )
    return True


async def get_last_order(user_id):
    row = await execute_query(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,),
        fetch_one=True,
    )
    if row:
        return (
            row["id"],
            row["user_id"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
            row["receipt_file_id"],
            row["admin_receipt_message_id"],
            row["user_feedback_message_id"],
        )
    return None


async def get_order_by_id(order_id):
    row = await execute_query(
        "SELECT * FROM orders WHERE id = ?", (order_id,), fetch_one=True
    )
    if row:
        return (
            row["id"],
            row["user_id"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
            row["receipt_file_id"],
            row["admin_receipt_message_id"],
            row["user_feedback_message_id"],
        )
    return None


async def get_orders_by_status(status, limit=20):
    rows = await execute_query(
        "SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT ?",
        (status, limit),
        fetch_all=True,
    )
    return [
        (
            row["id"],
            row["user_id"],
            row["target_user"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
            row["receipt_file_id"],
            row["admin_receipt_message_id"],
            row["user_feedback_message_id"],
        )
        for row in rows
    ]


async def get_stats():
    today = datetime.now().strftime("%Y-%m-%d")
    today_stats = await execute_query(
        "SELECT COUNT(*), SUM(amount_tiyin) FROM orders WHERE status = 'paid' AND created_at LIKE ?",
        (f"{today}%",),
        fetch_one=True,
    )
    total_stats = await execute_query(
        "SELECT COUNT(*), SUM(amount_tiyin) FROM orders WHERE status = 'paid'",
        fetch_one=True,
    )
    return (today_stats[0] or 0, today_stats[1] or 0), (
        total_stats[0] or 0,
        total_stats[1] or 0,
    )


async def get_user_orders(user_id, limit=5):
    rows = await execute_query(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
        fetch_all=True,
    )
    return [
        (
            row["id"],
            row["service_type"],
            row["amount_tiyin"],
            row["status"],
            row["created_at"],
        )
        for row in rows
    ]


async def get_all_users():
    rows = await execute_query("SELECT user_id FROM users", fetch_all=True)
    return [row["user_id"] for row in rows]
