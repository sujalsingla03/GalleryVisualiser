import { useViewStore } from '../store/viewStore';
import { FrostPanel } from './ui/FrostPanel';

export function GlobeHud() {
  const setView = useViewStore((s) => s.setView);
  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 10,
        display: 'flex',
        gap: 12,
      }}
    >
      <FrostPanel style={{ padding: '8px 14px' }}>
        <button
          onClick={() => setView('landing')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-grey-100)',
            fontSize: 'var(--font-size-md)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          ← Back
        </button>
      </FrostPanel>
      <FrostPanel style={{ padding: '8px 14px' }}>
        <span
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-grey-300)',
          }}
        >
          My Trip
        </span>
      </FrostPanel>
    </div>
  );
}
