"""สร้าง assets/monument.css จาก tools/monument_theme.css + ภาพเวกเตอร์ Monument Valley
รัน: python3 tools/monument_art.py"""
import urllib.parse, pathlib

def uri(svg_str):
    s = ' '.join(svg_str.strip().split())
    return 'url("data:image/svg+xml,' + urllib.parse.quote(s, safe=' =:/;,') + '")'

# ตัวละครเรขาคณิตสีขาวเรืองแสง (แรงบันดาลใจสไตล์ Monument Valley)
TRAVELER = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 30">
  <defs>
    <radialGradient id="a" cx="50%" cy="62%" r="48%">
      <stop offset="0%" stop-color="#67e8f9" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="11" cy="24" rx="9" ry="5" fill="url(#a)"/>
  <line x1="9.6" y1="22" x2="9.2" y2="27.2" stroke="#dce7ff" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="12.4" y1="22" x2="13.2" y2="27.2" stroke="#eef4ff" stroke-width="1.3" stroke-linecap="round"/>
  <polygon points="11,11.5 16.2,23.2 5.8,23.2" fill="#ffffff"/>
  <polygon points="11,11.5 16.2,23.2 11,23.2" fill="#dbe8ff" opacity=".45"/>
  <circle cx="11" cy="10.2" r="2.2" fill="#232c48"/>
  <polygon points="11,2 15.2,10.2 6.8,10.2" fill="#ffffff"/>
  <polygon points="11,2 15.2,10.2 11,10.2" fill="#cfdfff" opacity=".4"/>
</svg>
""")

# แท่นโคมคริสตัลปลายทาง (แทนธงเส้นชัย)
BEACON = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 30">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="48%">
      <stop offset="0%" stop-color="#ffe28a" stop-opacity=".85"/>
      <stop offset="55%" stop-color="#5eead4" stop-opacity=".35"/>
      <stop offset="100%" stop-color="#5eead4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="11" cy="10" r="9.5" fill="url(#g)"/>
  <circle cx="11" cy="10" r="6.8" fill="none" stroke="#ffd97d" stroke-opacity=".5" stroke-width=".7"/>
  <polygon points="11,3.5 15,10 11,16.5 7,10" fill="#fff7d6"/>
  <polygon points="11,3.5 15,10 11,16.5" fill="#5eead4" opacity=".6"/>
  <polygon points="11,18.5 16,21 11,23.5 6,21" fill="#8ea4d2"/>
  <polygon points="6,21 11,23.5 11,29 6,26.5" fill="#465585"/>
  <polygon points="16,21 11,23.5 11,29 16,26.5" fill="#2d375c"/>
</svg>
""")

# ฉากแถบอ่านด้านบน (Dark Mode: วิหารกลางคืน + จันทร์เสี้ยว + ซุ้มโค้ง + แสงไฟอุ่น)
BAR_D = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 34" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#11172e"/>
      <stop offset="58%" stop-color="#282552"/>
      <stop offset="100%" stop-color="#6e4176"/>
    </linearGradient>
    <radialGradient id="mg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe799" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#ffe799" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="34" fill="url(#sd)"/>
  <!-- Stars -->
  <g fill="#e6edff" opacity=".75">
    <circle cx="42" cy="7" r=".9"/><circle cx="118" cy="5" r=".7"/><circle cx="185" cy="9" r="1"/>
    <circle cx="268" cy="6" r=".8"/><circle cx="342" cy="8" r=".7"/><circle cx="425" cy="5" r=".9"/>
    <circle cx="512" cy="8" r=".8"/><circle cx="585" cy="6" r="1"/><circle cx="305" cy="11" r=".6"/>
  </g>
  <!-- Crescent Moon -->
  <circle cx="88" cy="12" r="11" fill="url(#mg)"/>
  <path d="M88 6.5a5.2 5.2 0 1 0 5.8 7 4.2 4.2 0 1 1-5.8-7z" fill="#ffe89c"/>
  <!-- Distant misty spires -->
  <g fill="#2b2b58" opacity=".7">
    <path d="M135 34V18l6-7 6 7v16z"/><path d="M295 34V20l5-6 5 6v14z"/>
    <path d="M475 34V16l7-8 7 8v18z"/><path d="M560 34V21l5-5 5 5v13z"/>
  </g>
  <!-- Midground Monument Valley Arched Viaducts -->
  <g fill="#212648">
    <path d="M158 34V14l8-7 8 7v20h-4v-9a4 4 0 0 0-8 0v9z"/>
    <path d="M174 22h56v12h-6v-7a6 6 0 0 0-12 0v7h-8v-7a6 6 0 0 0-12 0v7h-18z"/>
    <path d="M350 34V12l9-7 9 7v22h-5v-10a4 4 0 0 0-8 0v10z"/>
    <path d="M368 23h44v11h-6v-6a5 5 0 0 0-10 0v6h-8v-6a5 5 0 0 0-10 0v6h-10z"/>
    <path d="M518 34V15l7-6 7 6v19h-4v-8a3 3 0 0 0-6 0v8z"/>
  </g>
  <!-- Subtle illuminated ridge & warm lantern windows -->
  <path d="M174 22h56M368 23h44" stroke="#5eead4" stroke-opacity=".55" stroke-width="1"/>
  <g fill="#ffe28a">
    <rect x="165" y="15" width="2" height="4" rx="1"/>
    <rect x="358" y="13" width="2" height="4.5" rx="1"/>
    <rect x="524" y="17" width="2" height="3.5" rx="1"/>
  </g>
  <g fill="#f284b6" opacity=".8">
    <rect x="197" y="19" width="4" height="2" rx=".5"/>
    <rect x="387" y="20" width="4" height="2" rx=".5"/>
  </g>
