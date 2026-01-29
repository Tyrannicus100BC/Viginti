import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageEnhance


# Constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, '../public/relics')
ICON_SIZE = (256, 256)
# Made cards larger to simulate "zooming in"
CARD_SIZE = (180, 260) 

# Values matched from DeckView.tsx / PlayingCard.tsx special effect indicators
BG_COLORS = {
    'chips': (22, 101, 52),  # Dark Green (#166534)
    'mult': (133, 77, 14)    # Dark Yellow/Brown (#854d0e)
}

CARD_BG_COLOR = (255, 255, 255)
CARD_BORDER_COLOR = (0, 0, 0)
TEXT_COLOR = (0, 0, 0)

SUIT_COLORS_4_COLOR_DECK = {
    'hearts': (231, 76, 60),   # Red
    'diamonds': (52, 152, 219), # Blue
    'spades': (0, 0, 0),       # Black
    'clubs': (0, 0, 0)         # Black
}
SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'spades': '♠',
    'clubs': '♣'
}

# Configuration
RELIC_CONFIGS = [
    # Rank Pair
    {'id': 'rank_pair_chips', 'type': 'chips', 'cards': [('2', ''), ('2', '')], 'mode': 'rank', 'gradient': True},
    {'id': 'rank_pair_mult', 'type': 'mult', 'cards': [('2', ''), ('2', '')], 'mode': 'rank'},
    
    # Rank Triple
    {'id': 'rank_triple_chips', 'type': 'chips', 'cards': [('3', ''), ('3', ''), ('3', '')], 'mode': 'rank'},
    {'id': 'rank_triple_mult', 'type': 'mult', 'cards': [('3', ''), ('3', ''), ('3', '')], 'mode': 'rank'},

    # Rank Run (Four Ace's)
    {'id': 'rank_run_chips', 'type': 'chips', 'cards': [('A', '')] * 4, 'mode': 'rank'},
    {'id': 'rank_run_mult', 'type': 'mult', 'cards': [('A', '')] * 4, 'mode': 'rank'},

    # Flush Pair (Two Hearts)
    {'id': 'flush_pair_chips', 'type': 'chips', 'cards': [('', 'hearts'), ('', 'hearts')], 'mode': 'suit'},
    {'id': 'flush_pair_mult', 'type': 'mult', 'cards': [('', 'hearts'), ('', 'hearts')], 'mode': 'suit'},

    # Flush Triple (Three Clubs)
    {'id': 'flush_triple_chips', 'type': 'chips', 'cards': [('', 'clubs'), ('', 'clubs'), ('', 'clubs')], 'mode': 'suit'},
    {'id': 'flush_triple_mult', 'type': 'mult', 'cards': [('', 'clubs'), ('', 'clubs'), ('', 'clubs')], 'mode': 'suit'},

    # Flush Run (Four Spades)
    {'id': 'flush_run_chips', 'type': 'chips', 'cards': [('', 'spades')] * 4, 'mode': 'suit'},
    {'id': 'flush_run_mult', 'type': 'mult', 'cards': [('', 'spades')] * 4, 'mode': 'suit'},

    # Straight Pair (5, 6)
    {'id': 'straight_pair_chips', 'type': 'chips', 'cards': [('5', 'spades'), ('6', 'hearts')], 'mode': 'rank_only_diff_suit'},
    {'id': 'straight_pair_mult', 'type': 'mult', 'cards': [('5', 'spades'), ('6', 'hearts')], 'mode': 'rank_only_diff_suit'},

    # Straight Triple (5, 6, 7)
    {'id': 'straight_triple_chips', 'type': 'chips', 'cards': [('5', ''), ('6', ''), ('7', '')], 'mode': 'rank_only'},
    {'id': 'straight_triple_mult', 'type': 'mult', 'cards': [('5', ''), ('6', ''), ('7', '')], 'mode': 'rank_only'},

    # Straight Run (1, 2, 3, 4)
    {'id': 'straight_run_chips', 'type': 'chips', 'cards': [('1', ''), ('2', ''), ('3', ''), ('4', '')], 'mode': 'rank_only'},
    {'id': 'straight_run_mult', 'type': 'mult', 'cards': [('1', ''), ('2', ''), ('3', ''), ('4', '')], 'mode': 'rank_only'},
]

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def draw_rounded_rect(draw, xy, cornerradius, fill, outline=None, width=1):
    draw.rounded_rectangle(
        xy,
        radius=cornerradius,
        fill=fill,
        outline=outline,
        width=width
    )

