import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Color } from 'three';
import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import {
  forearmRings,
  JOINTS,
  partsForSegment,
  shinRings,
  thighRings,
  torsoRings,
  upperArmRings,
  type SegmentId,
} from './anatomy';
import { deformLoft, type MuscleLook, type RGB } from './deform';
import { buildLoft, UNIT_SPHERE, type Loft } from './geometry';
import type { ShapeFactors } from './shape';

export interface MuscleVisual {
  color: string;
  /** Bulge multiplier derived from the muscle's level. */
  bulge: number;
}

export interface BodySceneProps {
  shape: ShapeFactors;
  muscles: Record<MuscleId, MuscleVisual>;
  skinColor: string;
  selected?: MuscleId | null;
  hovered?: MuscleId | null;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}

const SEGMENTS: SegmentId[] = ['torso', 'upperArm', 'forearm', 'thigh', 'shin'];

function toLinear(hex: string): RGB {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

function pick(e: ThreeEvent<PointerEvent | MouseEvent>, owner: Int16Array): MuscleId | null {
  const f = e.face;
  if (!f) return null;
  for (const i of [f.a, f.b, f.c]) if (owner[i] >= 0) return MUSCLE_IDS[owner[i]];
  return null;
}

function SkinMesh({
  loft,
  owner,
  onHover,
  onSelect,
}: {
  loft: Loft;
  owner: Int16Array;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}) {
  return (
    <mesh
      geometry={loft.geometry}
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover?.(pick(e, owner));
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = pick(e, owner);
        if (id) onSelect?.(id);
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.52} metalness={0.04} />
    </mesh>
  );
}

function Blob({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) {
  return (
    <mesh geometry={UNIT_SPHERE} position={position} scale={scale} castShadow>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.02} />
    </mesh>
  );
}

type Lofts = Record<SegmentId, Loft>;
type Owners = Record<SegmentId, Int16Array>;

/** One side (+x) of the limbs; the other side is the same tree mirrored. */
function Limbs({ shape, lofts, owners, skinColor, onHover, onSelect }: {
  shape: ShapeFactors;
  lofts: Lofts;
  owners: Owners;
  skinColor: string;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}) {
  const [sx, sy, sz] = JOINTS.shoulder;
  const [hx, hy, hz] = JOINTS.hip;
  const skin = (seg: SegmentId) => <SkinMesh loft={lofts[seg]} owner={owners[seg]} onHover={onHover} onSelect={onSelect} />;
  return (
    <>
      <group position={[sx * shape.shoulderWidth * shape.girth, sy, sz]} rotation={[0, 0, JOINTS.armAngle]}>
        {skin('upperArm')}
        <Blob position={[0, -JOINTS.upperArmLength + 0.005, 0]} scale={[0.036, 0.036, 0.037]} color={skinColor} />
        <group position={[0, -JOINTS.upperArmLength, 0]} rotation={[JOINTS.forearmBend, 0, -0.06]}>
          {skin('forearm')}
          <Blob position={[0, -JOINTS.forearmLength + 0.01, 0]} scale={[0.024, 0.024, 0.021]} color={skinColor} />
          <Blob position={[0, -JOINTS.forearmLength - 0.075, 0.008]} scale={[0.024, 0.08, 0.046]} color={skinColor} />
        </group>
      </group>
      <group position={[hx * shape.hipWidth * shape.girth, hy, hz]} rotation={[0, 0, JOINTS.legAngle]}>
        {skin('thigh')}
        <Blob position={[0, -JOINTS.thighLength, 0.004]} scale={[0.047, 0.05, 0.049]} color={skinColor} />
        <group position={[0, -JOINTS.thighLength, 0]} rotation={[0, 0, -JOINTS.legAngle]}>
          {skin('shin')}
          <Blob position={[0, -JOINTS.shinLength - 0.035, 0.045]} scale={[0.044, 0.034, 0.115]} color={skinColor} />
        </group>
      </group>
    </>
  );
}

export function BodyScene({ shape, muscles, skinColor, selected, hovered, onHover, onSelect }: BodySceneProps) {
  const lofts = useMemo<Lofts>(
    () => ({
      torso: buildLoft(torsoRings(shape), 72, 10),
      upperArm: buildLoft(upperArmRings(shape), 48, 10),
      forearm: buildLoft(forearmRings(shape), 40, 8),
      thigh: buildLoft(thighRings(shape), 56, 10),
      shin: buildLoft(shinRings(shape), 44, 8),
    }),
    [shape],
  );
  useEffect(() => () => SEGMENTS.forEach((s) => lofts[s].geometry.dispose()), [lofts]);

  const looks = useMemo(() => {
    const out = {} as Record<MuscleId, MuscleLook>;
    for (const id of MUSCLE_IDS) {
      out[id] = {
        color: toLinear(muscles[id].color),
        bulgeScale: muscles[id].bulge,
        highlight: id === selected ? 1 : id === hovered ? 0.6 : 0,
      };
    }
    return out;
  }, [muscles, selected, hovered]);

  const owners = useMemo(() => {
    const skin = toLinear(skinColor);
    const out = {} as Owners;
    for (const seg of SEGMENTS) {
      out[seg] = deformLoft(lofts[seg], partsForSegment(seg), looks, { skin, absDefinition: shape.absDefinition });
    }
    return out;
  }, [lofts, looks, skinColor, shape.absDefinition]);

  return (
    <group scale={shape.scale}>
      <SkinMesh loft={lofts.torso} owner={owners.torso} onHover={onHover} onSelect={onSelect} />
      <Blob position={[0, 1.695, 0.01]} scale={[0.08, 0.11, 0.096]} color={skinColor} />
      <Limbs shape={shape} lofts={lofts} owners={owners} skinColor={skinColor} onHover={onHover} onSelect={onSelect} />
      <Mirror>
        <Limbs shape={shape} lofts={lofts} owners={owners} skinColor={skinColor} onHover={onHover} onSelect={onSelect} />
      </Mirror>
    </group>
  );
}

function Mirror({ children }: { children: ReactNode }) {
  return <group scale={[-1, 1, 1]}>{children}</group>;
}