</svg>
""")

# ฉากแถบอ่านด้านบน (Light Mode: ปราสาทพาสเทลในหมอกมินต์-พีช)
BAR_L = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 34" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c4e6e4"/>
      <stop offset="55%" stop-color="#e9e3e8"/>
      <stop offset="100%" stop-color="#fce0c8"/>
    </linearGradient>
  </defs>
  <rect width="640" height="34" fill="url(#sl)"/>
  <ellipse cx="120" cy="30" rx="95" ry="9" fill="#ffffff" opacity=".45"/>
  <ellipse cx="440" cy="31" rx="120" ry="10" fill="#ffffff" opacity=".45"/>
  <!-- Pastel distant spires -->
  <g fill="#9ec7c7" opacity=".75">
    <path d="M130 34V18l6-7 6 7v16z"/><path d="M470 34V16l7-8 7 8v18z"/>
  </g>
  <!-- Pastel rose-cream Monument Valley arches -->
  <g fill="#e69ea8">
    <path d="M162 34V14l8-7 8 7v20h-4v-9a4 4 0 0 0-8 0v9z"/>
    <path d="M354 34V13l8-7 8 7v21h-4v-9a4 4 0 0 0-8 0v9z"/>
    <path d="M518 34V16l7-6 7 6v18h-4v-8a3 3 0 0 0-6 0v8z"/>
  </g>
  <g fill="#f5c6aa">
    <path d="M178 23h52v11h-6v-6a5 5 0 0 0-10 0v6h-8v-6a5 5 0 0 0-10 0v6h-18z"/>
    <path d="M370 24h42v10h-6v-5a4.5 4.5 0 0 0-9 0v5h-8v-5a4.5 4.5 0 0 0-9 0v5h-10z"/>
  </g>
  <path d="M178 23h52M370 24h42" stroke="#ffffff" stroke-opacity=".8" stroke-width="1"/>
</svg>
""")

