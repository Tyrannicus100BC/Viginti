import React from 'react';
import styles from './AudioControls.module.css';

type AudioControlsProps = {
    musicVolume: number;
    sfxVolume: number;
    musicMuted: boolean;
    sfxMuted: boolean;
    onMusicVolumeChange: (value: number) => void;
    onSfxVolumeChange: (value: number) => void;
    onToggleMusicMute: () => void;
    onToggleSfxMute: () => void;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));

export const AudioControls: React.FC<AudioControlsProps> = ({
    musicVolume,
    sfxVolume,
    musicMuted,
    sfxMuted,
    onMusicVolumeChange,
    onSfxVolumeChange,
    onToggleMusicMute,
    onToggleSfxMute
}) => {
    const musicPercent = clampPercent(musicVolume);
    const sfxPercent = clampPercent(sfxVolume);
    const isMusicMuted = musicMuted || musicPercent === 0;
    const isSfxMuted = sfxMuted || sfxPercent === 0;

    return (
        <div className={styles.audioControls}>
            <div className={styles.audioControl}>
                <button
                    className={`${styles.iconButton} ${styles.musicButton} ${isMusicMuted ? styles.isMuted : ''}`}
                    type="button"
                    onClick={onToggleMusicMute}
                    aria-label="Toggle music mute"
                    title={isMusicMuted ? 'Unmute music' : 'Mute music'}
                >
                    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 3v11.2a2.6 2.6 0 1 0 1.2 2.2V7.2l7.3-1.7v7.4a2.6 2.6 0 1 0 1.2 2.2V3.1L9 3z" />
                        <circle cx="7" cy="16.6" r="1.7" />
                        <circle cx="15.5" cy="14.8" r="1.7" />
                    </svg>
                    <span className={styles.muteSlash} aria-hidden="true" />
                </button>
                <div className={styles.expander}>
                    <div className={styles.label}>Music</div>
                    <input
                        className={styles.slider}
                        type="range"
                        min={0}
                        max={100}
                        value={musicPercent}
                        onChange={(event) => onMusicVolumeChange(Number(event.target.value) / 100)}
                        aria-label="Music volume"
                    />
                </div>
            </div>

            <div className={styles.audioControl}>
                <button
                    className={`${styles.iconButton} ${isSfxMuted ? styles.isMuted : ''}`}
                    type="button"
                    onClick={onToggleSfxMute}
                    aria-label="Toggle sfx mute"
                    title={isSfxMuted ? 'Unmute sfx' : 'Mute sfx'}
                >
                    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 9h4l6-4v14l-6-4H7z" />
                    </svg>
                    <span className={styles.muteSlash} aria-hidden="true" />
                </button>
                <div className={styles.expander}>
                    <div className={styles.label}>SFX</div>
                    <input
                        className={styles.slider}
                        type="range"
                        min={0}
                        max={100}
                        value={sfxPercent}
                        onChange={(event) => onSfxVolumeChange(Number(event.target.value) / 100)}
                        aria-label="SFX volume"
                    />
                </div>
            </div>
        </div>
    );
};
