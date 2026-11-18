import { Composition } from 'remotion';
import { DemoVideo } from './Video';
import { FPS, sceneTiming } from './timing';

export const MyComposition = () => (
  <Composition id="Demo" component={DemoVideo} durationInFrames={sceneTiming.total} fps={FPS} width={1920} height={1080} />
);
