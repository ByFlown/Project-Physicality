import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import type { ModelDetail } from './anatomy';
import type { MuscleVisual } from './BodyScene';
import type { MuscleLook, RGB } from './deform';
import { avatarColors, buildAvatar } from './human/avatar';
import type { LoadedHuman } from './human/loadedHuman';
import { makeSkinMaterial } from './human/skinMaterial';

export interface HumanSceneProps {
  human: LoadedHuman;
  coeffs: ArrayLike<number>;
  statureM: number;
  /** Bulge factors when the body shape was observed (scan date or profile start). */
  anchorBulges: Record<MuscleId, number>;
  fatDelta: number;
  detail: ModelDetail;
  muscles: Record<MuscleId, MuscleVisual>;
  skinColor: string;
  clothColor: string;
  /** Show muscle colours over the skin (otherwise only hovered/selected muscles are coloured). */
  overlay?: boolean;
  selected?: MuscleId | null;
  hovered?: MuscleId | null;
  onHover?: (id: MuscleId | null) => void;
  onSelect?: (id: MuscleId) => void;
}

function toLinear(hex: string): RGB {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

/** The realistic (MakeHuman-based) body with muscle growth, colours and picking. */
export function HumanScene({
  human,
  coeffs,
  statureM,
  anchorBulges,
  fatDelta,
  detail,
  muscles,
  skinColor,
  clothColor,
  overlay = true,
  selected,
  hovered,
  onHover,
  onSelect,
}: HumanSceneProps) {
  // Positions depend on shape and levels only; hover/selection just recolours.
  const bulgeKey = MUSCLE_IDS.map((id) => muscles[id].bulge.toFixed(3)).join(',');
  const geo = useMemo(() => {
    const bulges = Object.fromEntries(bulgeKey.split(',').map((b, i) => [MUSCLE_IDS[i], Number(b)])) as Record<
      MuscleId,
      number
    >;
    return buildAvatar({
      model: human.model,
      map: human.map,
      coeffs,
      statureM,
      bulges,
      anchorBulges,
      fatDelta,
      detail,
      clothing: human.clothing,
      adjacency: human.adjacency,
    });
  }, [human, coeffs, statureM, bulgeKey, anchorBulges, fatDelta, detail]);

  const material = useMemo(() => makeSkinMaterial(human.pattern, clothColor), [human, clothColor]);
  useEffect(() => () => material.dispose(), [material]);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(geo.positions, 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(geo.positions.length), 3));
    g.setAttribute('aRest', new BufferAttribute(human.pattern.rest, 3));
    g.setAttribute('aBare', new BufferAttribute(human.pattern.bare, 1));
    g.setAttribute('aHighlight', new BufferAttribute(new Float32Array(geo.owner.length), 1));
    g.setIndex(new BufferAttribute(geo.index, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [geo, human]);
  useEffect(() => () => geometry.dispose(), [geometry]);

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

  useEffect(() => {
    const attr = geometry.getAttribute('color') as BufferAttribute;
    avatarColors(
      geo,
      human.clothing,
      looks,
      { skin: toLinear(skinColor), tint: overlay ? 0.6 : 0, adjacency: human.adjacency },
      attr.array as Float32Array,
    );
    attr.needsUpdate = true;
    const hl = geometry.getAttribute('aHighlight') as BufferAttribute;
    const h = hl.array as Float32Array;
    for (let v = 0; v < h.length; v++) {
      const o = geo.owner[v];
      h[v] = o >= 0 ? looks[MUSCLE_IDS[o]].highlight * geo.ownerCoverage[v] : 0;
    }
    hl.needsUpdate = true;
  }, [geometry, geo, human, looks, skinColor, overlay]);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): MuscleId | null => {
    const f = e.face;
    if (!f) return null;
    for (const i of [f.a, f.b, f.c]) if (geo.owner[i] >= 0) return MUSCLE_IDS[geo.owner[i]];
    return null;
  };

  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover?.(pick(e));
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = pick(e);
        if (id) onSelect?.(id);
      }}
    />
  );
}
