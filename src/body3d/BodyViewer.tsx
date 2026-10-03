import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Layers, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Spherical, Vector3, type Camera } from 'three';
import { cx } from '../lib/cx';
import { MUSCLES, type MuscleId } from '../domain/muscles';
import type { Scan } from '../domain/schema';
import type { ModelDetail } from './anatomy';
import { BodyScene, type MuscleVisual } from './BodyScene';
import { HumanScene } from './HumanScene';
import { loadHuman, type LoadedHuman } from './human/loadedHuman';
import { profileCoeffs } from './human/profileShape';
import { CLOTH_COLOR, DEFAULT_SKIN_TONE, SKIN_TONES, type RealisticBody } from './human/realistic';
import { buildRig } from './rig';
import { shapeFactors, type BodyShape } from './shape';

export interface BodyViewerProps {
  shape: BodyShape;
  detail: ModelDetail;
  /** Latest body scan and the per-muscle bulges on its date (precise mode). */
  scan?: Scan | null;
  bulgesAtScan?: Record<MuscleId, number> | null;
  /** The realistic body (precise detail); falls back to the procedural body while it loads. */
  realistic?: RealisticBody | null;
  skinTone?: number;
  muscles: Record<MuscleId, MuscleVisual & { label?: string }>;
  selected?: MuscleId | null;
  onSelect?: (id: MuscleId) => void;
  dark: boolean;
  className?: string;
}

type View = 'front' | 'back' | 'left' | 'right';
const VIEW_AZIMUTH: Record<View, number> = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

const OVERLAY_KEY = 'physicality:muscle-overlay';
function readOverlay(): boolean {
  try {
    return localStorage.getItem(OVERLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}
function writeOverlay(on: boolean) {
  try {
    localStorage.setItem(OVERLAY_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice just isn't remembered.
  }
}

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
  realistic,
  skinTone,
  muscles,
  selected,
  onSelect,
  dark,
  className,
}: BodyViewerProps) {
  const wantHuman = detail === 'precise' && realistic ? realistic.sex : null;
  const [human, setHuman] = useState<{ sex: string; loaded: LoadedHuman } | null>(null);
  useEffect(() => {
    if (!wantHuman) return;
    let live = true;
    loadHuman(wantHuman).then(
      (loaded) => live && setHuman({ sex: wantHuman, loaded }),
      () => undefined, // stay on the procedural body
    );
    return () => {
      live = false;
    };
  }, [wantHuman]);
  const loadedHuman = human && human.sex === wantHuman ? human.loaded : null;
  const humanCoeffs = useMemo(() => {
    if (!loadedHuman || !realistic) return null;
    if (realistic.coeffs) return realistic.coeffs;
    return realistic.profile ? Array.from(profileCoeffs(loadedHuman.model, realistic.profile)) : null;
  }, [loadedHuman, realistic]);
  const showHuman = !!(loadedHuman && realistic && humanCoeffs);
  const [overlay, setOverlay] = useState(readOverlay);
  const toggleOverlay = () => {
    setOverlay((o) => {
      writeOverlay(!o);
      return !o;
    });
  };
  const [hovered, setHovered] = useState<MuscleId | null>(null);
  const [view, setView] = useState<View>('front');
  const [nonce, setNonce] = useState(0);
  const factors = useMemo(() => shapeFactors(shape), [shape]);
  const rig = useMemo(() => buildRig(factors, detail, scan, bulgesAtScan), [factors, detail, scan, bulgesAtScan]);
  const target = useMemo(() => new Vector3(0, 0.9 * factors.scale, 0), [factors.scale]);
  const distance = 3.65 * factors.scale;

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
        {showHuman ? (
          // Skin needs contrast: a key light with soft fill from the studio environment.
          <>
            <ambientLight intensity={dark ? 0.12 : 0.18} />
            <hemisphereLight args={['#fff8f0', dark ? '#1a1410' : '#cfc7bb', dark ? 0.7 : 0.85]} />
            <directionalLight
              position={[2.2, 3.6, 3]}
              intensity={dark ? 1.9 : 2.1}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight
              position={[-2.8, 2.6, -2.5]}
              intensity={dark ? 1.4 : 0.9}
              color={dark ? '#a9c1ff' : '#fff4ea'}
            />
          </>
        ) : (
          <>
            <ambientLight intensity={dark ? 0.35 : 0.45} />
            <hemisphereLight args={[dark ? '#b8c4ff' : '#ffffff', dark ? '#1a1410' : '#d9d2c7', dark ? 0.55 : 0.8]} />
            <directionalLight
              position={[2.5, 4, 3]}
              intensity={dark ? 1.6 : 1.8}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight
              position={[-2.5, 3, -3]}
              intensity={dark ? 1.3 : 1.0}
              color={dark ? '#8fb3ff' : '#ffffff'}
            />
            <directionalLight position={[0, 1.5, 4]} intensity={0.35} />
          </>
        )}
        {showHuman && loadedHuman && realistic && humanCoeffs ? (
          <>
            <HumanScene
              human={loadedHuman}
              coeffs={humanCoeffs}
              statureM={realistic.statureM}
              anchorBulges={realistic.anchorBulges}
              fatDelta={realistic.fatDelta}
              detail={detail}
              muscles={muscles}
              skinColor={SKIN_TONES[skinTone ?? DEFAULT_SKIN_TONE] ?? SKIN_TONES[DEFAULT_SKIN_TONE]}
              clothColor={CLOTH_COLOR}
              overlay={overlay}
              selected={selected}
              hovered={hovered}
              onHover={setHovered}
              onSelect={onSelect}
            />
          </>
        ) : (
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
        )}
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
          {showHuman && (
            <button
              type="button"
              onClick={toggleOverlay}
              aria-pressed={overlay}
              aria-label="Show muscle colours"
              title={overlay ? 'Hide muscle colours' : 'Show muscle colours'}
              className={cx('rounded-lg px-2 py-1', overlay ? 'text-accent' : 'text-muted hover:text-fg')}
            >
              <Layers size={14} />
            </button>
          )}
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
