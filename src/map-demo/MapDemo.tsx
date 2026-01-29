import React from 'react';
import { RouletteBoard } from './RouletteBoard';

interface MapDemoProps {
    onClose: () => void;
}

export const MapDemo: React.FC<MapDemoProps> = ({ onClose }) => {
    return (
        <RouletteBoard onClose={onClose} />
    );
};
