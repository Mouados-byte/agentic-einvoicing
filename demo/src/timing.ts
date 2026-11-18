import durations from './voiceover-durations.json';

export const FPS = 30;
const PAD = 1.0; // seconds of silence after each voiceover clip
export const SCENES = ['intro', 'setup', 'question', 'invoice', 'evals', 'outro'] as const;
export type SceneId = (typeof SCENES)[number];

// Frame where each scene starts and how long it lasts, driven by its voiceover clip.
export const sceneTiming = SCENES.reduce(
  (acc, id) => {
    const durationInFrames = Math.ceil((durations[id] + PAD) * FPS);
    acc.list[id] = { from: acc.total, durationInFrames };
    acc.total += durationInFrames;
    return acc;
  },
  { list: {} as Record<SceneId, { from: number; durationInFrames: number }>, total: 0 },
);
export const VOICE_DELAY = Math.round(0.3 * FPS);
