import { Composition } from 'remotion';
import { CatIdle } from './CatIdle';

export const Root = () => (
  <>
    <Composition
      id="CatPlayDead"
      component={CatIdle}
      width={720}
      height={720}
      fps={30}
      durationInFrames={180}
      defaultProps={{ transparent: false, pose: 'play-dead' as const }}
    />
    <Composition
      id="CatPlayDeadTransparent"
      component={CatIdle}
      width={720}
      height={720}
      fps={30}
      durationInFrames={180}
      defaultProps={{ transparent: true, pose: 'play-dead' as const }}
    />
    <Composition
      id="CatIdle"
      component={CatIdle}
      width={720}
      height={720}
      fps={30}
      durationInFrames={150}
      defaultProps={{ transparent: false }}
    />
    <Composition
      id="CatIdleTransparent"
      component={CatIdle}
      width={720}
      height={720}
      fps={30}
      durationInFrames={150}
      defaultProps={{ transparent: true }}
    />
  </>
);