def create_diagonal_gradient(size, color1, color2, angle_deg=30):
    """Creates a diagonal gradient from bottom-left to top-right with 33/33/33 control points.
    Angle 45 is standard diagonal. 30 is 15 deg CW from prev (45 -> 50 -> 30?). 
    Wait, prev turn was 50. User said rotate 20 deg CW. 50 - 20 = 30.
    """
    base = Image.new('RGB', size, color1)
    top = Image.new('RGB', size, color2)
    mask = Image.new('L', size)
    
    angle_rad = math.radians(angle_deg)
    v_x = math.cos(angle_rad)
    v_y = math.sin(angle_rad)
    
    # Calculate max distance for normalization
    # Points to check: (0,0), (size[0], 0), (0, size[1]), (size[0], size[1])
    # However, since we use y_inv = h - y, bottom-left is (0,0)
    max_dist = size[0] * v_x + size[1] * v_y

    # Create diagonal mask
    for y in range(size[1]):
        y_inv = size[1] - y
        for x in range(size[0]):
            dist_val = x * v_x + y_inv * v_y
            dist = dist_val / max_dist
            
            # 46/8/46 Logic
            if dist < 0.46:
                norm_dist = 0
            elif dist > 0.54:
                norm_dist = 1
            else:
                # Map 0.46 -> 0.54 to 0 -> 1
                norm_dist = (dist - 0.46) / 0.08
                
            mask.putpixel((x, y), int(norm_dist * 255))
            
    return Image.composite(top, base, mask).convert('RGBA')

def create_card_image(rank, suit, opacity=1.0, is_flush_run=False):
    card = Image.new('RGBA', CARD_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)

    # Draw card background
    draw_rounded_rect(draw, [(0, 0), (CARD_SIZE[0]-1, CARD_SIZE[1]-1)], 16, CARD_BG_COLOR, CARD_BORDER_COLOR, 3)

    # Font sizing
    if rank:
        # User requested uniform bold ranks. 
        # Using a fixed size for ALL ranks to ensure consistency.
        font_size = 80
    else:
        # Suit only indicators
        # Base was 70. PreviousTurn: +10% (77). 
        # ThisTurn: Flush Run Spades +15%
        font_size = 77 
        if suit == 'spades':
            font_size = int(font_size * 1.2) # Earlier preference for 20% larger spades
            if is_flush_run:
                # User request: reduce by 7% (from prev 1.15x increase)
                # Current baseline is 92 (77 * 1.2). 
                # Prev was 106 (92 * 1.15). 
                # New: 106 * 0.93 = 98.
                font_size = int(font_size * 1.15 * 0.93)
        
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
    except:
        try:
             font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except:
            font = ImageFont.load_default()

    text = ""
    color = TEXT_COLOR
    
    if rank and not suit:
        text = rank
    elif suit and not rank:
        text = SUIT_SYMBOLS.get(suit, '?')
        color = SUIT_COLORS_4_COLOR_DECK.get(suit, (0,0,0))
    elif rank and suit:
         text = rank
        
    if text:
        padding_x = 15
        padding_y = 10
        
        if is_flush_run and suit == 'spades':
            # move up and to the left by 3%
            padding_x -= int(CARD_SIZE[0] * 0.03)
            padding_y -= int(CARD_SIZE[1] * 0.03)
            
        draw.text((padding_x, padding_y), text, fill=color, font=font)
        
    # Apply opacity
    if opacity < 1.0:
        alpha = card.split()[3]
        alpha = ImageEnhance.Brightness(alpha).enhance(opacity)
        card.putalpha(alpha)

    return card

