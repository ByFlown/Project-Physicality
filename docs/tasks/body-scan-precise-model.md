# Task: Photo body scans + precise muscle displacement

> Working file for continuing this task in Claude Code (VS Code). Read it top to bottom before touching code.
> It covers the goal, the decisions already made and why, what is done, what's left in order, and the gotchas.
> Tick the checkboxes as you go.

## 1. Goal (from the product owner)

> "Fully adapt the muscle displacement to be optionally way more precise, plus initially forced to be precise via
> body photo scans you upload."

In concrete terms:

1. **Forced scan at onboarding.** A new profile can't be finished without a body scan: a **front** and a **side**
   photo that the user uploads (or takes). The scan becomes the precise starting point for:
   - body proportions (model shape),
   - circumferences and body fat,
   - per-muscle starting levels (partly).
2. **Precise muscle displacement (optional detail mode).** A new setting, `settings.modelDetail`, takes
   `'standard' | 'precise'`. `precise` does three things:
   - builds the 3D body from the user's scanned proportions,
   - calibrates muscle bulges so the model reproduces the photo silhouette exactly at scan time,
   - adds more muscle heads and a denser mesh.

   `standard` is the current procedural model, and stays for low-end devices.

3. **Re-scan any time.** A `/scan` page lists and compares scans and starts new ones. Scans also feed the
   measurements and body-composition charts.

## 2. Design decisions (already made — keep unless there is a strong reason)

| Decision                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All vision runs in the browser, on-device.** MediaPipe Tasks Vision (`@mediapipe/tasks-vision` 1.0.1, installed), self-hosted under `/vision`, with models pinned by SHA-256.                                                                                                                                                | The app is local-first. Photos are the most sensitive data we'll ever handle, so they must never leave the device. The CSP only allows `'self'`.                                             |
| **Silhouette from `ImageSegmenter` + `selfie_multiclass_256x256` (CPU), landmarks from `PoseLandmarker` full (CPU, _no masks_).**                                                                                                                                                                                              | Verified in headless Chromium (see §4). The multiclass mask separates background / hair / body-skin / face-skin / **clothes** / accessories, so we can warn about loose clothing.            |
| **Side view relies on the mask, not landmarks.** Heights are mapped from the front view as fractions of body height (head top → floor).                                                                                                                                                                                        | Landmarks on profile photos are less reliable. The mask is enough for depths.                                                                                                                |
| **Every measurement is a _chord_ the user can correct.** A chord is a 2-point segment across a body part, drawn on the photo with draggable endpoints. Auto-detection pre-places the chords; if detection fails, the user places them from defaults (manual mode).                                                             | The scan is "forced", so it must be completable on any device — even when the model fails, the photo is odd, or the user is on an old phone. It also makes errors visible instead of silent. |
| **Store derived numbers only (`Scan` in `AppData.scans`).** Photos are optional, kept in a separate IndexedDB key (default: **not kept**), and never included in JSON export.                                                                                                                                                  | Privacy by default. It also stops multi-MB blobs from blowing up the localStorage write-ahead journal.                                                                                       |
| **Calibrate, don't replace.** In precise mode, the base loft rings come from the scan _minus the muscle bulge at scan-time levels_. Muscle bulges are then added on top. Result: model = photo silhouette at scan time, and it grows or shrinks from that anchor as levels change afterwards. Muscle definition stays visible. | If the scan were used directly as the skin, adding bulges would double-count muscle and lose definition.                                                                                     |
| **Scan-based per-muscle starting levels are _blended_ (50/50) with the experience/FFMI baseline, and only for muscles a circumference actually covers.**                                                                                                                                                                       | Circumference-to-muscle mapping is crude: fat vs muscle is ambiguous, and one girth covers several muscles. Be honest about that in the UI.                                                  |
| **Existing users without a scan aren't hard-blocked.** They get a dashboard banner, and precise mode falls back to the standard rig until a scan exists.                                                                                                                                                                       | Blocking people out of their own data would be hostile. "Forced" applies to onboarding.                                                                                                      |

## 3. Status

### Done (committed)

