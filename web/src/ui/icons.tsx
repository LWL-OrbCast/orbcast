import type { SVGProps } from 'react';
import type { SportChipId } from '@hip4/catalog';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="8" y="8" width="10" height="12" rx="1.6" />
      <path d="M6 16H5.4A1.4 1.4 0 0 1 4 14.6V5.4A1.4 1.4 0 0 1 5.4 4h9.2A1.4 1.4 0 0 1 16 5.4V6" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12.5 9.2 17 19 7" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </Svg>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 5h3.5A1.5 1.5 0 0 1 19 6.5v11A1.5 1.5 0 0 1 17.5 19H14" />
      <path d="M10 16.5 5.5 12 10 7.5" />
      <path d="M6 12h9" />
    </Svg>
  );
}

export function IconTwitter(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l7.2 9.6L4.4 20h2.6l5.2-5.9L16.8 20H20l-7.4-9.9L19.4 4h-2.6l-4.8 5.5L7.2 4H4Z" />
    </Svg>
  );
}

export function IconCash(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 10.2v3.6M18 10.2v3.6" />
    </Svg>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2.2" />
      <path d="M3 10h18" />
      <circle cx="16.2" cy="14.2" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPositions(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19V6" />
      <path d="M4 19h16" />
      <path d="M8 15l3.4-3.6 2.4 2.2L19 8" />
    </Svg>
  );
}

export function IconGift(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="11" width="16" height="9" rx="1.6" />
      <path d="M12 7v13M4 11h16" />
      <path d="M12 7c0-2.2-1.4-3.6-3.1-3.6S7.2 5.6 8.8 7H12c1.6-1.4 2.6-3.6 2.6-3.6S12.8 4.8 12 7Z" />
    </Svg>
  );
}

export function IconShare(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.2 13.3 15.7 17.2M15.7 6.8 8.2 10.7" />
    </Svg>
  );
}

export function IconPeople(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.6 18.5c.6-2.6 2.7-4 5.4-4s4.8 1.4 5.4 4" />
      <circle cx="16.4" cy="8.4" r="2.4" />
      <path d="M15.2 14.2c2 .3 3.6 1.5 4.2 3.6" />
    </Svg>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="9" rx="1.8" />
      <path d="M8 11V8.2a4 4 0 0 1 8 0V11" />
    </Svg>
  );
}

export function IconFlag(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 4v16" />
      <path d="M6 5h10.5l-1.6 3.2 1.6 3.2H6" />
    </Svg>
  );
}

export function IconTrophy(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z" />
      <path d="M16 5.6h2.1A2.2 2.2 0 0 1 20.3 8c0 2-1.6 3.5-3.8 3.9" />
      <path d="M8 5.6H5.9A2.2 2.2 0 0 0 3.7 8c0 2 1.6 3.5 3.8 3.9" />
      <path d="M12 13.2V16" />
      <path d="M9.2 20h5.6" />
      <path d="M10.2 16h3.6v4h-3.6z" />
    </Svg>
  );
}

export function IconPercent(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="7.4" cy="7.4" r="2.1" />
      <circle cx="16.6" cy="16.6" r="2.1" />
      <path d="M16.8 7.2 7.2 16.8" />
    </Svg>
  );
}

export function IconFlame(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3c2 3.2.6 5 0 6.2C10.4 7.4 9 5.8 9 4.2 6.8 6 5 9 5 12.2A7 7 0 0 0 12 21a7 7 0 0 0 7-8.8C19 8.4 15.5 5.8 12 3Z" />
    </Svg>
  );
}

export function IconChevron(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function IconSliders(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="2.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconGrid(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
    </Svg>
  );
}

export function IconFootball(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4.2 14.2 8l3.8.3-2.9 2.9.9 3.8L12 13.2 8 15l.9-3.8L6 8.3 9.8 8 12 4.2Z" />
    </Svg>
  );
}

export function IconBasketball(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16M4 12h16M7.2 6.4c2.4 2 2.8 5.2 2.8 5.6s-.4 3.6-2.8 5.6M16.8 6.4c-2.4 2-2.8 5.2-2.8 5.6s.4 3.6 2.8 5.6" />
    </Svg>
  );
}

export function IconTennis(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M7 5.4c3.2 2.2 5 5.4 5 10.6M17 18.6c-3.2-2.2-5-5.4-5-10.6" />
    </Svg>
  );
}

export function IconBaseball(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.2 7.2c2.4 1.4 3.6 3.4 4 4.8M6.2 16.8c2.4-1.4 3.6-3.4 4-4.8M17.8 7.2c-2.4 1.4-3.6 3.4-4 4.8M17.8 16.8c-2.4-1.4-3.6-3.4-4-4.8" />
    </Svg>
  );
}

export function IconMma(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 10.5V8.2A2.2 2.2 0 0 1 9.2 6h.8A2.2 2.2 0 0 1 12.2 8.2V10" />
      <path d="M8 10h8.5a2 2 0 0 1 2 2v2.2a3.3 3.3 0 0 1-3.3 3.3H11L8 20v-7.5A2.5 2.5 0 0 1 10.5 10" />
    </Svg>
  );
}

export function IconEsports(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 9.5h9a3.5 3.5 0 0 1 3.4 4.3l-.5 2A2.5 2.5 0 0 1 17 17.5H7a2.5 2.5 0 0 1-2.4-1.7l-.5-2A3.5 3.5 0 0 1 7.5 9.5Z" />
      <path d="M9 13h.01M15 12.2v1.6M14.2 13h1.6" />
    </Svg>
  );
}

export function IconCrypto(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M10 7.5h3.2a2.4 2.4 0 0 1 0 4.8H10V7.5Zm0 4.8h3.6a2.4 2.4 0 0 1 0 4.8H10v-4.8ZM9.2 7.5V6.2M9.2 17.8v-1.3M14.2 6.2v1.3M14.2 16.5v1.3" />
    </Svg>
  );
}

export function IconEconomics(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 18V10.5M10 18V7M15 18v-5.5M20 18V5.5" />
      <path d="M4 18.5h16" />
    </Svg>
  );
}

export function IconStocks(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 19V9.2A1.7 1.7 0 0 1 9.2 7.5h5.6A1.7 1.7 0 0 1 16.5 9.2V19" />
      <path d="M5.5 19h13" />
      <path d="M9.5 7.5V6.2A1.2 1.2 0 0 1 10.7 5h2.6A1.2 1.2 0 0 1 14.5 6.2V7.5" />
      <path d="M10 11.5h4M10 14.5h4" />
    </Svg>
  );
}

export function SportIcon({ id, size = 16 }: { id: SportChipId; size?: number }) {
  switch (id) {
    case 'crypto':
      return <IconCrypto size={size} />;
    case 'stocks':
      return <IconStocks size={size} />;
    case 'economics':
      return <IconEconomics size={size} />;
    case 'football':
      return <IconFootball size={size} />;
    case 'nba':
      return <IconBasketball size={size} />;
    case 'tennis':
      return <IconTennis size={size} />;
    case 'mlb':
      return <IconBaseball size={size} />;
    case 'mma':
      return <IconMma size={size} />;
    case 'esports':
      return <IconEsports size={size} />;
    default:
      return <IconGrid size={size} />;
  }
}
