import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Spherical, Vector3, type Camera } from 'three';
import { cx } from '../lib/cx';
import { MUSCLES, type MuscleId } from '../domain/muscles';
import type { Scan } from '../domain/schema';
import type { ModelDetail } from './anatomy';
import { BodyScene, type MuscleVisual } from './BodyScene';
import { buildRig } from './rig';
import { shapeFactors, type BodyShape } from './shape';

export interface BodyViewerProps {
  shape: BodyShape;
  detail: ModelDetail;
  /** Latest body scan and the per-muscle bulges on its date (precise mode). */
  scan?: Scan | null;
  bulgesAtScan?: Record<MuscleId, number> | null;
  muscles: Record<MuscleId, MuscleVisual & { label?: string }>;
  selected?: MuscleId | null;
  onSelect?: (id: MuscleId) => void;
  dark: boolean;
  className?: string;
}

type View = 'front' | 'back' | 'left' | 'right';
const VIEW_AZIMUTH: Record<View, number> = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

// Scratch objects reused every frame (module scope keeps them out of React's render data).
const spherical = new Spherical();
const offset = new Vector3();

function CameraRig({ view, nonce, target }: { view: View; nonce: number; target: Vector3 }) {
  const { camera, controls } = useThree() as unknown as { camera: Camera; controls: { update(): void } | null };
  const animating = useRef<number | null>(null);

  useEffect(() => {
    if (nonce > 0) animating.current = VIEW_AZIMUTH[view];
  }, [view, nonce]);

  useFrame((_, delta) => {
    if (animating.current === null) return;
    offset.copy(camera.position).sub(target);
    spherical.setFromVector3(offset);
    let diff = animating.current - spherical.theta;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < 0.005) {
      spherical.theta = animating.current;
      animating.current = null;
    } else {
      spherical.theta += diff * Math.min(1, delta * 6);
    }
    spherical.phi += (Math.PI / 2.1 - spherical.phi) * Math.min(1, delta * 6);
    offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls?.update();
  });
  return null;
}

export default function BodyViewer({
  shape,
  detail,
  scan,
  bulgesAtScan,
  muscles,
  selected,
  onSelect,
  dark,
  className,
}: BodyViewerProps) {
  const [hovered, setHovered] = useState<MuscleId | null>(null);
  const [view, setView] = useState<View>('front');
  const [nonce, setNonce] = useState(0);
  const factors = useMemo(() => shapeFactors(shape), [shape]);
  const rig = useMemo(() => buildRig(factors, detail, scan, bulgesAtScan), [factors, detail, scan, bulgesAtScan]);
  const target = useMemo(() => new Vector3(0, 0.98 * factors.scale, 0), [factors.scale]);
  const distance = 3.3 * factors.scale;

  const go = (v: View) => {
    setView(v);
    setNonce((n) => n + 1);
  };

  const label = hovered ?? selected;

  return (
    <div className={cx('relative overflow-hidden rounded-2xl', className)} style={{ background: 'var(--scene-bg)' }}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [0, target.y + 0.15, distance], fov: 32, near: 0.1, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => setHovered(null)}
        style={{ cursor: hovered ? 'pointer' : 'grab', touchAction: 'none' }}
        aria-label="Interactive 3D body model. Drag to rotate, click a muscle for details."
        role="img"
      >
        <ambientLight intensity={dark ? 0.35 : 0.45} />
        <hemisphereLight args={[dark ? '#b8c4ff' : '#ffffff', dark ? '#1a1410' : '#d9d2c7', dark ? 0.55 : 0.8]} />
        <directionalLight
          position={[2.5, 4, 3]}
          intensity={dark ? 1.6 : 1.8}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-2.5, 3, -3]} intensity={dark ? 1.3 : 1.0} color={dark ? '#8fb3ff' : '#ffffff'} />
        <directionalLight position={[0, 1.5, 4]} intensity={0.35} />
        <BodyScene
          rig={rig}
          detail={detail}
          absDefinition={factors.absDefinition}
          muscles={muscles}
          skinColor={dark ? '#8e97a8' : '#c4cad4'}
          selected={selected}
          hovered={hovered}
          onHover={setHovered}
          onSelect={onSelect}
        />
        <ContactShadows position={[0, 0, 0]} opacity={dark ? 0.6 : 0.35} scale={3} blur={2.4} far={2} />
        <OrbitControls
          makeDefault
          target={target}
          enablePan={false}
          minDistance={1.4 * factors.scale}
          maxDistance={6 * factors.scale}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 1.75}
          rotateSpeed={0.8}
        />
        <CameraRig view={view} nonce={nonce} target={target} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="min-h-[3rem]">
          {label && (
            <div className="rounded-xl bg-surface/90 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-sm font-semibold">{MUSCLES[label].name}</div>
              {muscles[label].label && <div className="text-xs text-muted">{muscles[label].label}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 p-3">
        <div className="flex rounded-xl border border-border bg-surface/90 p-1 shadow-sm backdrop-blur">
          {(['front', 'left', 'back', 'right'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => go(v)}
              className={cx(
                'rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition',
                view === v ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(view)}
            aria-label="Reset camera"
            className="rounded-lg px-2 py-1 text-muted hover:text-fg"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