- [x] `@mediapipe/tasks-vision` added to dependencies.
- [x] `scripts/prepare-vision-assets.mjs`, run with `npm run vision:assets`:
  - copies the WASM runtime into `public/vision/`,
  - downloads the two pinned models and verifies their SHA-256,
  - takes `PHYSICALITY_POSE_MODEL` / `PHYSICALITY_SEGMENTER_MODEL` env overrides that point at local files.

  `public/vision` is gitignored.

- [x] **Data model v2** (`src/domain/schema.ts`):
  - `scanSchema` / `Scan`, `sectionSchema` / `Section`;
  - `AppData.scans`;
  - `settings.modelDetail` (default `'precise'`);
  - `measurement.source: 'tape' | 'scan'` and `measurement.scanId`;
  - `DATA_VERSION = 2`.
- [x] **Migration v1 → v2** in `src/store/persistence.ts` (`migrateV1toV2`), with a test in
      `src/store/persistence.test.ts`.
- [x] `src/domain/demo.ts` sets `scans: []`. A demo scan comes later — see step 10.
- [x] `src/scan/types.ts`:
  - `Pt`, `Landmark`, `Mask`, `CATEGORY`;
  - chord ids (`FRONT_CHORDS`, `SIDE_CHORDS`, `CHORD_LABELS`);
  - `ViewMarkup` (what the editor edits), `ProfileRow`, `ViewAnalysis`.
- [x] `tools/scan-lab/index.html`, a manual browser harness. Use it with `npm run dev`, then open
      `/tools/scan-lab/` and call `await pose(url)` or `await seg(url)`.

### Not started — do in this order

- [ ] 1. Asset pipeline wiring (§5.1)
- [ ] 2. `src/scan/geometry.ts` + unit tests with synthetic masks (§5.2)
- [ ] 3. `src/scan/detector.ts`, `src/scan/photo.ts`, `src/scan/photoStore.ts` (§5.3)
- [ ] 4. `src/scan/buildScan.ts`: markup → `Scan` (circumferences, body fat) + tests (§5.4)
- [ ] 5. `src/body3d/rig.ts` refactor: reference rig vs scanned rig + calibration + tests (§5.5)
- [ ] 6. `deform.ts`: signed bulges + precise-mode extra muscle parts and resolution (§5.6)
- [ ] 7. Scan-based starting levels in `assessment.ts` / engine + tests (§5.7)
- [ ] 8. UI: `ScanEditor`, `ScanWizard`, forced onboarding step, `/scan` page, settings toggle, dashboard banner,
      measurement integration (§5.8)
- [ ] 9. `bodystats.ts`: scans as a composition source (§5.9)
- [ ] 10. Demo scan (§5.10)
- [ ] 11. E2E updates + CSP/PWA verification (§5.11)
- [ ] 12. Docs: README, the "How it works" page, honest-limits copy (§5.12)

Keep `npm run check` green after each step. That's typecheck + `oxlint --deny-warnings` + vitest + build. Also run
`npm run format` before committing, since CI runs `format:check`.

## 4. Findings from the feasibility spike (don't re-learn these)

Tested in headless Chromium using `tools/scan-lab`, a CC0 real-person photo, and renders of our mannequin:

- **`PoseLandmarker` with `outputSegmentationMasks: true`:**
  - on the **CPU** delegate it **aborts** the WASM (`image_frame.cc:415 Check failed: 1 == ChannelSize() (1 vs. 4)`);
  - on the **GPU** delegate the masks read back **all zeros** under SwiftShader, and probably on some real GPUs too.

  → **Never request pose masks.** Use `ImageSegmenter` for the silhouette.

- **`PoseLandmarker` (full), CPU, landmarks only:** 33 landmarks with visibility ≈ 1 on a real front photo. Detect
  took about 0.3–1 s; init took about 0.4 s. Runs of the GPU delegate were ~5 s under SwiftShader.
- **`ImageSegmenter` + `selfie_multiclass_256x256`, CPU:** very clean full-body silhouette at the input resolution
  (1022×2167 in, same size out), in ~1.5 s. Categories: `0` background, `1` hair, `2` body skin, `3` face skin,
  `4` clothes, `5` accessories.
- **Our own 3D mannequin renders are not a usable test subject.** Front: landmarks yes, but only ~5% mask coverage.
  Side: no detection at all. Use real photos for manual validation. Unit tests use synthetic masks. E2E uses the
  manual-fallback path.
