import { Fragment, useEffect, useRef, useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useHandStore } from '../store/handStore';
import { handTracker } from '../lib/handTracking';

/**
 * Full-screen AR passthrough: the live (mirrored) webcam fills the viewport behind the
 * transparent 3D canvas, so photos appear to float in the room around you. Also owns the
 * webcam start/stop lifecycle driven by the hand-control toggle.
 */
export function CameraLayer() {
  const enabled = useHandStore((s) => s.enabled);
  const status = useHandStore((s) => s.status);
  const errorMessage = useHandStore((s) => s.errorMessage);
  const setStatus = useHandStore((s) => s.setStatus);
  const bgRef = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    if (!enabled) {
      handTracker.stop();
      setStatus('off');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setStatus('requesting-permission');
        await handTracker.start((phase) => {
          if (cancelled) return;
          setStatus(phase === 'camera' ? 'requesting-permission' : 'loading-model');
        });
        if (cancelled) {
          handTracker.stop();
          return;
        }
        setStatus('active');
        const video = handTracker.getVideoElement();
        if (video && bgRef.current) {
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          // Mirror so the user sees themselves naturally (matches the mirrored landmarks).
          video.style.transform = 'scaleX(-1)';
          bgRef.current.appendChild(video);
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'Camera permission denied. Enable it in your browser settings.'
              : err.message
            : 'Failed to start hand tracking.';
        setStatus('error', msg);
      }
    })();

    return () => {
      cancelled = true;
      handTracker.stop();
      if (bgRef.current) bgRef.current.replaceChildren();
    };
  }, [enabled, setStatus]);

  // Auto-dismiss the gesture cheat sheet after a few seconds.
  useEffect(() => {
    if (status !== 'active') return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 7000);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <>
      {/* Webcam fills the viewport; gray fallback shows when the camera is off. */}
      <div
        ref={bgRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          overflow: 'hidden',
          background: enabled ? '#111' : 'var(--surface, #ededed)',
        }}
      />

      {enabled && status !== 'active' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <FrostPanel style={{ padding: '12px 18px' }}>
            <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--text-secondary)' }}>
              {status === 'requesting-permission' && 'Asking for camera…'}
              {status === 'loading-model' && 'Loading hand model…'}
              {status === 'off' && 'Camera off'}
              {status === 'error' && (errorMessage ?? '⚠ Camera unavailable')}
            </span>
          </FrostPanel>
        </div>
      )}

      {enabled && status === 'active' && (
        <div className="gesture-dock">
          {showHint && (
            <FrostPanel className="gesture-sheet">
              <div className="gesture-grid">
                {GESTURES_CORE.map(([icon, label]) => (
                  <Fragment key={label}>
                    <span style={{ whiteSpace: 'nowrap' }}>{icon}</span>
                    <span>{label}</span>
                  </Fragment>
                ))}
                {GESTURES_ADVANCED.map(([icon, label]) => (
                  <Fragment key={label}>
                    <span className="gesture-advanced" style={{ whiteSpace: 'nowrap' }}>
                      {icon}
                    </span>
                    <span className="gesture-advanced">{label}</span>
                  </Fragment>
                ))}
              </div>
            </FrostPanel>
          )}
          <FrostPanel style={{ padding: '6px 12px' }}>
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--font-size-sm)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                minHeight: 40,
              }}
            >
              {showHint ? '✕ Hide' : '✋ Gestures'}
            </button>
          </FrostPanel>
        </div>
      )}
    </>
  );
}

const GESTURES_CORE: [string, string][] = [
  ['☝️ + 🤏', 'Point + pinch to grab a photo'],
  ['↔', 'Move hand to reposition'],
  ['👋 closer', 'Move toward camera to pull closer'],
  ['✐ release', 'Open fingers to drop'],
  ['🤏 empty', 'Pinch empty space to pan'],
  ['✊ fist', 'Fist to stop spin'],
];

const GESTURES_ADVANCED: [string, string][] = [
  ['🤏 spread', 'Thumb + middle to resize'],
  ['🙌 two hands', 'Two hands to scale larger'],
  ['🌀 twist', 'Roll wrist to rotate photo'],
  ['🤲 zoom', 'Open hands apart / together to zoom'],
  ['🔄 twist both', 'Both pinched — turn the space'],
  ['👋 swipe', 'Flick open hand to spin'],
];
