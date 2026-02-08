type SfxId =
    | 'viginti'
    | 'click'
    | 'cardDeal'
    | 'cardFlip'
    | 'cardPlace'
    | 'bust'
    | 'stand'
    | 'totalWinnings'
    | 'score';

const CARD_FLIP_GAIN = 2;
const CARD_DEAL_GAIN = 1;

const SFX_SOURCES = {
    viginti: '/sounds/Viginti.mp3',
    click: '/sounds/Click.mp3',
    bust: '/sounds/Bust.mp3',
    stand: '/sounds/Stand.mp3',
    totalWinnings: '/sounds/TotalWinnings.mp3',
    score: '/sounds/Score.mp3',
    cardPlace: [
        '/sounds/CardPlace-01.wav',
        '/sounds/CardPlace-02.wav',
        '/sounds/CardPlace-03.wav',
        '/sounds/CardPlace-04.wav',
        '/sounds/CardPlace-05.wav',
        '/sounds/CardPlace-06.wav',
        '/sounds/CardPlace-07.wav',
        '/sounds/CardPlace-08.wav',
        '/sounds/CardPlace-09.wav',
        '/sounds/CardPlace-10.wav'
    ],
    cardDeal: [
        '/sounds/CardDeal-01.wav',
        '/sounds/CardDeal-02.wav',
        '/sounds/CardDeal-03.wav',
        '/sounds/CardDeal-04.wav',
        '/sounds/CardDeal-05.wav',
        '/sounds/CardDeal-06.wav',
        '/sounds/CardDeal-07.wav',
        '/sounds/CardDeal-08.wav',
        '/sounds/CardDeal-09.wav',
        '/sounds/CardDeal-10.wav'
    ],
    cardFlip: [
        '/sounds/CardFlip-01.wav',
        '/sounds/CardFlip-02.wav',
        '/sounds/CardFlip-03.wav',
        '/sounds/CardFlip-04.wav',
        '/sounds/CardFlip-05.wav',
        '/sounds/CardFlip-06.wav',
        '/sounds/CardFlip-07.wav',
        '/sounds/CardFlip-08.wav',
        '/sounds/CardFlip-09.wav',
        '/sounds/CardFlip-10.wav',
        '/sounds/CardFlip-11.wav',
        '/sounds/CardFlip-12.wav',
        '/sounds/CardFlip-13.wav',
        '/sounds/CardFlip-14.wav',
        '/sounds/CardFlip-15.wav',
        '/sounds/CardFlip-16.wav',
        '/sounds/CardFlip-17.wav',
        '/sounds/CardFlip-18.wav',
        '/sounds/CardFlip-19.wav',
        '/sounds/CardFlip-20.wav'
    ]
};

type WebkitWindow = Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
};

const getAudioContextCtor = (): typeof AudioContext | null => {
    if (typeof window === 'undefined') return null;
    return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
};

class SfxEngine {
    private context: AudioContext | null = null;
    private sfxGain: GainNode | null = null;
    private buffers = new Map<string, AudioBuffer>();
    private pending = new Map<string, Promise<AudioBuffer>>();
    private sfxVolume = 1;
    private sfxMuted = false;
    private maxVoices = 32;
    private activeSources: AudioBufferSourceNode[] = [];

    private ensureContext(): AudioContext | null {
        if (this.context) return this.context;
        const ctor = getAudioContextCtor();
        if (!ctor) return null;
        this.context = new ctor();
        this.sfxGain = this.context.createGain();
        this.sfxGain.connect(this.context.destination);
        this.applyVolume();
        return this.context;
    }

    private applyVolume() {
        if (!this.sfxGain) return;
        this.sfxGain.gain.value = this.sfxMuted ? 0 : this.sfxVolume;
    }

    setSfxVolume(value: number) {
        this.sfxVolume = Math.max(0, Math.min(1, value));
        this.applyVolume();
    }

    setSfxMuted(muted: boolean) {
        this.sfxMuted = muted;
        this.applyVolume();
    }

