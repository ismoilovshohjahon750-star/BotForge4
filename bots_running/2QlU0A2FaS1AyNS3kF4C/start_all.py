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

    async def read_stream(stream, prefix):
        while True:
            line = await stream.readline()
            if not line:
                break
            print(f"[{prefix}] {line.decode().strip()}")

    await asyncio.gather(
        read_stream(process.stdout, script_name),
        read_stream(process.stderr, f"{script_name} ERR"),
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
