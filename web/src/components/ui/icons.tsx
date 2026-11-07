// Hand-drawn style icons. Nav icon paths are copied from the prototype (design file).
import type { SVGProps } from "react";

type P = { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height" | "strokeWidth">;

function Svg({ size = 24, strokeWidth = 2.2, children, ...rest }: P & { strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: P) => (
  <Svg strokeWidth={2.3} {...p}>
    <path d="M3.5 11.8 C 6.5 9.2, 9.5 6.6, 12 4.4 C 14.6 6.6, 17.4 9.1, 20.5 11.6" />
    <path d="M6 10.6 C 5.8 14, 6 17, 6.3 19.8 C 10 20.1, 14 20.1, 17.8 19.8 C 18 17, 18.2 14, 18 10.6" />
    <path d="M10 19.8 C 10 17.5, 10.3 15.6, 12 15.4 C 13.8 15.6, 14 17.5, 14.1 19.8" />
  </Svg>
);

export const CrewsIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8.4 5 C 10.3 5, 11.4 6.4, 11.3 8.1 C 11.2 9.9, 9.9 11, 8.3 11 C 6.6 10.9, 5.4 9.7, 5.5 8 C 5.6 6.3, 6.8 5, 8.4 5 Z" />
    <path d="M16.6 6.8 C 18 6.8, 19 7.8, 18.9 9.2 C 18.8 10.6, 17.8 11.4, 16.5 11.4 C 15.2 11.3, 14.3 10.3, 14.4 9 C 14.5 7.7, 15.4 6.8, 16.6 6.8 Z" />
    <path d="M2.6 19.8 C 3 16.2, 5.4 13.6, 8.5 13.6 C 11.6 13.7, 13.8 16.2, 14.3 19.6" />
    <path d="M14.4 14.4 C 17.4 13.6, 20.6 15.6, 21.4 19.4" />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg strokeWidth={2.8} {...p}>
    <path d="M12.2 4.2 C 11.7 9, 12.5 15, 11.9 19.8" />
    <path d="M4.3 12.3 C 9 11.6, 15 12.7, 19.8 11.8" />
  </Svg>
);

export const WalletIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.2 C 9 7.6, 15 7.7, 19.6 8.3 C 20.2 11.2, 20.2 15.2, 19.7 19 C 14.5 19.6, 9 19.6, 4.3 19.1 C 3.8 15.2, 3.7 11.4, 4 8.2 Z" />
    <path d="M5 7.9 C 8.8 6.1, 12.4 4.9, 15.6 4.4 L 16.1 7.7" />
    <path d="M15.4 13.7 C 16 13.6, 16.6 13.7, 17 13.8" />
  </Svg>
);

export const ProfileIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.8 C 16.8 3.7, 20.2 7.3, 20.2 12 C 20.1 16.8, 16.6 20.2, 12 20.2 C 7.3 20.3, 3.9 16.8, 3.8 12.1 C 3.8 7.4, 7.2 3.9, 12 3.8 Z" />
    <path d="M9 9.8 L 9.1 10.8" />
    <path d="M15 9.8 L 14.9 10.8" />
    <path d="M8.3 14.3 C 10.4 16.6, 13.6 16.7, 15.8 14.2" />
  </Svg>
);

export const ChevronRightIcon = (p: P) => (
  <Svg strokeWidth={3} {...p}>
    <path d="M9.5 6 L 15.5 12 L 9.5 18" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg strokeWidth={3.5} {...p}>
    <path d="M5 12.5 L 10 17.5 L 19 7" />
  </Svg>
);

export const XIcon = (p: P) => (
  <Svg strokeWidth={3.5} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 8.5 C 12 8.3, 16 8.4, 19.5 8.6 C 19.7 12, 19.7 16, 19.5 19.5 C 16 19.7, 12 19.7, 8.6 19.5 C 8.4 16, 8.3 12, 8.5 8.5 Z" />
    <path d="M15.5 5.5 C 15.4 4.9, 15.3 4.6, 15 4.5 C 11.5 4.3, 8 4.3, 4.6 4.6 C 4.3 8, 4.3 11.5, 4.5 15 C 4.7 15.3, 5 15.4, 5.5 15.5" />
  </Svg>
);

export const ShareIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 15 C 11.9 11, 12.1 7.5, 12 3.8" />
    <path d="M7.8 7.8 L 12 3.8 L 16.2 7.8" />
    <path d="M5.5 12 C 5.3 14.8, 5.4 17.4, 5.6 19.8 C 9.8 20.1, 14.2 20.1, 18.4 19.8 C 18.6 17.4, 18.7 14.8, 18.5 12" />
  </Svg>
);

export const CameraIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.8 8 C 3.6 11.5, 3.7 15, 4 18.6 C 9.3 19, 14.7 19, 20 18.6 C 20.3 15, 20.4 11.5, 20.2 8 L 16.5 7.8 L 15 5.3 L 9 5.3 L 7.5 7.8 Z" />
    <path d="M12 9.8 C 14 9.8, 15.4 11.2, 15.3 13 C 15.2 14.9, 13.8 16.1, 12 16.1 C 10.1 16, 8.8 14.8, 8.8 13 C 8.8 11.1, 10.1 9.8, 12 9.8 Z" />
  </Svg>
);

export const MoreIcon = (p: P) => (
  <Svg strokeWidth={3.2} {...p}>
    <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />
  </Svg>
);

export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 21 C 5 15, 5 9, 5.2 3.5" />
    <path d="M5.2 4.2 C 8.5 2.8, 11 5.6, 14 4.4 C 16 3.6, 17.5 3.8, 19 4.4 C 18.8 7.4, 18.8 10, 19 12.6 C 16 11.6, 13.6 13.8, 10.6 12.8 C 8.6 12.1, 7 12.2, 5.2 13" />
  </Svg>
);
