import React from 'react';

export const PlayerIcon: React.FC<{ size?: number }> = ({ size = 40 }) => {
    return (
        <div style={{
            width: size, height: size,
            background: '#f1c40f',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 10px rgba(241, 196, 15, 0.5)'
        }}>
            <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 11 3.8 11 8c0 2.85-2.92 5.5-3 5.5l2 1.34c.65.43.91 1.25.6 1.95l-.17.38C10.08 18.06 9.17 19 8.23 19H4z" />
                <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 13 7.8 13 12c0 2.85 2.92 5.5 3 5.5l-2 1.34c-.65.43-.91 1.25-.6 1.95l.17.38c.35.79 1.26 1.73 2.2 1.73H20z" />
            </svg>
        </div>
    );
};
