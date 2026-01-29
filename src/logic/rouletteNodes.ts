
export interface RouletteNodeValue {
    id: string;
    label: string;
    type: 'boss' | 'number';
    numericValue: number;
    description?: string;
}

// Configuration mapping Node Index (0-18) -> Node Content
export const ROULETTE_NODE_CONFIG: Record<number, RouletteNodeValue> = {
    0: { id: 'boss', label: 'BOSS', type: 'boss', numericValue: 0, description: "Final challenge. Defeat the boss to clear the level." },
    1: { id: 'val_1', label: '1', type: 'number', numericValue: 1, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    2: { id: 'val_2', label: '2', type: 'number', numericValue: 2, description: "Mystery Event: Something unexpected might happen here." },
    3: { id: 'val_3', label: '3', type: 'number', numericValue: 3, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    4: { id: 'val_4', label: '4', type: 'number', numericValue: 4, description: "Mystery Event: Something unexpected might happen here." },
    5: { id: 'val_5', label: '5', type: 'number', numericValue: 5, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    6: { id: 'val_6', label: '6', type: 'number', numericValue: 6, description: "Mystery Event: Something unexpected might happen here." },
    7: { id: 'val_7', label: '7', type: 'number', numericValue: 7, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    8: { id: 'val_8', label: '8', type: 'number', numericValue: 8, description: "Mystery Event: Something unexpected might happen here." },
    9: { id: 'val_9', label: '9', type: 'number', numericValue: 9, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    10: { id: 'val_10', label: '10', type: 'number', numericValue: 10, description: "Mystery Event: Something unexpected might happen here." },
    11: { id: 'val_11', label: '11', type: 'number', numericValue: 11, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    12: { id: 'val_12', label: '12', type: 'number', numericValue: 12, description: "Mystery Event: Something unexpected might happen here." },
    13: { id: 'val_13', label: '13', type: 'number', numericValue: 13, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    14: { id: 'val_14', label: '14', type: 'number', numericValue: 14, description: "Mystery Event: Something unexpected might happen here." },
    15: { id: 'val_15', label: '15', type: 'number', numericValue: 15, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    16: { id: 'val_16', label: '16', type: 'number', numericValue: 16, description: "Mystery Event: Something unexpected might happen here." },
    17: { id: 'val_17', label: '17', type: 'number', numericValue: 17, description: "Combat Encounter: Fight a group of enemies to earn loot." },
    18: { id: 'val_18', label: '18', type: 'number', numericValue: 18, description: "Mystery Event: Something unexpected might happen here." },
};

export const TOTAL_NODES = 19;

export const getNodeValue = (index: number): RouletteNodeValue => {
    return ROULETTE_NODE_CONFIG[index] || { id: 'unknown', label: '?', type: 'number', numericValue: -1 };
};
