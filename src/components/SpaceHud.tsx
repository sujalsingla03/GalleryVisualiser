import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';
import { useSpacePrefsStore } from '../store/spacePrefsStore';
import { LAYOUT_MODE_LABELS } from '../lib/computeLayout';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const handEnabled = useHandStore((s) => s.enabled);
  const toggleHand = useHandStore((s) => s.toggle);
  const clear = usePhotoStore((s) => s.clear);
  const autoOrbit = useSpacePrefsStore((s) => s.autoOrbit);
  const toggleAutoOrbit = useSpacePrefsStore((s) => s.toggleAutoOrbit);
  const layoutMode = useSpacePrefsStore((s) => s.layoutMode);
  const cycleLayoutMode = useSpacePrefsStore((s) => s.cycleLayoutMode);
  const reshuffle = useSpacePrefsStore((s) => s.reshuffle);

  const onClear = () => {
    clear();
    setView('landing');
  };

  return (
    <div className="space-hud">
      <FrostPanel className="space-hud-chip">
        <button type="button" className="space-hud-btn" onClick={onClear}>
          <span className="label-full">← New space</span>
          <span className="label-short">← New</span>
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <button type="button" className="space-hud-btn" onClick={triggerReset}>
          <span className="label-full">⊙ Reset view</span>
          <span className="label-short">⊙ Reset</span>
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <button
          type="button"
          className={`space-hud-btn${autoOrbit ? ' is-active' : ''}`}
          onClick={toggleAutoOrbit}
          title="Slow automatic spin"
        >
          <span className="label-full">{autoOrbit ? '↻ Orbit on' : '↻ Orbit'}</span>
          <span className="label-short">{autoOrbit ? '↻ On' : '↻ Spin'}</span>
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <button
          type="button"
          className="space-hud-btn"
          onClick={cycleLayoutMode}
          title="Change arrangement"
        >
          <span className="label-full">▦ {LAYOUT_MODE_LABELS[layoutMode]}</span>
          <span className="label-short">▦ {LAYOUT_MODE_LABELS[layoutMode]}</span>
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <button type="button" className="space-hud-btn" onClick={reshuffle} title="Shuffle positions">
          ⟲ Mix
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <button
          type="button"
          className={`space-hud-btn${handEnabled ? ' is-active' : ''}`}
          onClick={toggleHand}
          title={handEnabled ? 'Turn off camera & hand tracking' : 'Enable camera for AR + gestures'}
        >
          {handEnabled ? '🖐 On' : '🖐 Hands'}
        </button>
      </FrostPanel>
      <FrostPanel className="space-hud-chip">
        <span className="space-hud-count">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </FrostPanel>
    </div>
  );
}