- **Downloads on first scan:** about 37 MB (pose 9.4 MB + segmenter 16.4 MB + WASM 11.7 MB). Serve them with a
  runtime cache (§5.1), not the precache.
- **Test photo for manual validation:** `File:Anterior view of human female and male, without labels.jpg` on
  Wikimedia Commons (CC0). It contains nudity, so **don't commit it**. Put it in `tools/scan-lab/`, which is
  gitignored for images. No suitable CC0 _side-view_ photo was found. Use your own photos locally.

## 5. Detailed specs for the remaining steps

### 5.1 Asset pipeline wiring

- `package.json`: add `"predev": "npm run vision:assets"` and `"prebuild": "npm run vision:assets"`.
  - CI and Docker need network access to `storage.googleapis.com`. Alternatively, cache `public/vision` in CI
    using the env overrides.
  - Also add `public/vision` to `.dockerignore` only if you prefer downloading inside the image. Otherwise leave
    it alone.
- `vite.config.ts` → `VitePWA.workbox`:
  - `globIgnores: ['**/vision/**']`, so the precache stays small;
  - `runtimeCaching: [{ urlPattern: /\/vision\//, handler: 'CacheFirst', options: { cacheName: 'vision-models', expiration: { maxEntries: 10 } } }]`.
- CSP in `deploy/nginx.conf`: add `'wasm-unsafe-eval'` to `script-src`.
  - Re-verify under the CSP. The earlier approach served `dist/` with the nginx CSP headers from a tiny Node
    server and checked for console CSP errors and a running scan.
  - Check whether MediaPipe injects its loader via `<script>` or a blob worker. If it uses a blob worker, add
    `worker-src 'self' blob:` (already present).

### 5.2 `src/scan/geometry.ts` (pure, no DOM, unit-tested)

**Coordinates.** Image pixels, with y pointing down.

- `pxPerCm = (floor - top) / heightCm`, computed per view.
- `cmFromFloor(y) = (floor - y) / pxPerCm`.

**Mask helpers.**

- `personBounds(mask)`: top row, bottom row, and column range of pixels whose category is not background.
- `runAt(mask, row, x)`: the `[left, right]` of the contiguous non-background run that contains `x`. If `x` hits
  background, use the nearest run within a tolerance.
- `longestRun(mask, row)`: the widest run in that row.
- `march(mask, from, dir, maxLen)`: distance until the first background pixel.

**`analyzeFront(mask | null, landmarks | null, w, h): ViewAnalysis`.**

Landmark indices (MediaPipe): 0 nose, 9/10 mouth, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips,
25/26 knees, 27/28 ankles.

Define `torsoLen = hipY - shoulderY`, with both taken as the average of the left/right landmark rows.

Chord placement:

| Chord     | Rule                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| neck      | Row `mouthY + 0.6·(shoulderY - mouthY)`. Take the run containing `noseX`, capped at 0.1·H px.                                                                                                            |
| shoulders | Search rows `[shoulderY - 0.08·torsoLen, shoulderY + 0.12·torsoLen]` for the widest run containing the centre line. That width is the bideltoid breadth.                                                 |
| chest     | Row `shoulderY + 0.30·torsoLen`. Take the run containing the centre line.                                                                                                                                |
| waist     | Male: row `shoulderY + 0.72·torsoLen` (navel). Female: the narrowest run in `[0.55, 0.85]·torsoLen`. Both follow the Navy protocol.                                                                      |
| hips      | The widest run in `[0.85, 1.25]·torsoLen`.                                                                                                                                                               |
| upperArm  | At 0.5 along shoulder→elbow, perpendicular to the arm axis: `n = (-d.y, d.x)`. March both ways, capped at 0.09·H px each side. If the cap is hit, the arm touches the torso: warn and use `2·min(side)`. |
| forearm   | At 0.3 along elbow→wrist, same method as upperArm.                                                                                                                                                       |
| thigh     | At 0.3 along hip→knee, perpendicular. The inner side may touch the other leg: same capping + warning.                                                                                                    |
| calf      | The widest perpendicular chord in `[0.15, 0.5]` along knee→ankle.                                                                                                                                        |

For each bilateral chord, compute both sides and keep the one with fewer warnings. Break ties with the image-left
side.

Other front outputs:

