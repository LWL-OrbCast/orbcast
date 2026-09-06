import { useState } from 'react';
import { crestContentFit } from '../../../frontend/src/lib/footballCrest';

type Props = {
  src: string;
  className?: string;
};

export function TeamCrest({ src, className = 'h-11 w-11 sm:h-14 sm:w-14' }: Props) {
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  return (
    <span className={`inline-flex overflow-hidden ${className}`}>
      <img
        src={src}
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
