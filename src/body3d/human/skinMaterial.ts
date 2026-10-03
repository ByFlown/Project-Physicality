import { Color, MeshStandardMaterial } from 'three';
import type { ClothingPattern } from './avatar';

/**
 * Skin material that draws the underwear per pixel from each vertex's
 * rest-pose position, so hems are crisp whatever the mesh topology. The
 * pattern mirrors `clothingAt` in human/avatar.ts.
 */
export function makeSkinMaterial(pattern: ClothingPattern, cloth: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const uniforms = {
    uCloth: { value: new Color(cloth) },
    uHip: { value: pattern.hip },
    uKnee: { value: pattern.knee },
    uShoulder: { value: pattern.shoulder },
    uLegCut: { value: pattern.legCut },
    uBriefTop: { value: pattern.briefTop },
    uTop: { value: pattern.top ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aRest;
attribute float aBare;
attribute float aHighlight;
varying vec3 vRest;
varying float vBare;
varying float vHighlight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRest = aRest;
vBare = aBare;
vHighlight = aHighlight;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uCloth;
uniform float uHip, uKnee, uShoulder, uLegCut, uBriefTop, uTop;
varying vec3 vRest;
varying float vBare;
varying float vHighlight;
const float CLOTH_SOFT = 0.0015;
float clothBand(float y, float lo, float hi) { return smoothstep(-CLOTH_SOFT, CLOTH_SOFT, min(y - lo, hi - y)); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float x = abs(vRest.x);
  float y = vRest.y;
  float bottom = uLegCut + min(1.0, x / 0.11) * (uHip - 0.02 - uLegCut) * 0.55;
  float w = clothBand(y, bottom, uBriefTop) * step(uKnee, y);
  if (uTop > 0.5) {
    float chestTop = uShoulder - 0.045 + (vRest.z > 0.0 ? 0.0 : 0.02);
    w = max(w, clothBand(y, uShoulder - 0.17, chestTop) * smoothstep(-CLOTH_SOFT, CLOTH_SOFT, 0.13 - x));
  }
  w *= 1.0 - step(0.5, vBare);
  // Hovered or selected muscles show through the fabric.
  diffuseColor.rgb = mix(diffuseColor.rgb, uCloth, w * (1.0 - 0.65 * vHighlight));
}`,
      );
  };
  return material;
}