- **Crotch:** scan upward from knee level. The first row where the centre column is non-background is the crotch.
- **Armpit:** walk down from the shoulder row. It's the first row where the centre run's width drops by more than
  15% compared with the previous 3-row average. Fallback: `shoulderY + 0.17·torsoLen`.
- **Dense torso profile:** 40 rows evenly spaced from crotch to armpit, each `{y, left, right}` of the centre run.
- **Warnings** (plain English, user-facing):
  - no person found;
  - person smaller than 60% of image height;
  - arms touching torso;
  - legs together;
  - clothes (category 4) cover more than 30% of torso pixels, i.e. loose clothing;
  - feet cut off (person bottom within 1% of the image edge);
  - head cut off.

**`analyzeSide(mask | null, landmarks | null, w, h, fractions)`.**

- `fractions` gives each chord's height as a fraction of H, taken from the front markup.
- Chords are horizontal: the **longest run** at that row. Arms hang over the torso, and both legs overlap, which is
  fine.
- `hips` depth: the maximum within ±0.04·H of its fraction.
- `calf` depth: the maximum in `[0.15, 0.30]·H`.
- `facingRight`: compare the face-skin (category 3) centroid x with the body centroid x in the head rows, or nose x
  against ear x. Fall back to `true`. The user can flip it in the editor.
