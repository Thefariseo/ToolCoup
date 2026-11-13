"""Anagrafe dei paesi per il database dei golpe.

Chiave: codice Correlates of War (COW). Per ogni paese: nome canonico e termini di ricerca
(nomi alternativi, nomi storici, aggettivi inglesi) usati per riconoscerlo nei testi di
Wikidata e Wikipedia. Gli stati storici confluiscono nel successore abituale nei dataset
(Impero ottomano -> Turchia, URSS -> Russia, Jugoslavia -> Serbia, ecc.).
"""
from __future__ import annotations

import re
import unicodedata

# ccode: (nome canonico, [termini aggiuntivi])
COUNTRIES: dict[int, tuple[str, list[str]]] = {
    2: ("United States", ["united states of america", "usa", "american"]),
    20: ("Canada", ["canadian"]),
    31: ("Bahamas", ["bahamian"]),
    40: ("Cuba", ["cuban"]),
    41: ("Haiti", ["haitian"]),
    42: ("Dominican Republic", ["dominican"]),
    51: ("Jamaica", ["jamaican"]),
    52: ("Trinidad and Tobago", ["trinidad", "trinidadian"]),
    53: ("Barbados", []),
    54: ("Dominica", []),
    55: ("Grenada", ["grenadian"]),
    70: ("Mexico", ["mexican"]),
    80: ("Belize", ["belizean"]),
    90: ("Guatemala", ["guatemalan"]),
    91: ("Honduras", ["honduran"]),
    92: ("El Salvador", ["salvadoran", "salvadorean"]),
    93: ("Nicaragua", ["nicaraguan"]),
    94: ("Costa Rica", ["costa rican"]),
    95: ("Panama", ["panamanian"]),
    100: ("Colombia", ["colombian", "new granada"]),
    101: ("Venezuela", ["venezuelan"]),
    110: ("Guyana", ["guyanese"]),
    115: ("Suriname", ["surinam", "surinamese"]),
    130: ("Ecuador", ["ecuadorian", "ecuadorean"]),
    135: ("Peru", ["peruvian"]),
    140: ("Brazil", ["brazilian"]),
    145: ("Bolivia", ["bolivian"]),
    150: ("Paraguay", ["paraguayan"]),
    155: ("Chile", ["chilean"]),
    160: ("Argentina", ["argentine", "argentinian"]),
    165: ("Uruguay", ["uruguayan"]),
    200: ("United Kingdom", ["britain", "british", "england"]),
    205: ("Ireland", ["irish"]),
    210: ("Netherlands", ["dutch"]),
    211: ("Belgium", ["belgian"]),
    212: ("Luxembourg", []),
    220: ("France", ["french"]),
    225: ("Switzerland", ["swiss"]),
    230: ("Spain", ["spanish"]),
    235: ("Portugal", ["portuguese"]),
    255: ("Germany", ["german", "weimar", "prussia", "bavaria", "bavarian"]),
    245: ("Bavaria (stato storico)", []),
    265: ("East Germany", ["german democratic republic"]),
    290: ("Poland", ["polish"]),
    305: ("Austria", ["austrian"]),
    310: ("Hungary", ["hungarian"]),
    315: ("Czechoslovakia", ["czechoslovak", "czech republic", "czech"]),
    317: ("Slovakia", ["slovak"]),
    325: ("Italy", ["italian"]),
    338: ("Malta", ["maltese"]),
    339: ("Albania", ["albanian"]),
    341: ("Montenegro", ["montenegrin"]),
    343: ("North Macedonia", ["macedonia", "macedonian"]),
    344: ("Croatia", ["croatian"]),
    345: ("Serbia", ["yugoslavia", "yugoslav", "serbian", "serbia and montenegro",
                     "kingdom of serbs croats and slovenes"]),
    346: ("Bosnia and Herzegovina", ["bosnia", "bosnian"]),
    347: ("Kosovo", ["kosovar"]),
    349: ("Slovenia", ["slovenian"]),
    350: ("Greece", ["greek", "hellenic"]),
    352: ("Cyprus", ["cypriot"]),
    355: ("Bulgaria", ["bulgarian"]),
    359: ("Moldova", ["moldovan"]),
    360: ("Romania", ["romanian", "rumania"]),
    365: ("Russia", ["soviet union", "ussr", "soviet", "russian", "russian empire", "russian sfsr"]),
    366: ("Estonia", ["estonian"]),
    367: ("Latvia", ["latvian"]),
    368: ("Lithuania", ["lithuanian"]),
    369: ("Ukraine", ["ukrainian"]),
    370: ("Belarus", ["belarusian", "byelorussia"]),
    371: ("Armenia", ["armenian"]),
    372: ("Georgia", ["georgian"]),
    373: ("Azerbaijan", ["azerbaijani", "azeri"]),
    375: ("Finland", ["finnish"]),
    380: ("Sweden", ["swedish"]),
    385: ("Norway", ["norwegian"]),
    390: ("Denmark", ["danish"]),
    395: ("Iceland", ["icelandic"]),
    402: ("Cape Verde", ["cabo verde"]),
    403: ("Sao Tome and Principe", ["sao tome", "santomean"]),
    404: ("Guinea-Bissau", ["guinea bissau", "bissau guinean", "portuguese guinea"]),
    411: ("Equatorial Guinea", ["equatoguinean"]),
    420: ("Gambia", ["the gambia", "gambian"]),
    432: ("Mali", ["malian"]),
    433: ("Senegal", ["senegalese"]),
    434: ("Benin", ["dahomey", "beninese", "dahomeyan"]),
    435: ("Mauritania", ["mauritanian"]),
    436: ("Niger", ["nigerien"]),
    437: ("Ivory Coast", ["cote d ivoire", "cote divoire", "ivorian"]),
    438: ("Guinea", ["guinean"]),
    439: ("Burkina Faso", ["upper volta", "burkinabe", "burkinabe", "voltaic"]),
    450: ("Liberia", ["liberian"]),
    451: ("Sierra Leone", ["sierra leonean"]),
    452: ("Ghana", ["ghanaian", "gold coast"]),
    461: ("Togo", ["togolese"]),
    471: ("Cameroon", ["cameroonian"]),
    475: ("Nigeria", ["nigerian"]),
    481: ("Gabon", ["gabonese"]),
    482: ("Central African Republic", ["central african", "central african empire", "cen afr rep"]),
    483: ("Chad", ["chadian"]),
    484: ("Republic of Congo", ["congo brazzaville", "congo-brazzaville", "republic of the congo",
                                "congo", "people s republic of the congo"]),
    490: ("Democratic Republic of Congo", ["democratic republic of the congo", "congo kinshasa",
                                           "congo-kinshasa", "dr congo", "d r congo", "drc", "zaire", "zairian",
                                           "congo leopoldville", "congo democratic republic of"]),
    500: ("Uganda", ["ugandan"]),
    501: ("Kenya", ["kenyan"]),
    510: ("Tanzania", ["tanzanian", "tanganyika"]),
    511: ("Zanzibar", []),
    516: ("Burundi", ["burundian"]),
    517: ("Rwanda", ["rwandan"]),
    520: ("Somalia", ["somali"]),
    522: ("Djibouti", ["djiboutian"]),
    530: ("Ethiopia", ["ethiopian", "abyssinia"]),
    531: ("Eritrea", ["eritrean"]),
    540: ("Angola", ["angolan"]),
    541: ("Mozambique", ["mozambican"]),
    551: ("Zambia", ["zambian"]),
    552: ("Zimbabwe", ["rhodesia", "zimbabwean"]),
    553: ("Malawi", ["malawian"]),
    560: ("South Africa", ["south african"]),
    563: ("Transvaal", []),
    564: ("Orange Free State", []),
    565: ("Namibia", ["namibian"]),
    570: ("Lesotho", ["basotho"]),
    571: ("Botswana", []),
    572: ("eSwatini", ["swaziland", "eswatini", "swazi"]),
    580: ("Madagascar", ["malagasy"]),
    581: ("Comoros", ["comoro islands", "comorian"]),
    590: ("Mauritius", ["mauritian"]),
    591: ("Seychelles", ["seychellois"]),
    600: ("Morocco", ["moroccan"]),
    615: ("Algeria", ["algerian"]),
    616: ("Tunisia", ["tunisian"]),
    620: ("Libya", ["libyan"]),
    625: ("Sudan", ["sudanese", "sudan north"]),
    626: ("South Sudan", ["south sudanese"]),
    630: ("Iran", ["iranian", "persia", "persian"]),
    640: ("Turkey", ["turkish", "ottoman empire", "ottoman", "turkiye"]),
    645: ("Iraq", ["iraqi"]),
    651: ("Egypt", ["egyptian", "united arab republic"]),
    652: ("Syria", ["syrian"]),
    660: ("Lebanon", ["lebanese"]),
    663: ("Jordan", ["jordanian", "transjordan"]),
    666: ("Israel", ["israeli"]),
    667: ("Palestine", ["palestine west bank", "west bank", "palestinian"]),   # codice convenzionale, non COW
    670: ("Saudi Arabia", ["saudi"]),
    678: ("Yemen", ["yemeni", "north yemen", "yemen arab republic", "yemen north",
                    "kingdom of yemen", "mutawakkilite kingdom of yemen"]),
    680: ("South Yemen", ["yemen south", "yemen people s republic",
                          "people s democratic republic of yemen"]),
    690: ("Kuwait", ["kuwaiti"]),
    692: ("Bahrain", ["bahraini"]),
    694: ("Qatar", ["qatari"]),
    696: ("United Arab Emirates", ["uae", "abu dhabi", "sharjah", "emirati", "united arab em"]),
    698: ("Oman", ["omani", "muscat and oman"]),
    700: ("Afghanistan", ["afghan"]),
    701: ("Turkmenistan", ["turkmen"]),
    702: ("Tajikistan", ["tajik"]),
    703: ("Kyrgyzstan", ["kyrgyz", "kyrgyz republic"]),
    704: ("Uzbekistan", ["uzbek"]),
    705: ("Kazakhstan", ["kazakh"]),
    710: ("China", ["chinese", "republic of china", "people s republic of china", "qing"]),
    711: ("Tibet", ["tibetan"]),
    712: ("Mongolia", ["mongolian"]),
    713: ("Taiwan", ["taiwanese"]),
    730: ("Korea", ["korean empire", "joseon"]),
    731: ("North Korea", ["korea north", "democratic people s republic of korea"]),
    732: ("South Korea", ["korea south", "republic of korea", "south korean"]),
    740: ("Japan", ["japanese", "empire of japan"]),
    750: ("India", ["indian"]),
    760: ("Bhutan", ["bhutanese"]),
    770: ("Pakistan", ["pakistani"]),
    771: ("Bangladesh", ["bangladeshi"]),
    775: ("Myanmar", ["burma", "burmese", "myanmar burma"]),
    780: ("Sri Lanka", ["ceylon", "sri lankan"]),
    781: ("Maldives", ["maldivian"]),
    790: ("Nepal", ["nepalese", "nepali"]),
    800: ("Thailand", ["thai", "siam", "siamese"]),
    811: ("Cambodia", ["cambodian", "kampuchea", "khmer republic"]),
    812: ("Laos", ["laotian", "lao"]),
    816: ("Vietnam", ["north vietnam", "vietnamese", "democratic republic of vietnam", "vietnam north"]),
    817: ("South Vietnam", ["republic of vietnam", "vietnam south", "south vietnamese", "state of vietnam"]),
    820: ("Malaysia", ["malaysian", "malaya"]),
    830: ("Singapore", ["singaporean"]),
    835: ("Brunei", ["bruneian"]),
    840: ("Philippines", ["philippine", "filipino"]),
    850: ("Indonesia", ["indonesian"]),
    860: ("East Timor", ["timor leste", "timor-leste", "timorese"]),
    900: ("Australia", ["australian"]),
    910: ("Papua New Guinea", ["papua new guinean"]),
    920: ("New Zealand", []),
    940: ("Solomon Islands", ["solomon"]),
    935: ("Vanuatu", []),
    950: ("Fiji", ["fijian"]),
    955: ("Tonga", ["tongan"]),
    990: ("Samoa", ["samoan"]),
}

