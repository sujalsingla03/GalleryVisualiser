import { lazy, Suspense } from 'react';
import { SvgFilters } from './components/SvgFilters';
import { LandingScreen } from './components/LandingScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { useViewStore } from './store/viewStore';

const SpaceView = lazy(() =>
  import('./components/SpaceView').then((m) => ({ default: m.SpaceView })),
);

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      {view === 'landing' && <LandingScreen />}
      {view === 'processing' && <ProcessingScreen />}
      {view === 'space' && (
        <Suspense fallback={null}>
          <SpaceView />
        </Suspense>
      )}
    </>
  );
}