# ฉากหน้าแรก (Dark Mode: ป้อมปราการไอโซเมตริกใต้จันทร์เสี้ยว+เนบิวลาชมพูคราม)
HERO_D = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 190" preserveAspectRatio="xMaxYMid slice">
  <defs>
    <linearGradient id="hd" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0%" stop-color="#0f152c"/>
      <stop offset="48%" stop-color="#232550"/>
      <stop offset="82%" stop-color="#6c3f75"/>
      <stop offset="100%" stop-color="#2c244d"/>
    </linearGradient>
    <radialGradient id="mh" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe596" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#ffe596" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5eead4" stop-opacity=".35"/>
      <stop offset="100%" stop-color="#5eead4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mistd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#171f3b" stop-opacity="0"/>
      <stop offset="100%" stop-color="#141c34" stop-opacity=".95"/>
    </linearGradient>
  </defs>
  <rect width="900" height="190" fill="url(#hd)"/>
  <!-- Subtle stars -->
  <g fill="#e8efff" opacity=".7">
    <circle cx="90" cy="24" r="1"/><circle cx="210" cy="36" r=".8"/><circle cx="340" cy="18" r="1.1"/>
    <circle cx="480" cy="28" r=".9"/><circle cx="565" cy="16" r="1"/><circle cx="640" cy="40" r=".8"/>
    <circle cx="810" cy="24" r="1.1"/><circle cx="855" cy="52" r=".8"/><circle cx="420" cy="46" r=".7"/>
  </g>
  <!-- Crescent Moon -->
  <circle cx="612" cy="42" r="28" fill="url(#mh)"/>
  <path d="M613 28a12 12 0 1 0 13.5 16.5 9.8 9.8 0 1 1-13.5-16.5z" fill="#ffea9f"/>
  <!-- Sacred geometry halo rings behind main citadel -->
  <g fill="none" stroke="#5eead4" stroke-opacity=".18" stroke-width="1">
    <circle cx="742" cy="64" r="34"/><circle cx="742" cy="64" r="52" stroke-dasharray="3 4"/>
    <circle cx="742" cy="64" r="70" stroke-opacity=".1"/>
  </g>
  <!-- Distant misty onion-dome towers -->
  <g fill="#2b2e5e" opacity=".75">
    <path d="M530 190V110q0-14 14-24 14 10 14 24v80z"/>
    <path d="M825 190V102q0-14 14-24 14 10 14 24v88z"/>
  </g>
  <!-- Main Isometric Monument Citadel (right side) -->
  <!-- Left lower bridge & arches -->
  <polygon points="625,134 695,99 695,190 625,190" fill="#2c355c"/>
  <polygon points="625,134 695,99 715,109 645,144" fill="#92a8d8"/>
  <path d="M645 190v-32a12 12 0 0 1 24 0v32z" fill="#171e38"/>
  <!-- Center tall citadel tower -->
  <polygon points="742,56 774,72 774,190 742,190" fill="#272e52"/>
  <polygon points="710,72 742,56 742,190 710,190" fill="#464d80"/>
  <polygon points="742,40 774,56 742,72 710,56" fill="#c7b5ec"/>
  <!-- Pink twilight dome / roof -->
  <path d="M726 56q0-18 16-28 16 10 16 28z" fill="#e880ad"/>
  <path d="M742 28q16 10 16 28h-16z" fill="#b85a89"/>
  <line x1="742" y1="28" x2="742" y2="17" stroke="#ffd97d" stroke-width="1.5"/>
  <circle cx="742" cy="16" r="2.2" fill="#ffe28a"/>
  <!-- Right stepped staircase & arch -->
  <polygon points="774,116 824,141 824,190 774,190" fill="#1f2544"/>
  <polygon points="774,104 824,129 808,137 758,112" fill="#8299cc"/>
  <path d="M786 190v-28a10 10 0 0 1 20 0v28z" fill="#131932"/>
  <!-- Glowing cyan staircase trim -->
  <polyline points="626,134 695,99 715,109" fill="none" stroke="#5eead4" stroke-width="2" stroke-linecap="round"/>
  <polyline points="758,112 808,137 824,129" fill="none" stroke="#5eead4" stroke-width="1.6" stroke-opacity=".85"/>
  <!-- Warm glowing arched windows & magenta accent tiles -->
  <g fill="#ffe28a">
    <path d="M738 88v-9a4 4 0 0 1 8 0v9z"/>
    <rect x="722" y="102" width="4" height="9" rx="2"/>
    <rect x="756" y="108" width="4" height="8" rx="2"/>
    <circle cx="670" cy="111" r="2.5"/>
  </g>
  <polygon points="670,115 677,118.5 670,122 663,118.5" fill="#f284b6"/>
  <!-- Soft luminous aura around traveler on bridge -->
  <circle cx="688" cy="94" r="16" fill="url(#cg)"/>
  <polygon points="688,83 692,98 684,98" fill="#ffffff"/>
  <polygon points="688,75 691,84 685,84" fill="#ffffff"/>
  <!-- Bottom atmospheric mist fade -->
  <rect y="146" width="900" height="44" fill="url(#mistd)"/>