- Body axis (for the model's torso z offsets): the midpoint of the hips chord. For each profile row, `front`/`back`
  are the distances from the run edges to that axis, oriented by `facingRight`.

**`defaultMarkup(view, w, h)`** (manual mode, no mask or detection):

- Assume the person is centred and fills 90% of the image height.
- Place chords at anthropometric fractions of H, measured from the floor (Drillis & Contini):

  | Point           | Fraction of H |
  | --------------- | ------------- |
  | shoulder joint  | 0.818         |
  | neck            | 0.85          |
  | armpit          | 0.75          |
  | chest           | 0.72          |
  | elbow           | 0.63          |
  | navel / waist   | 0.60          |
  | hip joint       | 0.53          |
  | buttocks / hips | 0.50          |
  | wrist           | 0.485         |
  | crotch          | 0.47          |
  | thigh           | 0.42          |
  | knee            | 0.285         |
  | calf            | 0.20          |
  | ankle           | 0.039         |

- Default widths, as fractions of H:

  | Chord     | Width |
  | --------- | ----- |
  | neck      | 0.07  |
  | shoulders | 0.26  |
  | chest     | 0.19  |
  | waist     | 0.165 |
  | hips      | 0.19  |
  | upperArm  | 0.055 |
  | forearm   | 0.045 |
  | thigh     | 0.09  |
  | calf      | 0.06  |

- Side-view depths use roughly 0.7× those widths.

**`applyChordCorrections(profile, detected, edited)`.** When the user drags the chest, waist or hips chords, rescale
the dense profile with a piecewise-linear ratio between the chord heights, equal to `editedWidth / detectedWidth`.
With no mask, the profile is just an interpolation of the chords.

**Tests** (`geometry.test.ts`): draw synthetic masks as `Uint8Array`s:

- a rectangle torso with an ellipse head;
- limbs drawn as rotated rectangles;
- a known pixel scale.

Assert:

- chord widths come out within ±1 px;
- arms touching the torso trigger the warning;
- side-view facing is detected;
- the manual defaults are sane;
- chord corrections rescale the profile correctly.

### 5.3 Detector, photos, photo store

**`src/scan/detector.ts`.**

- Lazy `import('@mediapipe/tasks-vision')`, so it lands in its own chunk.
- A singleton `getVision()` that creates both tasks with `delegate: 'CPU'` and `runningMode: 'IMAGE'`:
  - `PoseLandmarker`: `/vision/pose_landmarker_full.task`, `numPoses: 1`, **no masks**;
  - `ImageSegmenter`: `/vision/selfie_multiclass_256x256.tflite`, `outputCategoryMask: true`,
    `outputConfidenceMasks: false`.
- `detect(image: ImageBitmap | HTMLCanvasElement): Promise<{ landmarks: Landmark[] | null; mask: Mask | null; error?: string }>`.
  - **Copy** the mask with `new Uint8Array(m.getAsUint8Array())` _inside_ the callback. Masks are only valid during
    the callback.
  - Never throw. Return an `error` so the UI can switch to manual mode. Wrap it in a 30 s timeout.
- Report load progress for the ~37 MB first download: fetch the model with a progress reader, then use
  `modelAssetBuffer`.

**`src/scan/photo.ts`.**

- `loadPhoto(file)`: `createImageBitmap(file, { imageOrientation: 'from-image' })` so EXIF rotation is honoured.
- Downscale to at most 1280 px tall on a canvas. Use that canvas for detection and for display.
- `toJpegBlob(canvas, 0.85)` for optional storage.
- Reject non-images and anything over 25 MB, with friendly errors.

**`src/scan/photoStore.ts`.**

- A separate idb-keyval store, `createStore('project-physicality', 'photos')`.
  - **Beware:** `createStore` with a second store name in the same database needs a DB version bump. idb-keyval
    creates exactly one object store per database. The simplest fix is a separate DB name:
    `createStore('project-physicality-photos', 'kv')`.
- Keys are `${scanId}:front`, `${scanId}:side`, `${scanId}:back`.
- Provide `put`, `get`, `delete(scanId)`, and `clearAll`, and call `clearAll` from `resetAll` in `store.ts`.
- Photos are **never** part of `serializeExport`.

### 5.4 `src/scan/buildScan.ts`: markup → `Scan`

**Circumferences.** Take `w` from the front chord and `d` from the side chord, both in cm.

- Ellipse perimeter (Ramanujan II): `π(a+b)(1 + 3h/(10 + √(4 − 3h)))`, where `h = ((a−b)/(a+b))²`, `a = w/2`,
  `b = d/2`.
- Real cross-sections sit between an ellipse and a rectangle, so blend them:
  `P = k·ellipse + (1−k)·2(w+d)`.

| Site               | w source  | d source            | k    |
| ------------------ | --------- | ------------------- | ---- |
| neck               | neck      | neck (side)         | 1.0  |
| shoulders          | shoulders | chest (side) × 1.05 | 0.75 |
| chest              | chest     | chest               | 0.72 |
| waist              | waist     | waist               | 0.92 |
| hips               | hips      | hips                | 0.85 |
| upperArm (relaxed) | upperArm  | `w × 0.97`          | 1.0  |
| forearm            | forearm   | `w × 0.85`          | 1.0  |
| thigh              | thigh     | thigh (side)        | 1.0  |
| calf               | calf      | calf (side)         | 1.0  |

The k-factors are starting guesses (±3–5 cm). Tune them against a tape measure on real people and document the
results.

**Other outputs.**

- `bodyFatPct` = `navyBodyFat(sex, heightCm, { neck, waist, hips })`, which already exists in `bodycomp.ts`.
- `joints` come from the landmarks, converted to cm from the floor.
  - Without landmarks, use the §5.2 fractions and these defaults:
    - `shoulderHalf` 0.108·H;
    - `hipHalf` 0.051·H;
    - `armAngle` 0.26;
    - `upperArmLength` 0.167·H;
    - `forearmLength` 0.144·H.
- `torso` is the corrected profile in cm: `{ y, half, front, back }`.
- `quality`: start at 1.
  - Subtract 0.25 without landmarks, 0.3 without a mask, 0.1 per contact warning, 0.2 for loose clothing, and 0.15
    when the person is small in frame.
  - Clamp to [0, 1].
- `method`: `auto` with no edits, `adjusted` with edits, `manual` when there was no detection.
- **Output must pass `scanSchema.safeParse`.**
- **Tests:** ellipse math against known values, a synthetic end-to-end run from `ViewMarkup`s to a `Scan`, and the
  Navy body-fat result.

### 5.5 `src/body3d/rig.ts`: reference vs scanned rig + calibration

Today, `BodyScene.tsx` uses the constants in `JOINTS` and the ring functions in `anatomy.ts` in _reference units_
(a 1.8 m body), then scales the whole group by `shape.scale`. Refactor it so everything is driven by a `BodyRig` in
**metres, at real size**:

```ts
interface BodyRig {
  shoulder: Vec3; armAngle: number; upperArmLength: number; forearmLength: number; forearmBend: number;
  hip: Vec3; legAngle: number; thighLength: number; shinLength: number;
  head: { center: Vec3; radii: Vec3 };
  rings: Record<SegmentId, Ring[]>;          // torso in world y; limbs along local −y
  torsoY: (refY: number) => number;          // maps reference torso heights (muscle footprints) to this body
  segmentScale: Record<SegmentId, { length: number; girth: number }>; // for footprint width/height
  absDefinition: number;
  calibrated: boolean;
}
referenceRig(shape: ShapeFactors): BodyRig   // today's behaviour, scaled to height (group scale becomes 1)
scannedRig(scan: Scan, shape: ShapeFactors): BodyRig
placeParts(segment: SegmentId, rig: BodyRig, detail: 'standard' | 'precise'): MusclePart[]
calibrateRig(rig: BodyRig, looksAtScan: Record<MuscleId, MuscleLook>): BodyRig
```

**`scannedRig`.**

- **Torso rings:**
  - one ring per scan torso row (`perSpan = 1`, since the rows are already dense), with `w = half`,
    `d = (front + back)/2`, `z = (front − back)/2`;
  - below the crotch, taper to a cap;
  - **above the armpit**, the scan width includes the arms and deltoids, so use the reference upper-torso rings
    scaled to the scanned shoulder chord and chest depth;
  - convert everything cm → m.
- **Limb rings:** use the reference ring shapes, scaled so the ring at the measurement position equals the scanned
  section (`w`, `d`).
- **Joints:** from `scan.joints`.
- **`torsoY`:** piecewise-linear through these anchors, reference → scanned:
  - crotch 0.78 → `crotchY`;
  - hip 0.90 → `hipY`;
  - waist 1.06 → waist chord height;
  - chest 1.30 → chest chord height;
  - shoulder 1.435 → `shoulderY`;
  - neck 1.54 → `neckY`.

**`calibrateRig`.**

- For every sampled ring, compute the muscle displacement at angles 0 (front), +π/2, −π/2 and π (back), using the
  **scan-date** levels. Refactor `deform.ts` to export `prepareParts()` + `displacementAt(y, angle, r, prepared)`,
  so this reuses the exact same maths as rendering.
- Then solve for the ring:
  - `w' = w − (disp(π/2) + disp(−π/2))/2`;
  - `d' = (F − B − disp0 − dispπ)/2` and `z' = (F + B − disp0 + dispπ)/2`, where `F = z + d` (front extent) and
    `B = z − d` (back extent, negative).
- Scan-date levels come from the simulation timeline (`sim.timeline.muscleXp[id][index of scan.date]`). Don't store
  a snapshot: it would go stale when the profile or baseline is edited.

**Tests** (`rig.test.ts`):

- `referenceRig` reproduces today's numbers at 1.8 m.
- After calibration, deformed silhouette extents at the four angles match the scan within 2 mm.
- `torsoY` is monotonic.

### 5.6 Deform + precise detail

- **Signed bulges.** In precise mode, bulge deltas relative to scan time can be negative. Accumulate positive and
  negative contributions separately: `disp = posMax + 0.3·(posSum − posMax) − (negMax + 0.3·(negSum − negMax))`.
  Colour dominance stays by coverage.
- **Extra muscle parts in precise mode:**
  - pec abdominal head;
  - biceps long/short heads;
  - triceps medial head;
  - traps lower fibres;
  - lats upper/lower;
  - serratus (map to `obliques`);
  - glute medius separate;
  - quads with a separate vastus intermedius bulge;
  - soleus separate.

  Mark them with `detail: 'precise'` in `MUSCLE_PARTS` and filter by the setting.

- **Resolution:**
  - `standard`: torso 56×6, limbs 32×6;
  - `precise`: torso 96×14, limbs 64×12 (radial × perSpan).

  Measure the rebuild time with a hover, which recomputes the deformation. Keep it under ~8 ms, or split colour
  updates from position updates.

- `BodyPanel` / `BodyViewer` get `detail` from `useSettings().modelDetail`, the scan from
  `useData().scans.at(-1)`, and the scan-date levels from the simulation.

### 5.7 Scan-based starting levels

Add `scanLevels(scan, sex, heightCm, bodyFatPct): Partial<Record<MuscleId, number>>` in `src/domain/assessment.ts`.

1. **Normalise:**
   - `c' = c · 180 / heightCm`;
   - fat-adjust with `lean = c' · (1 − f·(bf − 15)/100)`, where `f` is arm 0.9, forearm 0.5, chest 0.7, thigh 0.9,
     calf 0.5, neck 0.5.
   - For female profiles, scale the reference table below by arms 0.87, chest 0.9, legs 0.95, neck 0.88. These are
     starting guesses; document them.
2. **Map to a level** by linear interpolation between L1 and L24, clamped to [1, 35]. Male reference, 180 cm, lean:

   | Site                                | L1  | L24 | Muscles                      |
   | ----------------------------------- | --- | --- | ---------------------------- |
   | upperArm (relaxed)                  | 29  | 41  | biceps, triceps              |
   | forearm                             | 25  | 32  | forearms                     |
   | chest                               | 92  | 118 | chest (+0.5 weight lats)     |
   | shoulders (bideltoid **width**, cm) | 43  | 54  | side/front/rear delts        |
   | thigh                               | 52  | 66  | quads, hamstrings, adductors |
   | calf                                | 35  | 42  | calves                       |
   | neck                                | 36  | 44  | traps                        |

3. **Blend:** in `computeBaseline(profile, scan?)`, muscles covered by the scan get `0.5·baseline + 0.5·scanLevel`,
   after self-ratings are applied.
   - `computeBaseline` is called from `engine.simulate` with `data.profile`. Pass the **first** scan (the onboarding
     one) so later scans don't rewrite history.
   - Show the per-region deltas on the onboarding review step ("from your scan: arms +2, calves −1").
4. **Tests:** monotonicity, female scaling, clamping, and a blend that only touches covered muscles.

### 5.8 UI

- **`src/features/scan/ScanEditor.tsx`:**
  - an SVG whose `viewBox` is the image size, with an `<image>` inside;
  - chords are lines with two handles each: r ≈ 1.2% of image height, `touch-action: none`, pointer capture;
  - convert client coordinates to SVG coordinates with `getScreenCTM().inverse()`;
  - the top and floor lines are horizontal and drag vertically only;
  - labels show the live length in cm or in, via `lib/units`;
  - keyboard support: handles are `tabIndex=0`, arrow keys move 1 px, Shift+arrow moves 10 px;
  - a facing toggle for the side view;
  - chords with warnings are highlighted.
- **`src/features/scan/ScanWizard.tsx`**, used by both onboarding and `/scan`. Steps:
  1. **Instructions.** Fitted clothing or underwear. Plain background. Whole body in frame, head to feet. Camera at
     hip height, 2–3 m away, phone upright. Front photo with arms 30–45° away from the body and feet hip-width
     apart. Side photo facing sideways with arms relaxed.
  2. **Upload front.** `<input type=file accept="image/*" capture="environment">`.
  3. **Upload side.**
  4. **Analyse**, with progress for the model download.
  5. **Review/adjust** the front view.
  6. **Review/adjust** the side view.
  7. **Results.** Circumferences, body fat, quality score and warnings, plus a "Keep photos on this device"
     checkbox, default **off**.

  The wizard returns a `Scan` (plus the photo blobs if kept).

- **Onboarding** (`src/features/onboarding/Onboarding.tsx`):
  - steps become Basics → Experience → **Scan (required)** → Body (optional tape, prefilled from the scan) →
    Muscles → Review;
  - `canContinue` on the Scan step requires a valid `Scan` with `quality ≥ 0.3`, or the user explicitly confirms
    manual chords;
  - on finish: save the profile, save the scan (`saveScan`), and save a `Measurement` with `source: 'scan'`,
    `scanId`, the circumferences and the body fat;
  - "Explore with demo data" still skips the scan.
- **Store** (`src/store/store.ts`):
  - `saveScan(scan, measurement)` adds the scan and its measurement in one commit;
  - `deleteScan(id)` removes the scan, its measurement and its photos.
- **`/scan` page** (`src/features/scan/ScanPage.tsx`, lazy route + nav item):
  - lists scans (date, method, quality, key circumferences) with a "New scan" button that opens the wizard;
  - compares the latest scan with the first (deltas per circumference);
  - shows photos side by side when they were kept;
  - lets the user delete a scan, with a confirm.
- **Settings:** a "Model detail" segmented control (Standard / Precise) with the hint "Precise uses your latest scan
  and more muscle heads; Standard is lighter for older devices."
- **Dashboard:** when `modelDetail === 'precise'` and there are no scans, show a banner: "Scan your body to unlock
  the precise model" → `/scan`. Under the 3D panel, show "Calibrated to scan from {date}".
- **Measurements page:** show a "scan" badge on scan-sourced entries. Tape values stay separate and editable.

### 5.9 `bodystats.ts`

- Treat `source: 'scan'` measurements like tape ones for composition.
- If a tape measurement and a scan measurement share a date, prefer the tape values per site.
- Keep `bodyFatSource` accurate: add `'scan'` to `BodyFatSource` in `assessment.ts`, and handle it in the UI text.

### 5.10 Demo scan

Generate one with `buildDemoScan(profile)`, derived from `referenceRig` geometry. Use the reference torso rings as
the profile, so the precise path runs in demo mode. Call it from `buildDemoData`, dated on the start date. Mark it
`method: 'manual'`, `quality: 1`, with the warning "Demo scan — synthetic".

### 5.11 E2E + verification

- `e2e/app.spec.ts` → `onboard()`: at the Scan step, upload two plain generated PNGs.
  - Generate them with `page.evaluate` → canvas → blob, or commit two tiny solid-colour PNG fixtures.
  - Detection finds no person, so the wizard switches to manual mode. Accept the default chords and continue.
  - Assert the dashboard loads, "Calibrated to scan" is visible, and `/scan` lists 1 scan.
- Add a test that the Settings toggle between Standard and Precise re-renders without errors.
- A **manual** check with a real front photo and your own side photo in `tools/scan-lab` and in the real wizard:
  do the circumferences match a tape measure within about ±4 cm? Record the results in this file.
- Rebuild and serve under the nginx CSP (see §5.1): no CSP violations, and the scan works offline after the first
  load, thanks to the runtime cache.
- The Playwright config needs `PLAYWRIGHT_CHROMIUM_PATH` if the bundled Chromium doesn't match. See the README.

### 5.12 Docs

- README: add "Body scans" to features and privacy. Explain the model download size, the on-device processing, and
  that photos are not kept by default.
- `src/features/HowItWorks.tsx`: add a "Body scans & the precise model" section, plus honest limits: photo
  circumferences are about ±3–5 cm, clothing and posture matter, circumference can't separate fat from muscle, and
  per-muscle levels from girths are rough.

## 6. Open questions (decide or ask the owner)

1. **Keep photos by default?** Currently **off**, for privacy. Keeping them enables progress-photo comparison.
2. **Require a back photo too?** It's not needed for measurements and would only serve progress photos. Suggest it
   as optional.
3. **Should new scans move levels?** For example, a verified girth increase → an XP bonus. It's not in scope. The
   risk: fat gain gets rewarded as "growth" unless we cross-check the waist and body fat.
4. **Hard-block existing users?** No, per the decision table. Revisit if the owner insists.

## 7. Map of relevant existing code

| File                                     | Role                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `src/domain/schema.ts`                   | Zod data model (v2 now includes `Scan`)                             |
| `src/store/persistence.ts`               | IndexedDB + write-ahead journal + migrations                        |
| `src/store/store.ts`                     | Zustand actions (add `saveScan`/`deleteScan`)                       |
| `src/domain/assessment.ts`               | Onboarding baseline (add scan levels)                               |
| `src/domain/engine.ts`                   | Deterministic day-by-day replay (timeline gives scan-date XP)       |
| `src/domain/bodycomp.ts`                 | Navy body fat, FFMI                                                 |
| `src/body3d/anatomy.ts`                  | Reference rings + `MUSCLE_PARTS` (surface-coordinate footprints)    |
| `src/body3d/geometry.ts`                 | `buildLoft` — elliptical lofts with per-vertex (y, angle, r) params |
| `src/body3d/deform.ts`                   | Bulge displacement + vertex colours + muscle ownership for picking  |
| `src/body3d/BodyScene.tsx`               | Scene graph (shoulder/hip groups, mirrored limbs)                   |
| `src/body3d/visuals.ts`                  | Level → colour/bulge per muscle                                     |
| `src/features/onboarding/Onboarding.tsx` | Wizard to extend with the scan step                                 |
| `tools/scan-lab/index.html`              | Manual MediaPipe harness                                            |
| `scripts/prepare-vision-assets.mjs`      | Model/WASM fetch + checksum                                         |
