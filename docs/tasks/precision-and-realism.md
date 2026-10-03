# Phases: precise body scans + a realistic, customised body

> Working file for this initiative. Read it before touching `src/scan/fit.ts`, `src/scan/bench/` or
> `src/body3d/human/`. Tick the checkboxes as you go. The earlier scan work is in `body-scan-precise-model.md`.

## 1. The request

1. "Work out a way to make the body scans **way** more precise."
2. "Make the body visualisation much more realistic — e.g. MakeHuman / human-creator systems for good-looking,
   **customised** humans, or some other way."

These are phases, not tasks.

## 2. Assumptions challenged before building

| Assumption                                                               | What we found                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "More precise" means sharper segmentation and better landmarks.          | False, by measurement. With a **perfect** mask and **exact** landmarks the old chord method still had 3.9 cm mean error; a 256-px segmenter and 4 px landmark noise added only ~0.2 cm. The bottleneck was the measurement model (two chords + an ellipse guess), a toe-perspective scale bias of 4–6%, and a shoulder-width bug.                                                                                                          |
| Precision can be improved without ground truth.                          | It can't be _claimed_ without it. No real tape-measured photo set exists here, so §4 builds a synthetic benchmark with known answers. Its limits are stated in §4.3.                                                                                                                                                                                                                                                                       |
| Phases 1 and 2 are independent.                                          | They share the key piece: a statistical body model. The standard way to measure a body from two photos is to fit such a model to the silhouettes; the same model, rendered, is the realistic body. So both phases were built on one asset.                                                                                                                                                                                                 |
| "Use MakeHuman" is a licensing question only.                            | MakeHuman's **assets** are CC0 (Sept 2020; code is AGPL and is not used). SMPL/STAR are non-commercial, so they were ruled out. Shipping raw MakeHuman targets would be >100 MB, so they are baked into a compact shape space.                                                                                                                                                                                                             |
| More realism is always better.                                           | A realistic body is a **nude** body. On a fitness dashboard (and in app stores) that is a problem, so the body wears simple fitted underwear (briefs; a sports top for female bodies). Photoreal faces, hair and eyes were deliberately not added: they cost megabytes, invite the uncanny valley and add nothing to "which muscles have I trained".                                                                                       |
| A "human creator" (free sliders) is the right way to customise the body. | For a progress tracker, a body you can sculpt freely stops being evidence. Customisation here comes from **data**: the body is fitted to your scan, or predicted from height, weight and body fat (weight slider solved so volume × Siri density = your weight). The only free choice is skin tone. A tape-measurement-driven refit was considered and deferred: it would double-count growth that the level model already draws (see §6). |

## 3. Architecture

```
MakeHuman CC0 data ──scripts/bake-body-model.mjs──► src/body3d/human/assets/human-{male,female}.bin
  (base mesh, 19-bone skin, 900 sampled bodies/sex → 48 PCA components, sparse muscle/fat sculpts)

          ┌──────────── Phase 1: measuring ────────────┐      ┌──────────── Phase 2: rendering ─────────────┐
photos ─► detector ─► geometry (chords, profiles) ─► fit.ts      scan.body.coeffs  or  profileShape (no scan)
                                                     │  LM fit of 48 coeffs to dense    │
                                                     │  silhouette rows + chords +      ▼
                                                     │  joints (analytic Jacobian)    avatar.ts: shape + sculpts(Δlevel)
                                                     ▼                                + footprints(Δlevel) + pose
                                   sites.ts: tape-measure the fitted mesh             + muscle colours + clothing
                                   (convex hull of plane slices)                      HumanScene.tsx (precise mode)
                                                     │
                                   Scan v3: circumferences + body {coeffs, rmsCm}
```

Key files:

| File                                                   | Role                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `scripts/bake-body-model.mjs`                          | Reproducible bake from a pinned MakeHuman commit (`npm run body:bake <checkout>`)            |
| `src/body3d/human/model.ts`                            | Decode the asset, coefficients → half-mesh → full mesh, joints, semantic-slider regression   |
| `src/body3d/human/pose.ts`                             | Linear blend skinning, simple photo/tape poses                                               |
| `src/body3d/human/measure.ts`, `sites.ts`              | Plane slices, convex-hull "tape", canonical measurement sites                                |
| `src/scan/fit.ts`, `refine.ts`, `fitWorker.ts`         | Observations from photos (or from a stored scan), the fit, circumferences on the fitted body |
| `src/scan/bench/`                                      | Synthetic ground-truth benchmark (`npm run scan:bench`)                                      |
| `src/body3d/human/muscleMap.ts`, `avatar.ts`           | Muscle footprints mapped onto the mesh; the rendered avatar                                  |
| `src/body3d/human/profileShape.ts`                     | Body from profile (FFMI → muscle, volume × density → weight)                                 |
| `src/body3d/HumanScene.tsx`, `BodyViewer`, `BodyPanel` | Rendering, overlay toggle, anchor (scan date / profile start)                                |
| `tools/body-lab/`                                      | Dev harness: `npm run dev` → `/tools/body-lab/?sex=female&view=grid&bulge=1.6`               |

## 4. Phase 1 — precision

### 4.1 Status

- [x] Bake the body model asset (48 components, <1 mm RMS reconstruction, ~1.4 MB per sex)
- [x] Synthetic benchmark with error sources separated (camera, segmenter, landmarks, off-model bodies)
- [x] Fix: floor from the ankle landmarks (toe perspective inflated px/cm by 4–6%)
- [x] Fix: bideltoid search window reached the abducted upper arms (+15 cm shoulder bias)
- [x] Model-based fit + measuring on the fitted mesh; stored on the scan (schema v3); runs in a worker
- [x] Robust (Huber) loss; side-profile shape observations; stable neck site definition
- [x] Refit for stored scans without a body (older scans, demo), display only
- [ ] **Validate on real people with a tape measure** (the most important open item; see §6)
- [x] In-app capture with a tilt/level guide (`CameraCapture`, `scan/level.ts`): live bubble level within ±2°,
      10 s self-timer, tilt recorded and warned about (>4°). Upload stays available. nginx now allows
      `camera=(self)`.
