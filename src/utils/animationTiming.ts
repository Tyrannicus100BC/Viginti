/** Shared pace for turn animations and the pauses between game events. */
export const BASE_ANIMATION_SPEED = 1.25;

/** Convert an original duration at 1× speed to the current presentation pace. */
export function animationDuration(duration: number, speed = 1): number {
    return duration / (BASE_ANIMATION_SPEED * speed);
}
