import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Color } from 'three';
import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import type { ModelDetail, SegmentId } from './anatomy';
import { deformLoft, type MuscleLook, type RGB } from './deform';
import { buildLoft, UNIT_SPHERE, type Loft } from './geometry';
import { placeParts, SEGMENTS, type BodyRig } from './rig';

export interface MuscleVisual {
  color: string;
  /** Bulge multiplier derived from the muscle's level. */
  bulge: number;
}

export interface BodySceneProps {
  rig: BodyRig;
  detail: ModelDetail;
  absDefinition: number;
  muscles: Record<MuscleId, MuscleVisual>;
  skinColor: string;
  selected?: MuscleId | null;
  hovered?: MuscleId | null;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}

/** Mesh resolution per segment: [radial segments, rings per span]. */
const RESOLUTION: Record<ModelDetail, Record<SegmentId, [number, number]>> = {
  standard: { torso: [72, 10], upperArm: [48, 10], forearm: [40, 8], thigh: [56, 10], shin: [44, 8] },
  precise: { torso: [112, 14], upperArm: [72, 14], forearm: [56, 12], thigh: [80, 14], shin: [64, 12] },
};

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

function Blob({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  return (
    <mesh geometry={UNIT_SPHERE} position={position} scale={scale} castShadow>
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.02} />
    </mesh>
  );
}

type Lofts = Record<SegmentId, Loft>;
type Owners = Record<SegmentId, Int16Array>;

/** One side (+x) of the limbs; the other side is the same tree mirrored. */
function Limbs({
  rig,
  lofts,
  owners,
  skinColor,
  onHover,
  onSelect,
}: {
  rig: BodyRig;
  lofts: Lofts;
  owners: Owners;
  skinColor: string;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}) {
  const s = rig.scale;
  const ga = rig.girthScale.upperArm;
  const gf = rig.girthScale.forearm;
  const gt = rig.girthScale.thigh;
  const skin = (seg: SegmentId) => (
    <SkinMesh loft={lofts[seg]} owner={owners[seg]} onHover={onHover} onSelect={onSelect} />
  );
  return (
    <>
      <group position={rig.shoulder} rotation={[0, 0, rig.armAngle]}>
        {skin('upperArm')}
        <Blob
          position={[0, -rig.upperArmLength + 0.005 * s, 0]}
          scale={[0.036 * ga, 0.036 * ga, 0.037 * ga]}
          color={skinColor}
        />
        <group position={[0, -rig.upperArmLength, 0]} rotation={[rig.forearmBend, 0, -0.06]}>
          {skin('forearm')}
          <Blob
            position={[0, -rig.forearmLength + 0.01 * s, 0]}
            scale={[0.024 * gf, 0.024 * gf, 0.021 * gf]}
            color={skinColor}
          />
          <Blob
            position={[0, -rig.forearmLength - 0.075 * s, 0.008 * s]}
            scale={[0.024 * s, 0.08 * s, 0.046 * s]}
            color={skinColor}
          />
        </group>
      </group>
      <group position={rig.hip} rotation={[0, 0, rig.legAngle]}>
        {skin('thigh')}
        <Blob
          position={[0, -rig.thighLength, 0.004 * s]}
          scale={[0.047 * gt, 0.05 * gt, 0.049 * gt]}
          color={skinColor}
        />
        <group position={[0, -rig.thighLength, 0]} rotation={[0, 0, -rig.legAngle]}>
          {skin('shin')}
          <Blob
            position={[0, -rig.shinLength - 0.035 * s, 0.045 * s]}
            scale={[0.044 * s, 0.034 * s, 0.115 * s]}
            color={skinColor}
          />
        </group>
      </group>
    </>
  );
}

export function BodyScene({
  rig,
  detail,
  absDefinition,
  muscles,
  skinColor,
  selected,
  hovered,
  onHover,
  onSelect,
}: BodySceneProps) {
  const lofts = useMemo<Lofts>(() => {
    const res = RESOLUTION[detail];
    const out = {} as Lofts;
    for (const seg of SEGMENTS) out[seg] = buildLoft(rig.rings[seg], res[seg][0], res[seg][1]);
    return out;
  }, [rig, detail]);
  useEffect(() => () => SEGMENTS.forEach((s) => lofts[s].geometry.dispose()), [lofts]);

  const parts = useMemo(
    () =>
      Object.fromEntries(SEGMENTS.map((seg) => [seg, placeParts(seg, rig, detail)])) as Record<
        SegmentId,
        ReturnType<typeof placeParts>
      >,
    [rig, detail],
  );

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
    for (const seg of SEGMENTS) out[seg] = deformLoft(lofts[seg], parts[seg], looks, { skin, absDefinition });
    return out;
  }, [lofts, parts, looks, skinColor, absDefinition]);

  return (
    <group>
      <SkinMesh loft={lofts.torso} owner={owners.torso} onHover={onHover} onSelect={onSelect} />
      <Blob position={rig.head.center} scale={rig.head.radii} color={skinColor} />
      <Limbs rig={rig} lofts={lofts} owners={owners} skinColor={skinColor} onHover={onHover} onSelect={onSelect} />
      <Mirror>
        <Limbs rig={rig} lofts={lofts} owners={owners} skinColor={skinColor} onHover={onHover} onSelect={onSelect} />
      </Mirror>
    </group>
  );
}

function Mirror({ children }: { children: ReactNode }) {
  return <group scale={[-1, 1, 1]}>{children}</group>;
}
