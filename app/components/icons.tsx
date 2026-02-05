import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseClass = "h-5 w-5";

function cx(value?: string) {
  return value ? `${baseClass} ${value}` : baseClass;
}

export function IconLock(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M12 15v2" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M12 3l7 3v6c0 4.2-3 7.9-7 9-4-1.1-7-4.8-7-9V6l7-3z" />
      <path d="M9.5 12.5l1.8 1.8 3.7-3.7" />
    </svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a12 12 0 0 1 0 18a12 12 0 0 1 0-18z" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconServer(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M7 3h6l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M13 3v4h4" />
    </svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M12 15h4" />
    </svg>
  );
}

export function IconHeart(props: IconProps) {
  const pixels = [
    "011000110",
    "111101111",
    "111111111",
    "111111111",
    "011111110",
    "001111100",
    "000111000",
    "000010000",
    "000000000",
  ];
  const pixelSize = 2;
  const offset = 3;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      shapeRendering="crispEdges"
      className={cx(props.className)}
      {...props}
    >
      {pixels.map((row, y) =>
        row.split("").map((cell, x) =>
          cell === "1" ? (
            <rect
              key={`${x}-${y}`}
              x={offset + x * pixelSize}
              y={offset + y * pixelSize}
              width={pixelSize}
              height={pixelSize}
            />
          ) : null
        )
      )}
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconPower(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(props.className)}
      {...props}
    >
      <path d="M12 2v7" />
      <path d="M6.2 5.2a8 8 0 1 0 11.6 0" />
    </svg>
  );
}
