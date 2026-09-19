import aiosqlite
import os

DB_PATH = os.getenv("DATABASE_PATH", "stomatology.db")

async def create_db_pool():
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    return conn

async def init_db(db):
    # Bemorlar jadvali
    await db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            full_name TEXT,
            phone_number TEXT
        )
    ''')
    # Qabullar jadvali
    await db.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            doctor_id INTEGER,
            appointment_time TEXT,
            status TEXT DEFAULT 'scheduled',
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    ''')
    await db.commit()
