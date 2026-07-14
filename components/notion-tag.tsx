export type NotionColor =
  | "green"
  | "blue"
  | "orange"
  | "purple"
  | "yellow"
  | "pink"
  | "gray";

export const NOTION_COLORS: Record<NotionColor, { bg: string; fg: string }> = {
  green: { bg: "#d6f0e0", fg: "#1c7a4d" },
  blue: { bg: "#d8e7fb", fg: "#2a68b8" },
  orange: { bg: "#fde3cd", fg: "#bd5c1c" },
  purple: { bg: "#e9dcfb", fg: "#6b46c1" },
  yellow: { bg: "#fbedbf", fg: "#96690a" },
  pink: { bg: "#fbd8e7", fg: "#b83071" },
  gray: { bg: "#ececee", fg: "#515154" },
};

export function NotionTag({
  color,
  children,
  large = false,
  className = "",
  style,
}: {
  color: NotionColor;
  children: React.ReactNode;
  large?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = NOTION_COLORS[color];
  return (
    <span
      className={`ntag ${large ? "ntag-lg" : ""} ${className}`}
      style={{ background: c.bg, color: c.fg, ...style }}
    >
      {children}
    </span>
  );
}
