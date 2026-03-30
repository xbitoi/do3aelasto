"""
Arabic font downloader for the Telegram Bot Studio app.
Downloads freely available Arabic fonts for video text overlay.
"""
import os
import urllib.request
from pathlib import Path


FONTS_DIR = Path(__file__).parent / "fonts"

FONT_URLS = {
    "bein.ttf": "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf",
    "boutros.ttf": "https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Regular.ttf",
    "dima.ttf": "https://github.com/google/fonts/raw/main/ofl/scheherazadenew/ScheherazadeNew-Regular.ttf",
    "takeaway.ttf": "https://github.com/google/fonts/raw/main/ofl/lemonada/Lemonada%5Bwght%5D.ttf",
}


def ensure_fonts():
    FONTS_DIR.mkdir(exist_ok=True)

    for font_file, url in FONT_URLS.items():
        font_path = FONTS_DIR / font_file
        if not font_path.exists():
            try:
                print(f"تحميل خط {font_file}...")
                urllib.request.urlretrieve(url, str(font_path))
                print(f"✅ تم تحميل {font_file}")
            except Exception as e:
                print(f"⚠️ فشل تحميل {font_file}: {e}")
                _create_fallback_font(font_path)


def _create_fallback_font(font_path: Path):
    try:
        import subprocess
        result = subprocess.run(
            ["fc-list", ":lang=ar", "--format=%{file}\n"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            arabic_fonts = [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
            if arabic_fonts:
                import shutil
                shutil.copy(arabic_fonts[0], str(font_path))
                print(f"✅ استخدام خط نظام: {arabic_fonts[0]}")
                return
    except Exception:
        pass

    try:
        import glob
        nix_fonts = glob.glob("/nix/store/*/share/fonts/**/*.ttf", recursive=True)
        if nix_fonts:
            import shutil
            shutil.copy(nix_fonts[0], str(font_path))
            print(f"✅ استخدام خط Nix: {nix_fonts[0]}")
    except Exception:
        print(f"⚠️ لم يتم العثور على خط للاحتياط")


if __name__ == "__main__":
    ensure_fonts()
    print("تم التحقق من الخطوط")