- [ ] Hair: the top of the mask is the top of the hair (1–3 cm → ~1% scale); not simulated in the benchmark

### 4.2 Results (`npm run scan:bench`, 30 bodies per sex per row, mean absolute error, cm)

| Condition                                                   | Chords (before) | Fitted body (now) |
| ----------------------------------------------------------- | --------------- | ----------------- |
| ideal: exact mask + landmarks, level camera                 | 3.90            | **1.51**          |
| camera: 2–3.2 m, 0.8–1.4 m high, tilted to aim at the body  | 5.08            | 2.54              |
| level phone: upright, 0.8–1.15 m high                       | 4.23            | **1.73**          |
| off-model: bodies with 2 cm bumps the model can't represent | 4.47            | 2.64              |
| segmenter: 256-px mask, ±1 px edge bias                     | 4.07            | 1.86              |
| landmarks: 4 px noise                                       | 3.74            | 1.56              |
| phone: all of the above                                     | 5.30            | **2.69**          |

Per site under "phone" (fit): neck 3.1, shoulders 4.9, chest 3.4, waist 2.0, hips 2.3, upper arm 2.7, forearm 1.4,
thigh 2.4, calf 1.9. The fit's biases there are all positive (+1–4.5 cm); the level-phone row shows that most of
that is camera tilt.

### 4.3 What the benchmark does and doesn't prove

- Test bodies come from the same model family the fit uses (an "inverse crime"), softened by off-model bumps.
  Real people are further from MakeHuman's shape space; expect real errors closer to the off-model row or worse.
- No clothing, hair, breathing or posture changes are simulated, and the MediaPipe models aren't in the loop —
  synthetic masks and landmarks are rendered directly. Real segmenter failures (skin vs background, clothing
  folds) are larger than ±1 px.
- MediaPipe landmark _biases_ (e.g. where it puts the hip point) aren't modelled.
- So: the benchmark is a strong guide to **relative** improvements and to which error sources matter. It is not
  a claim of real-world accuracy. The in-app copy says "typically ±2–4 cm with fitted clothing and a level
  phone".

### 4.4 Next steps (in order of value per effort)

1. **Real-world validation.** Scan 5–10 people, tape-measure each site twice, record here. If a site is
   biased consistently, correct it in `sites.ts` (definition) or as a calibration offset — not by tuning to one
   person.
2. **Use the recorded tilt.** Capture now records the phone's pitch. With the camera's focal length (not
   exposed by browsers; could be estimated from the photo's EXIF when uploaded), the fit could correct the
   keystone instead of just warning. Test on real iOS/Android devices: iOS asks for motion permission.
3. **Hair.** Detect hair at the top of the mask (category 1) and pull the head-top line down to an estimate
   from the face/ear landmarks when hair is thick.
4. **Fit the pose too.** The fit assumes the photo's arm angle from landmarks and a fixed leg stance; adding leg
   abduction and a torso lean as free parameters would help with sloppy poses.
5. **Optional extra views.** Two 45° photos would constrain cross-section shape directly (visual hull). The fit
   already makes this a matter of adding observations, but it adds friction to a forced onboarding step.

## 5. Phase 2 — realism

### 5.1 Status

- [x] Render the MakeHuman mesh in "precise" detail (renamed **Realistic** in Settings); procedural body remains
      as Standard and as the loading fallback
- [x] Shape: fitted scan coefficients, else profile prediction (FFMI → muscle slider; weight slider solved by
      volume × Siri density)
- [x] Muscles: existing footprints mapped onto the mesh (blended by skin weight) + MakeHuman's sculpted muscle
      targets, both driven by the level change since the anchor (scan date or profile start); body-fat change
      drives the fat sculpts
- [x] Look: skinned relaxed pose, 6 skin tones (`settings.skinTone`), fitted underwear, key/rim light rig,
      smoothed muscle colours, skin-only toggle (remembered per device)
- [ ] Muscle detail page: frame the camera on the selected muscle
- [ ] Optional normal-map detail (skin pores, muscle striation at high levels) — only if it stays cheap
- [ ] Decide whether the old scan-calibrated loft rig (`rig.ts` `scannedRig`/`calibrateRig`) is still worth
      keeping now that Standard mode doesn't use scans; it is only reached when the realistic body can't load

### 5.2 Gotchas

- `envMapIntensity` only scales a material's own `envMap`, not `scene.environment`. The PMREM room environment
  was also slow under software GL (e2e), so the realistic body uses `meshStandardMaterial` with lights only.
- The muscle map is computed once per sex on the mean body in rest pose; topology is shared by every shape.
- Footprint and sculpt displacement are **deltas** from the anchor, so a fresh scan looks exactly like the fit.
- The asset is ~1.4 MB per sex, fetched on first use and cached by the service worker (`body-model` cache).

## 6. Open questions for the owner

1. Is underwear the right default, or should there be an anatomy-only (no skin) style instead?
2. Should tape measurements reshape the body between scans? It would make the avatar track reality, but growth
   would then be shown twice (measured and simulated). A clean rule would be "re-anchor at each tape entry",
   which changes what the muscle colours mean.
3. Is a level-guided in-app camera acceptable as the _recommended_ capture path at onboarding?
