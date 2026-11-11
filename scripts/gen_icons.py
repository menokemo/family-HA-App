#!/usr/bin/env python3
"""
توليد أيقونات أندرويد من لوجو Secure Family.
المصدر: assets/branding/secure-family-logo.png
بيولّد: ic_launcher / ic_launcher_round (legacy) + ic_launcher_foreground
(adaptive) لكل الكثافات + خلفية navy موحّدة.

الأيقونة التكيّفية (API 26+) بتحط اللوجو جوه المنطقة الآمنة (66%) عشان
نص "Secure Family" مايتقصّش بأي قناع (دائرة/مربع دائري).
"""
from PIL import Image

ROOT = 'android/app/src/main/res'
SRC = 'assets/branding/secure-family-logo.png'

legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
foreground = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

logo = Image.open(SRC).convert('RGBA')

# استخراج لون الخلفية (navy) من أعلى-وسط اللوجو (جوه المربع المدوّر)
px = logo.getpixel((logo.width // 2, int(logo.height * 0.07)))
navy = (px[0], px[1], px[2], 255) if px[3] > 200 else (10, 22, 54, 255)


def centered(img, canvas_size, content_size, bg):
    im = img.copy()
    im.thumbnail((content_size, content_size), Image.LANCZOS)
    canvas = Image.new('RGBA', (canvas_size, canvas_size), bg)
    canvas.paste(im, ((canvas_size - im.width) // 2, (canvas_size - im.height) // 2), im)
    return canvas


# legacy: اللوجو ملء المربع على خلفية navy
for d, sz in legacy.items():
    icon = centered(logo, sz, sz, navy)
    icon.save(f'{ROOT}/mipmap-{d}/ic_launcher.png')
    icon.save(f'{ROOT}/mipmap-{d}/ic_launcher_round.png')

# adaptive foreground: اللوجو داخل المنطقة الآمنة (66%) على شفّاف
for d, sz in foreground.items():
    fg = centered(logo, sz, int(sz * 0.66), (0, 0, 0, 0))
    fg.save(f'{ROOT}/mipmap-{d}/ic_launcher_foreground.png')

# adaptive background: navy موحّد
Image.new('RGBA', (432, 432), navy).save(f'{ROOT}/drawable-nodpi/ic_launcher_background.png')

print(f'navy={navy} — done')
