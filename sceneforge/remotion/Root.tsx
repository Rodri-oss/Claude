import React from 'react';
import { Composition } from 'remotion';
import { SceneForgeVideo } from './SceneForgeVideo';
import type { CompositionProps, Timeline } from '../lib/types';

const EMPTY: Timeline = {
  schema: 1,
  projectId: 'empty',
  fps: 24,
  width: 1920,
  height: 1080,
  durationInFrames: 24,
  clips: [],
  audio: [],
  subtitles: [],
  scenes: [],
  tracks: {
    dialogue: { volume: 1, muted: false },
    music: { volume: 0.5, muted: false, duckUnderDialogue: true, duckAmountDb: 10 },
    sfx: { volume: 0.8, muted: false },
    ambience: { volume: 0.5, muted: false },
    burnInSubtitles: true,
  },
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="SceneForge"
    component={SceneForgeVideo}
    defaultProps={{ timeline: EMPTY, mediaBase: '' } as CompositionProps}
    durationInFrames={24}
    fps={24}
    width={1920}
    height={1080}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.timeline.durationInFrames,
      fps: props.timeline.fps,
      width: props.timeline.width,
      height: props.timeline.height,
    })}
  />
);