</svg>
""")

# ฉากหน้าแรก (Light Mode: ปราสาทพาสเทลชมพู-ครีมลอยในหมอกฟ้ามินต์)
HERO_L = uri("""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 190" preserveAspectRatio="xMaxYMid slice">
  <defs>
    <linearGradient id="hl" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0%" stop-color="#c3e8e5"/>
      <stop offset="52%" stop-color="#e5f1ef"/>
      <stop offset="100%" stop-color="#fde4ce"/>
    </linearGradient>
    <linearGradient id="mistl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f3f7f7" stop-opacity="0"/>
      <stop offset="100%" stop-color="#f3f7f7" stop-opacity=".95"/>
    </linearGradient>
  </defs>
  <rect width="900" height="190" fill="url(#hl)"/>
  <!-- Soft glowing sun mist -->
  <circle cx="635" cy="46" r="46" fill="#fff6d6" opacity=".65"/>
  <!-- Sacred geometry rings -->
  <g fill="none" stroke="#2b7a78" stroke-opacity=".15" stroke-width="1">
    <circle cx="742" cy="64" r="36"/><circle cx="742" cy="64" r="56" stroke-dasharray="3 4"/>
  </g>
  <!-- Distant mint/lavender onion domes -->
  <g fill="#9dc8c7" opacity=".65">
    <path d="M535 190V114q0-14 14-24 14 10 14 24v76z"/>
    <path d="M828 190V106q0-14 14-24 14 10 14 24v84z"/>
  </g>
  <!-- Isometric Pastel Citadel -->
  <polygon points="625,134 695,99 695,190 625,190" fill="#d48998"/>
  <polygon points="625,134 695,99 715,109 645,144" fill="#fff3dc"/>
  <path d="M645 190v-32a12 12 0 0 1 24 0v32z" fill="#bfe2e0"/>
  <polygon points="742,56 774,72 774,190 742,190" fill="#de8b9a"/>
  <polygon points="710,72 742,56 742,190 710,190" fill="#f6b3bd"/>
  <polygon points="742,40 774,56 742,72 710,56" fill="#fff4e0"/>
  <!-- Coral-gold dome -->
  <path d="M726 56q0-18 16-28 16 10 16 28z" fill="#77b6ad"/>
  <path d="M742 28q16 10 16 28h-16z" fill="#4f948c"/>
  <circle cx="742" cy="18" r="2.2" fill="#e8a649"/>
  <!-- Right bridge -->
  <polygon points="774,116 824,141 824,190 774,190" fill="#c77a8b"/>
  <polygon points="774,104 824,129 808,137 758,112" fill="#ffeec9"/>
  <path d="M786 190v-28a10 10 0 0 1 20 0v28z" fill="#c7e6e4"/>
  <polyline points="626,134 695,99 715,109" fill="none" stroke="#ffffff" stroke-width="1.8"/>
  <g fill="#5c3d52" opacity=".7">
    <path d="M738 88v-9a4 4 0 0 1 8 0v9z"/>
    <rect x="722" y="102" width="4" height="9" rx="2"/>
  </g>
  <!-- White geometric traveler -->
  <polygon points="688,83 692,98 684,98" fill="#ffffff"/>
  <polygon points="688,75 691,84 685,84" fill="#ffffff"/>
  <rect y="148" width="900" height="42" fill="url(#mistl)"/>
</svg>
""")

css = pathlib.Path(__file__).with_name('monument_theme.css').read_text(encoding='utf-8')
tokens = dict(
    MV_TRAVELER=TRAVELER,
    MV_BEACON=BEACON,
    MV_BAR_D=BAR_D,
    MV_BAR_L=BAR_L,
    MV_HERO_D=HERO_D,
    MV_HERO_L=HERO_L,
)
for k, v in tokens.items():
    css = css.replace('{{' + k + '}}', v)

out = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'monument.css'
out.write_text('/* สร้างจาก tools/monument_theme.css ด้วย tools/monument_art.py — แก้ที่ต้นฉบับแล้วรันใหม่ */\n' + css, encoding='utf-8')
print(out, len(css))
