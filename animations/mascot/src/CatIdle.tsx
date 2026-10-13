import { useEffect, useId, useState } from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type CatIdleProps = { transparent: boolean; pose?: 'idle' | 'play-dead' };

const tailRegion = 'M 823 811 H 1254 V 1254 H 770 V 1135 L 823 1110 Z';

/** Everything depends on the frame so seeking and offline rendering agree. */
export const CatIdle = ({ transparent, pose = 'idle' }: CatIdleProps) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const prefix = useId().replace(/:/g, '');
  const id = (part: string) => `${prefix}-${part}`;
  const phase = (frame / durationInFrames) * Math.PI * 2;
  const breathing = (1 - Math.cos(phase * 2)) / 2;
  const playDead = pose === 'play-dead';
  const tailAngle = playDead
    ? frame < 49
      ? Math.sin(frame / 10) * 3
      : Math.sin((frame - 49) / 5) * 7 * Math.exp(-(frame - 49) / 22)
    : Math.sin(phase) * 4;
  const lean = Math.sin(phase) * 0.6;
  const blink = playDead
    ? interpolate(frame, [40, 47], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : Math.max(
        interpolate(frame, [35, 38, 40, 44], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        interpolate(frame, [107, 110, 112, 116], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      );
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  const angle = interpolate(frame, [0, 18, 27, 49, 55, 63, 72], [0, 0, 8, -92, -97, -88, -90], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const fall = interpolate(frame, [27, 52], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const impact = interpolate(frame, [47, 53, 61, 72], [0, 1, -0.3, 0], clamp);
  const resting = interpolate(frame, [72, 90], [0, 1], clamp);
  const breath = Math.sin(((frame - 90) / 90) * Math.PI * 2) * resting;
  const scale = 1 - fall * 0.1;
  const transform = playDead
    ? `translate(0 ${fall * 90 + impact * 8 + breath * 2}) translate(627 627) scale(${scale - impact * 0.025} ${scale + impact * 0.025 + breath * 0.002}) rotate(${angle}) translate(-627 -627)`
    : `translate(0 ${-breathing * 6}) rotate(${lean} 625 1190) translate(625 1190) scale(${1 + breathing * 0.006} ${1 + breathing * 0.009}) translate(-625 -1190)`;
  const image = staticFile('waypoint-cat.png');
  const [imageHandle] = useState(() => delayRender('Loading the mascot'));
  useEffect(() => {
    const preload = new Image();
    preload.onload = () => {
      // Let Chromium paint all SVG image instances before taking the first frame.
      requestAnimationFrame(() => requestAnimationFrame(() => continueRender(imageHandle)));
    };
    preload.onerror = () => cancelRender(new Error('Could not load the mascot image'));
    preload.src = image;
    return () => {
      preload.onload = null;
      preload.onerror = null;
    };
  }, [image, imageHandle]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: transparent ? undefined : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width="600"
        height="600"
        viewBox={playDead ? '-140 -140 1534 1534' : '0 0 1254 1254'}
        aria-label={
          playDead
            ? 'Waypoint cat flops onto its side and rests with closed eyes'
            : 'Waypoint cat blinking, breathing, and swaying its tail'
        }
      >
        <defs>
          <filter id={id('eye-edge')}>
            <feMorphology operator="dilate" radius="3" />
          </filter>
          <clipPath id={id('tail')}>
            <path d={tailRegion} />
          </clipPath>
          <mask id={id('body')} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
            <rect width="1254" height="1254" fill="white" />
            <path d={tailRegion} fill="black" stroke="white" strokeWidth="4" />
          </mask>
          {/* Source luminance isolates the exact white eye shapes. */}
          <mask id={id('eyes')} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
            <image href={image} width="1254" height="1254" filter={`url(#${id('eye-edge')})`} />
            <rect x="506" y="607" width="46" height="26" fill="black" />
          </mask>
        </defs>
        <g transform={transform}>
          <g transform={`rotate(${tailAngle} 784 1158)`}>
            <image href={image} width="1254" height="1254" clipPath={`url(#${id('tail')})`} />
          </g>
          <image href={image} width="1254" height="1254" mask={`url(#${id('body')})`} />
          <g fill="black" mask={`url(#${id('eyes')})`}>
            <rect x="310" y="382" width="225" height={blink * 250} />
            <rect x="585" y="458" width="220" height={blink * 242} />
          </g>
          {playDead && (
            <g opacity={blink} fill="none" stroke="white" strokeWidth="16" strokeLinecap="round">
              <path d="M 355 514 Q 420 558 485 514" />
              <path d="M 628 592 Q 694 636 760 592" />
            </g>
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
