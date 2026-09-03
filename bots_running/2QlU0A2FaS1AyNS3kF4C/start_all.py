import asyncio
import subprocess
import sys
import os

# Skriptlaringiz joylashgan katalogga yo'lni belgilang
# Agar bu fayl (start_all.py) boshqa skriptlar bilan bir xil katalogda bo'lsa, quyidagi yo'l to'g'ri bo'ladi.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_BOT_PATH = os.path.join(SCRIPT_DIR, "main.py")
MONITOR1_PATH = os.path.join(SCRIPT_DIR, "monitor1.py")
MONITOR2_PATH = os.path.join(SCRIPT_DIR, "monitor2.py")
MONITOR3_PATH = os.path.join(SCRIPT_DIR, "monitor3.py")


async def run_script(script_path: str):
    """Python skriptini alohida jarayon sifatida ishga tushiradi va uning chiqishini chop etadi."""
    script_name = os.path.basename(script_path)
    print(f"🚀 {script_name} ishga tushirilmoqda...")
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        script_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def read_stream(stream, script_name, is_err=False):
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue

            # Transient Telethon / Telegram network keep-alive disconnects (auto-reconnected by Telethon)
            if "during disconnect" in text and ("ConnectionResetError" in text or "Connection reset by peer" in text):
                continue
            if "Server closed the connection" in text and "Connection reset by peer" in text:
                continue
            if "Connection closed while receiving data" in text and "Connection reset by peer" in text:
                continue

            # In Python, standard logging sends INFO/WARNING to stderr. Don't label them as ERR.
            if is_err:
                is_real_error = any(kw in text for kw in ("Traceback (most recent call last):", "Error:", "Exception:", "CRITICAL:"))
                if is_real_error and not text.startswith("INFO:"):
                    print(f"[{script_name} ERR] {text}", flush=True)
                else:
                    print(f"[{script_name}] {text}", flush=True)
            else:
                print(f"[{script_name}] {text}", flush=True)

    await asyncio.gather(
        read_stream(process.stdout, script_name, is_err=False),
        read_stream(process.stderr, script_name, is_err=True),
    )
    await process.wait()
    print(f"✅ {script_name} {process.returncode} kod bilan yakunlandi.")


async def main():
    """Barcha bot komponentlarini bir vaqtning o'zida ishga tushiradi."""
    print("Barcha bot komponentlari ishga tushirilmoqda...")
    await asyncio.gather(
        run_script(MAIN_BOT_PATH),
        run_script(MONITOR1_PATH),
        run_script(MONITOR2_PATH),
        run_script(MONITOR3_PATH),
    )
    print("Barcha bot komponentlari ishini yakunladi.")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main())
