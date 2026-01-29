export type EventType = 'Shop' | 'Blackjack' | 'Boss' | 'Random';

export interface RouletteEvent {
    id: string;
    type: EventType;
    label: string;
    description: string;
    casinoAvailability: number[]; // e.g. [1,2,3,4,5]
    builderChipCost: number;
    availableAtBuilder: boolean;
    // Special flags/data
    isBaseGame?: boolean;
    subType?: 'Standard' | 'Bonus' | 'Scaling' | 'Trader' | 'Builder' | 'Banker' | 'Roulette' | 'Destroyer' | 'Duplicator' | 'Modifier';
}

export const EVENT_DEFINITIONS: RouletteEvent[] = [
    {
        id: 'shop_standard',
        type: 'Shop',
        label: 'Shop',
        description: 'Allows the player to purchase as many charms as they can afford. 5 will be randomly selected',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: true
    },
    {
        id: 'shop_advanced',
        type: 'Shop',
        label: 'Advanced Shop',
        description: 'Allows the player to purchase any number of charms they can afford. Five charm options are offered, with an increased chance of rare charms appearing.',
        casinoAvailability: [3, 4, 5],
        builderChipCost: 3,
        availableAtBuilder: true
    },
    {
        id: 'blackjack_base',
        type: 'Blackjack',
        label: 'Base Game',
        description: 'Standard base game',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: false,
        isBaseGame: true
    },
    {
        id: 'blackjack_charm_bonus',
        type: 'Blackjack',
        label: 'Charm Bonus',
        description: 'Gain 1 charm if you win all 3 hands',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 1,
        availableAtBuilder: false,
        subType: 'Bonus'
    },
    {
        id: 'blackjack_chips_bonus',
        type: 'Blackjack',
        label: 'Chips Bonus',
        description: 'Gain 1 chip if you win 5 hands',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: false,
        subType: 'Bonus'
    },
    {
        id: 'blackjack_points_bonus',
        type: 'Blackjack',
        label: 'Points Bonus',
        description: 'All winning hands get +5 score',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: true,
        subType: 'Bonus'
    },
    {
        id: 'blackjack_scaling_charm',
        type: 'Blackjack',
        label: 'Scaling Charm',
        description: 'Gain +1 charm currency each time you play against this opponent',
        casinoAvailability: [1, 2, 3, 4, 5], // Assuming avail for all if not specified, 0 cost in table
        builderChipCost: 0,
        availableAtBuilder: true,
        subType: 'Scaling'
    },
    {
        id: 'blackjack_scaling_chips',
        type: 'Blackjack',
        label: 'Scaling Chips',
        description: 'Gain +1 chip currency each time you play against this opponent',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: true,
        subType: 'Scaling'
    },
    {
        id: 'boss_standard',
        type: 'Boss',
        label: 'Boss',
        description: 'Randomly populate one of the bosses at the green boss location',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: false
    },
    {
        id: 'random_trader',
        type: 'Random',
        label: 'Trader',
        description: 'Allows the player to trade between the three resources',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: true,
        subType: 'Trader'
    },
    {
        id: 'shop_builder',
        type: 'Shop', // Table says type Shop, Name Builder
        label: 'Builder',
        description: 'Player can choose between 3 events to add to the player board',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 2,
        availableAtBuilder: false,
        subType: 'Builder' // Distinct from valid 'Shop'
    },
    {
        id: 'random_banker',
        type: 'Random',
        label: 'Banker',
        description: 'Gain +15% score and get a free move to the next node without consumer a movement point',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: false,
        subType: 'Banker'
    },
    {
        id: 'random_roulette',
        type: 'Random',
        label: 'Roulette',
        description: 'Gain 2 chips or charm currency if you correctly guess between a black and a red roulette spin',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: false,
        subType: 'Roulette'
    },
    {
        id: 'random_card_destroyer',
        type: 'Random',
        label: 'Card destroyer',
        description: 'You are given two options from this list. choose 1\nDestroy 3 jacks\nDestroy 3 queens\nDestroy 3 hearts\nDestroy 3 spades\nDestroy 3 clubs\nDestroy 3 diamonds',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 2,
        availableAtBuilder: true,
        subType: 'Destroyer'
    },
    {
        id: 'random_card_duplicator',
        type: 'Random',
        label: 'Card duplicator',
        description: 'duplicate 1 card. Move 1 space forward for free',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 2,
        availableAtBuilder: true,
        subType: 'Duplicator'
    },
    {
        id: 'random_charm_modifier',
        type: 'Random',
        label: 'Charm modifier',
        description: 'Add 2 charm spaces',
        casinoAvailability: [2, 4],
        builderChipCost: 3,
        availableAtBuilder: true,
        subType: 'Modifier'
    },
    {
        id: 'random_card_modifier',
        type: 'Random',
        label: 'Card modifier',
        description: 'You are given two options from this list. choose 1\nAdd 1 to the value of 2 cards\n2 Kings count as a 1\nCard provides 20 chips in scoring hand\nCard provides +1 mult for every same suited card in hand\nPair mult +2 \nhand still scores if busted',
        casinoAvailability: [1, 2, 3, 4, 5],
        builderChipCost: 0,
        availableAtBuilder: true,
        subType: 'Modifier'
    }
];

