"""Generate crisp, transparent hand icons with no third-party dependencies.

Run python3 scripts/generate_hand_icons.py to rebuild public/hands/*.svg.
Ranks use vector paths so the artwork never depends on installed fonts.
"""

from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "hands"
INK = "#243545"
PAPER = "#fff7e8"
RED = "#ef655d"
BLACK = "#171b20"
GOLD = "#ffd76a"
# Match the orange glow used by the game's Viginti presentation.
VIGINTI_ORANGE = "#ffaa00"


def svg(title, artwork):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n'
        f'  <title>{title}</title>\n{artwork}\n</svg>\n'
    )


def card_symbol(value):
    if value == 'spade':
        return (f'<path d="M13 8C9 13 4 16 4 21C4 27 10 29 13 25'
                f'C16 29 22 27 22 21C22 16 17 13 13 8Z M13 24L9 32H17Z" fill="{BLACK}"/>')
    shapes = {
        2: '<path d="M6 14C6 6 21 6 21 14C21 19 12 22 6 29H21"/>',
        7: '<path d="M6 9H21L11 29"/>',
        8: ('<path d="M13 19C3 19 3 8 13 8C23 8 23 19 13 19Z'
            'M13 19C2 19 2 30 13 30C24 30 24 19 13 19Z"/>'),
    }
    return f'<g stroke="{BLACK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">{shapes[value]}</g>'


def card(value, transform):
    return (f'  <g transform="{transform}">\n'
            f'    <rect width="29" height="46" rx="4" fill="{PAPER}" stroke="{INK}" stroke-width="2.5"/>\n'
            f'    {card_symbol(value)}\n  </g>')


def two_cards(back_symbol, front_symbol):
    # All patterns share this silhouette and symbol placement. Keep both exposed.
    return '\n'.join([
        card(back_symbol, 'translate(7 14) rotate(-10 14.5 23)'),
        card(front_symbol, 'translate(29 7) rotate(9 14.5 23)'),
    ])


def crown(viginti=False):
    # The same dark crown band reserves room for 21 even on the regular Win.
    artwork = f'''
  <path d="M7 16L19 26L32 8L45 26L57 16L51 49H13Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="13" y="34" width="38" height="21" rx="4" fill="{INK}" stroke="{GOLD}" stroke-width="3"/>
  <path d="M28 27L32 22L36 27L32 31Z" fill="{INK}"/>'''
    if viginti:
        artwork += f'''
  <g stroke="{VIGINTI_ORANGE}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 40C20 35 30 35 30 40C30 43 24 45 20 50H30"/>
    <path d="M36 40L41 37V50M36 50H45"/>
  </g>'''
    return artwork


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    artwork = {
        'pair': svg('Pair: two twos', two_cards(2, 2)),
        'straight': svg('Straight: seven followed by eight', two_cards(7, 8)),
        'flush': svg('Flush: two spades', two_cards('spade', 'spade')),
        'win': svg('Win: crown', crown()),
        'viginti': svg('Viginti: crown with an orange 21', crown(viginti=True)),
        'lose': svg('Lose: card marked with a cross', f'''
  <g transform="rotate(-9 30 32)">
    <rect x="13" y="6" width="34" height="49" rx="5" fill="{PAPER}" stroke="{INK}" stroke-width="2.5"/>
    <path d="M20 13H25M20 18H23M35 43H40M37 48H40" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M23 24L37 38M37 24L23 38" stroke="{RED}" stroke-width="5.5" stroke-linecap="round"/>
  </g>'''),
        'bust': svg('Bust: a broken card', f'''
  <g stroke="{INK}" stroke-width="2.5" stroke-linejoin="round">
    <path d="M16 6H44Q49 6 49 11V27L36 22L39 31L27 26L16 31L11 26V11Q11 6 16 6Z" fill="{PAPER}" transform="rotate(-8 30 20)"/>
    <path d="M15 36L27 31L38 36L35 27L49 33V53Q49 58 44 58H20Q15 58 15 53Z" fill="{PAPER}" transform="rotate(9 32 43)"/>
  </g>
  <path d="M12 29L25 33L30 28L37 35L50 30" stroke="{RED}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 19L1 15M56 20L61 16M5 44L1 47M55 45L61 49" stroke="{RED}" stroke-width="3" stroke-linecap="round"/>
  <path d="M20 14H26M20 19H24M37 47H43M39 52H43" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>'''),
    }
    for name, content in artwork.items():
        (OUTPUT_DIR / f'{name}.svg').write_text(content, encoding='utf-8')
        print(f'Generated {name}.svg')


if __name__ == '__main__':
    main()
