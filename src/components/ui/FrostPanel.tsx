import type { CSSProperties, ReactNode } from 'react';

interface FrostPanelProps {
  children: ReactNode;
  blur?: 'light' | 'normal' | 'heavy';
  className?: string;
  style?: CSSProperties;
}

const blurVar = {
  light: 'var(--frost-blur-light)',
  normal: 'var(--frost-blur)',
  heavy: 'var(--frost-blur-heavy)',
};

export function FrostPanel({ children, blur = 'normal', className, style }: FrostPanelProps) {
  const filter = `blur(${blurVar[blur]}) contrast(var(--frost-contrast)) brightness(var(--frost-brightness))`;
  return (
    <div
      className={className}
      style={{
        background: 'var(--frost-tint)',
        backdropFilter: filter,
        WebkitBackdropFilter: filter,
        borderRadius: 'var(--radius-panel)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