# codici usati da alcune fonti (Gleditsch & Ward, varianti) -> codice canonico
CODE_ALIASES = {260: 255, 679: 678, 316: 315, 818: 816, 529: 530, 769: 770, 364: 365,
                340: 345, 342: 345, 815: 816, 678: 678, 525: 626, 626: 626, 817: 817, 300: 305}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("&", " and ").replace("'", " "))
    return re.sub(r"\s+", " ", s).strip()


def canon_code(code) -> int | None:
    try:
        c = int(code)
    except (TypeError, ValueError):
        return None
    return CODE_ALIASES.get(c, c)


def name_of(code: int) -> str:
    return COUNTRIES[code][0] if code in COUNTRIES else f"ccode {code}"


_TERMS: list[tuple[str, int]] = []
for _c, (_n, _t) in COUNTRIES.items():
    for _term in [_n] + _t:
        _TERMS.append((norm(_term), _c))
_EXACT = {t: c for t, c in _TERMS}
# termini lunghi prima: "south sudan" batte "sudan", "guinea bissau" batte "guinea"
_TERMS.sort(key=lambda x: -len(x[0]))
_PATTERNS = [(re.compile(r"\b" + re.escape(t) + r"\b"), c, len(t)) for t, c in _TERMS]


def code_from_name(name: str) -> int | None:
    """Nome di paese (anche storico o con qualificatori) -> codice."""
    n = norm(name)
    if n in _EXACT:
        return _EXACT[n]
    return code_from_text(n)


def code_exact(name: str) -> int | None:
    """Solo corrispondenza esatta con un nome noto: "French Guiana" non diventa "France"."""
    return _EXACT.get(norm(name))


def code_from_text(text: str) -> int | None:
    """Primo paese citato in un testo libero (a parita' di posizione vince il termine piu' lungo)."""
    n = norm(text)
    best = None
    for pat, c, ln in _PATTERNS:
        m = pat.search(n)
        if m and (best is None or m.start() < best[0] or (m.start() == best[0] and ln > best[2])):
            best = (m.start(), c, ln)
    return best[1] if best else None