export const generateBoard = (round: number): Record<number, RouletteEvent> => {
    const board: Record<number, RouletteEvent> = {};
    const totalNodes = 19;
    const availableNodes = Array.from({ length: totalNodes }, (_, i) => i);

    // Helper to get random item from array
    const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // 1. Assign Boss to Node 0
    const bossEvent = EVENT_DEFINITIONS.find(e => e.id === 'boss_standard')!;
    board[0] = bossEvent;

    // 2. Assign Base Game to Node 1 (Safe start assumed)
    const baseGameEvent = EVENT_DEFINITIONS.find(e => e.id === 'blackjack_base')!;
    board[1] = baseGameEvent;

    // Remaining nodes to fill (excluding 0 and 1)
    let openNodes = availableNodes.filter(n => n !== 0 && n !== 1);

    // Helper to pick and remove random node
    const pickNode = (): number => {
        const idx = Math.floor(Math.random() * openNodes.length);
        const node = openNodes[idx];
        openNodes.splice(idx, 1);
        return node;
    };

    // Filter events by availability
    // User Requirement: "The starting board will always have 2 of the base game events, one shop, and one builder, and 2 random events"
    // Clarification in plan: "2 of the base game events" probably means 2 SPECIAL blackjack events, 
    // because "Base Game" is the default filler. Or it specifically means 2 Standard Base Games?
    // Given the phrasing "2 OF the base game events" vs "2 Random events", and we likely fill the rest with something...
    // I will stick to the plan: 1 Shop, 1 Builder, 2 Special Blackjack, 2 Randoms.
    // The rest will be filled / defaulted to Base Game (Standard).

    const availableEvents = EVENT_DEFINITIONS.filter(e => e.casinoAvailability.includes(round));

    // Place 1 Shop (Prefer Standard Shop initially, or random Shop type if multiple available?)
    // Table has 'Shop' and 'Advanced Shop'. Let's pick 'Shop' standard if available, or random shop type.
    const shopEvents = availableEvents.filter(e => e.type === 'Shop' && e.id !== 'shop_builder');
    if (shopEvents.length > 0) {
        board[pickNode()] = getRandom(shopEvents);
    }

    // Place 1 Builder
    const builderEvent = availableEvents.find(e => e.id === 'shop_builder');
    if (builderEvent) {
        board[pickNode()] = builderEvent;
    }

    // Place 2 Special Blackjacks (Bonus/Scaling) - excluding Standard Base
    const specialBlackjacks = availableEvents.filter(e => e.type === 'Blackjack' && !e.isBaseGame);
    for (let i = 0; i < 2; i++) {
        if (specialBlackjacks.length > 0 && openNodes.length > 0) {
            board[pickNode()] = getRandom(specialBlackjacks);
        }
    }

    // Place 2 Random Events
    const randomEvents = availableEvents.filter(e => e.type === 'Random');
    for (let i = 0; i < 2; i++) {
        if (randomEvents.length > 0 && openNodes.length > 0) {
            board[pickNode()] = getRandom(randomEvents);
        }
    }

    // Fill remaining spots with Standard Base Game
    while (openNodes.length > 0) {
        board[pickNode()] = baseGameEvent;
    }

    return board;
};
