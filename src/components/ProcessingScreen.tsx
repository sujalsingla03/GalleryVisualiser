import { useViewStore } from '../store/viewStore';

export function ProcessingScreen() {
  const loaded = useViewStore((s) => s.loaded);
  const total = useViewStore((s) => s.total);
  const pct = total === 0 ? 0 : Math.round((loaded / total) * 100);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6">
      <div
        style={{
          fontSize: 'var(--font-size-xl)',
          color: 'var(--color-grey-100)',
          letterSpacing: '0.02em',
        }}
      >
        Building your space…
      </div>
      <div
        style={{
          width: 320,
          height: 4,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width var(--duration-color) var(--ease-translate)',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--color-grey-400)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {loaded} / {total} photos
      </div>
    </div>
  );
}
