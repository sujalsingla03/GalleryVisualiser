import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const handEnabled = useHandStore((s) => s.enabled);
  const toggleHand = useHandStore((s) => s.toggle);
  const clear = usePhotoStore((s) => s.clear);

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
