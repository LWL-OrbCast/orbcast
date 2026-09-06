import { useState } from 'react';
import { crestContentFit } from '../../../frontend/src/lib/footballCrest';
import { localFootballCrestKey } from '../../../frontend/src/lib/footballTeamLogos';
import marseille from '../../../frontend/assets/images/symbols/marseille-icon.webp';
import slovan from '../../../frontend/assets/images/symbols/slovan-logo.webp';
import lask from '../../../frontend/assets/images/symbols/lask-icon.webp';
import viking from '../../../frontend/assets/images/symbols/viking-icon.webp';

const LOCAL_CREST: Record<string, string> = {
  marseille,
  slovan,
  lask,
  viking,
};

type Props = {
  src: string;
  className?: string;
};

function crestSrc(src: string): string {
  const key = localFootballCrestKey(src);
  if (key && LOCAL_CREST[key]) return LOCAL_CREST[key];
  return src;
}

export function TeamCrest({ src, className = 'h-11 w-11 sm:h-14 sm:w-14' }: Props) {
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const resolved = crestSrc(src);
  return (
    <span className={`inline-flex overflow-hidden ${className}`}>
      <img
        src={resolved}
        alt=""
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        onLoad={(e) => {
          const img = e.currentTarget;
          setFit(crestContentFit(img.naturalWidth, img.naturalHeight));
        }}
      />
    </span>
  );
}