    async resume() {
        const ctx = this.ensureContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch {
                return;
            }
        }
    }

    async preloadAll() {
        const sources = new Set<string>([
            SFX_SOURCES.viginti,
            SFX_SOURCES.click,
            SFX_SOURCES.bust,
            SFX_SOURCES.stand,
            SFX_SOURCES.totalWinnings,
            SFX_SOURCES.score,
            ...SFX_SOURCES.cardPlace,
            ...SFX_SOURCES.cardDeal,
            ...SFX_SOURCES.cardFlip
        ]);
        await Promise.all(
            Array.from(sources).map(src => this.loadBuffer(src).catch(() => undefined))
        );
    }

    private async loadBuffer(src: string): Promise<AudioBuffer> {
        const existing = this.buffers.get(src);
        if (existing) return existing;
        const pending = this.pending.get(src);
        if (pending) return pending;
        const ctx = this.ensureContext();
        if (!ctx) {
            return Promise.reject(new Error('AudioContext not available'));
        }
        const promise = fetch(src)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load audio: ${src}`);
                }
                return response.arrayBuffer();
            })
            .then(buffer => ctx.decodeAudioData(buffer))
            .then(decoded => {
                this.buffers.set(src, decoded);
                this.pending.delete(src);
                return decoded;
            })
            .catch(err => {
                this.pending.delete(src);
                throw err;
            });
        this.pending.set(src, promise);
        return promise;
    }

    private playBySrc(src: string, volume = 1, playbackRate = 1) {
        if (this.sfxMuted || this.sfxVolume <= 0) return;
        const ctx = this.ensureContext();
        if (!ctx || !this.sfxGain) return;
        if (ctx.state === 'suspended') {
            ctx.resume()
                .then(() => {
                    if (ctx.state === 'running') {
                        this.playBySrc(src, volume);
                    }
                })
                .catch(() => {});
            return;
        }
        const buffer = this.buffers.get(src);
        if (!buffer) {
            void this.loadBuffer(src);
            return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = Math.max(0.5, Math.min(2, playbackRate));
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(0);
        this.activeSources.push(source);
        source.addEventListener('ended', () => {
            this.activeSources = this.activeSources.filter(node => node !== source);
        });
        if (this.activeSources.length > this.maxVoices) {
            const oldest = this.activeSources.shift();
            if (oldest) {
                try {
                    oldest.stop();
                } catch {
                    return;
                }
            }
        }
    }

    play(id: SfxId, options?: { volume?: number; playbackRate?: number }) {
        const volume = options?.volume ?? 1;
        const playbackRate = options?.playbackRate ?? 1;
        switch (id) {
            case 'viginti':
                this.playBySrc(SFX_SOURCES.viginti, volume, playbackRate);
                break;
            case 'click':
                this.playBySrc(SFX_SOURCES.click, volume, playbackRate);
                break;
            case 'bust':
                this.playBySrc(SFX_SOURCES.bust, volume, playbackRate);
                break;
            case 'stand':
                this.playBySrc(SFX_SOURCES.stand, volume, playbackRate);
                break;
            case 'totalWinnings':
                this.playBySrc(SFX_SOURCES.totalWinnings, volume, playbackRate);
                break;
            case 'score':
                this.playBySrc(SFX_SOURCES.score, volume, playbackRate);
                break;
            case 'cardDeal': {
                const options = SFX_SOURCES.cardDeal;
                const randomIndex = Math.floor(Math.random() * options.length);
                this.playBySrc(options[randomIndex], CARD_DEAL_GAIN);
                break;
            }
            case 'cardFlip': {
                const options = SFX_SOURCES.cardFlip;
                const randomIndex = Math.floor(Math.random() * options.length);
                this.playBySrc(options[randomIndex], CARD_FLIP_GAIN);
                break;
            }
            case 'cardPlace': {
                const options = SFX_SOURCES.cardPlace;
                const randomIndex = Math.floor(Math.random() * options.length);
                this.playBySrc(options[randomIndex], volume, playbackRate);
                break;
            }
            default:
                break;
        }
    }
}

export const sfxEngine = new SfxEngine();
export type { SfxId };