def generate_icon(config):
    # Canvas
    img = Image.new('RGBA', ICON_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Fill
    if config.get('gradient'):
        img = create_diagonal_gradient(ICON_SIZE, BG_COLORS['chips'], BG_COLORS['mult'], angle_deg=30)
    else:
        bg_color = BG_COLORS.get(config['type'], (200, 200, 200))
        draw.rectangle([(0,0), ICON_SIZE], fill=bg_color)
    
    # Categorical Layout Logic
    cards = config['cards']
    num_cards = len(cards)
    
    if num_cards == 2:
        # Pairs: Move both cards up/left 15%. Move 2nd card up additional 10%.
        pivot_y = 650
        pivot_x = 200
        radius = 400
        start_angle = -5
        
        offset_up_left = int(256 * 0.15)
        offset_extra_up = int(256 * 0.10)
        
        for i, (rank, suit) in enumerate(cards):
            card_img = create_card_image(rank, suit)
            angle = start_angle + (i * 10)
            rad = math.radians(angle)
            
            cx = pivot_x + radius * math.sin(rad) - offset_up_left
            cy = pivot_y - radius * math.cos(rad) - offset_up_left
            if i == 1:
                cy -= offset_extra_up
                
            rotated_card = card_img.rotate(-angle, expand=True, resample=Image.BICUBIC)
            rc_w, rc_h = rotated_card.size
            img.paste(rotated_card, (int(cx - rc_w/2), int(cy - rc_h/2)), rotated_card)

    elif num_cards == 3:
        # Triples: Shift all cards left 10%, center card up 10%. Move all up 15%.
        # Last card index 2: Shift left 7% additional, rotate 3 more deg clockwise
        pivot_y = 612 # -15%
        pivot_x = 203 # center indicator
        radius = 400
        start_angle = -10
        
        offset_left = int(256 * 0.10)
        offset_center_up = int(256 * 0.10)
        offset_last_left = int(256 * 0.07)
        
        for i, (rank, suit) in enumerate(cards):
            card_img = create_card_image(rank, suit)
            angle = start_angle + (i * 10)
            rad = math.radians(angle)
            
            cx = pivot_x + radius * math.sin(rad) - offset_left
            cy = pivot_y - radius * math.cos(rad)
            
            if i == 1: # Center card
                cy -= offset_center_up
            
            if i == 2: # Last card
                cx -= offset_last_left
                cy += int(256 * 0.05) # Move down 5%
                angle += 3 # 3 more degrees CW
            
            rotated_card = card_img.rotate(-angle, expand=True, resample=Image.BICUBIC)
            rc_w, rc_h = rotated_card.size
            img.paste(rotated_card, (int(cx - rc_w/2), int(cy - rc_h/2)), rotated_card)

    elif num_cards == 4:
        # Runs: 2 top cards, 2 bottom cards.
        # Top Fan: shift left 10%, down 10%. (Existing)
        # NEW: shift top fan right 10% (net 0?), up 5% (net down 5%?).
        
        radius = 400
        is_flush_run = config['id'].startswith('flush_run')
        
        offset_top_x = 0 # (left 10% - right 10%)
        offset_top_y = int(256 * 0.05) # (down 10% - up 5%)
        offset_bot_x = -int(256 * 0.08) # (15% left - 7% right = 8% left)
        offset_bot_up = int(256 * 0.40) # (25% + 15%)
        
        # Top Fan (2 cards)
        pivot_y_top = 550
        pivot_x_top = 200
        for i in range(2):
            rank, suit = cards[i]
            card_img = create_card_image(rank, suit, is_flush_run=is_flush_run)
            angle = -5 + (i * 10)
            rad = math.radians(angle)
            cx = pivot_x_top + radius * math.sin(rad) + offset_top_x
            cy = pivot_y_top - radius * math.cos(rad) + offset_top_y
            if i == 0:
                cy += int(256 * 0.05) # (10% down - 5% up = 5% down)
            rotated_card = card_img.rotate(-angle, expand=True, resample=Image.BICUBIC)
            rc_w, rc_h = rotated_card.size
            img.paste(rotated_card, (int(cx - rc_w/2), int(cy - rc_h/2)), rotated_card)
            
        # Bottom Fan (2 cards)
        pivot_y_bot = 750
        pivot_x_bot = 200
        for i in range(2):
            rank, suit = cards[2+i]
            card_img = create_card_image(rank, suit, is_flush_run=is_flush_run)
            angle = -5 + (i * 10)
            rad = math.radians(angle)
            cx = pivot_x_bot + radius * math.sin(rad) + offset_bot_x
            cy = pivot_y_bot - radius * math.cos(rad) - offset_bot_up
            if i == 0:
                cy += int(256 * 0.10) # Keep from prev request
            if i == 1:
                # User Request: rotate 2 more deg CW, move down 7%
                angle += 2
                cy += int(256 * 0.07)
                
            rotated_card = card_img.rotate(-angle, expand=True, resample=Image.BICUBIC)
            rc_w, rc_h = rotated_card.size
            img.paste(rotated_card, (int(cx - rc_w/2), int(cy - rc_h/2)), rotated_card)

    return img

def main():
    ensure_dir(OUTPUT_DIR)
    for config in RELIC_CONFIGS:
        print(f"Generating angle_{config['id']}...")
        img = generate_icon(config)
        filename = f"angle_{config['id']}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        img.save(filepath, "PNG")

if __name__ == "__main__":
    main()
