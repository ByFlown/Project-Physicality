import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  FlipHorizontal,
  ImagePlus,
  Lock,
  ScanLine,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, ProgressBar } from '../../components/ui';
import type { LocalDate } from '../../domain/dates';
import { MEASURE_LABELS, type MeasureSite, type Scan, type Sex } from '../../domain/schema';
import { cx } from '../../lib/cx';
import { uid } from '../../lib/id';
import { formatLength, round, type UnitSystem } from '../../lib/units';
import { buildScan, type BuildScanInput } from '../../scan/buildScan';
import { refineScan } from '../../scan/fitClient';
import { FIT_WARNING } from '../../scan/refine';
import { detectPerson } from '../../scan/detector';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from '../../scan/geometry';
import { loadPhoto, releasePhoto, type LoadedPhoto } from '../../scan/photo';
import type { ViewAnalysis } from '../../scan/types';
import { ScanEditor } from './ScanEditor';

export interface ScanResult {
  scan: Scan;
  photos: { front: Blob; side: Blob } | null;
}

type Step = 'intro' | 'photos' | 'analyzing' | 'front' | 'side' | 'result';

const TIPS: { icon: ReactNode; text: string }[] = [
  { icon: <Check size={16} />, text: 'Fitted clothing or underwear — loose clothes inflate every measurement.' },
  { icon: <Check size={16} />, text: 'Plain background, good light, whole body in frame from head to feet.' },
  { icon: <Check size={16} />, text: 'Phone upright at hip height, 2–3 m away (a timer or a helper works best).' },
  {
    icon: <Check size={16} />,
    text: 'Front photo: face the camera, arms 30–45° away from your body, feet hip-width apart.',
  },
  { icon: <Check size={16} />, text: 'Side photo: turn 90°, arms relaxed at your sides, stand tall.' },
];

function PhotoSlot({
  label,
  hint,
  photo,
  onFile,
}: {
  label: string;
  hint: string;
  photo: LoadedPhoto | null;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className={cx(
        'relative flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-3 text-center transition',
        photo ? 'border-accent' : 'border-border hover:border-muted',
      )}
    >
      {photo ? (
        <img src={photo.url} alt={`${label} photo`} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <>
          <ImagePlus size={28} className="text-muted" />
          <span className="font-semibold">{label}</span>
          <span className="text-xs text-muted">{hint}</span>
        </>
      )}
      {photo && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          {label} · tap to replace
        </span>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={`${label} photo`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </button>
  );
}

export function ScanWizard({
  sex,
  heightCm,
  units,
  date,
  onComplete,
  onCancel,
}: {
  sex: Sex;
  heightCm: number;
  units: UnitSystem;
  date: LocalDate;
  onComplete: (result: ScanResult) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>('intro');
  const [front, setFront] = useState<LoadedPhoto | null>(null);
  const [side, setSide] = useState<LoadedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ value: number; label: string }>({ value: 0, label: '' });
  const [detectError, setDetectError] = useState<string | null>(null);
  const [frontA, setFrontA] = useState<ViewAnalysis | null>(null);
  const [sideA, setSideA] = useState<ViewAnalysis | null>(null);
  const [keepPhotos, setKeepPhotos] = useState(false);
  const [manualOk, setManualOk] = useState(false);

  // Release object URLs when photos are replaced or the wizard unmounts.
  const photos = useRef<LoadedPhoto[]>([]);
  useEffect(() => () => photos.current.forEach(releasePhoto), []);

  const take = async (f: File, set: (p: LoadedPhoto) => void) => {
    setError(null);
    try {
      const p = await loadPhoto(f);
      photos.current.push(p);
      set(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const analyse = async () => {
    if (!front || !side) return;
    setStep('analyzing');
    setDetectError(null);
    const onProgress = (value: number, label: string) => setProgress({ value, label });
    const f = await detectPerson(front.canvas, onProgress);
    const s = f.error ? f : await detectPerson(side.canvas, onProgress);
    if (f.error) setDetectError(f.error);
    const fa = analyzeFront(f.mask, f.landmarks, front.width, front.height, sex);
    const sa = analyzeSide(s.mask, s.landmarks, side.width, side.height, sideLevelsFromFront(fa));
    setFrontA(fa);
    setSideA(sa);
    setStep('front');
  };

  const [scanId] = useState(uid);
  const built = useMemo(() => {
    if (!frontA || !sideA || step !== 'result') return { scan: null, input: null, error: null };
    const input: BuildScanInput = { id: scanId, date, heightCm, sex, front: frontA, side: sideA, photosKept: false };
    try {
      return { scan: buildScan(input), input, error: null };
    } catch (e) {
      return { scan: null, input: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [frontA, sideA, step, scanId, date, heightCm, sex]);

  // Fit the 3D body to the measurements (in a worker); keep the chord scan if that fails.
  const [fitted, setFitted] = useState<{ from: Scan; scan: Scan | null; error?: string } | null>(null);
  useEffect(() => {
    const { scan: chordScan, input } = built;
    if (!chordScan || !input) return;
    let live = true;
    refineScan(chordScan, input).then(
      (scan) => live && setFitted({ from: chordScan, scan }),
      (err: unknown) => live && setFitted({ from: chordScan, scan: null, error: String(err) }),
    );
    return () => {
      live = false;
    };
  }, [built]);
  const fitDone = !!built.scan && fitted?.from === built.scan;
  const scan = fitDone ? (fitted.scan ?? built.scan) : null;
  const manual = !!scan && scan.method === 'manual';

  const header = (title: string, sub?: string) => (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <ScanLine size={20} className="text-accent" /> {title}
      </h2>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );

  const nav = (back: (() => void) | undefined, next: ReactNode) => (
    <div className="mt-5 flex items-center justify-between gap-2">
      {back ? (
        <Button variant="ghost" onClick={back}>
          <ArrowLeft size={16} /> Back
        </Button>
      ) : (
        <span />
      )}
      {next}
    </div>
  );

  const warnings = (a: ViewAnalysis) =>
    a.warnings.length > 0 && (
      <ul className="mb-3 flex flex-col gap-1 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
        {a.warnings.map((w) => (
          <li key={w} className="flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /> {w}
          </li>
        ))}
      </ul>
    );

  if (step === 'intro') {
    return (
      <div>
        {header('Body scan', 'Two photos turn into precise measurements and a 3D model shaped like you.')}
        <ul className="flex flex-col gap-2 text-sm">
          {TIPS.map((t) => (
            <li key={t.text} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-good">{t.icon}</span>
              {t.text}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <Lock size={16} className="shrink-0" />
          Photos are analysed on this device and never uploaded. Only the measurements are saved unless you choose to
          keep the photos locally.
        </p>
        {nav(
          onCancel,
          <Button onClick={() => setStep('photos')}>
            <Camera size={16} /> Add photos
          </Button>,
        )}
      </div>
    );
  }

  if (step === 'photos') {
    return (
      <div>
        {header('Add your photos', 'Take them now or pick them from your gallery.')}
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot
            label="Front"
            hint="Facing the camera, arms away from the body"
            photo={front}
            onFile={(f) => take(f, setFront)}
          />
          <PhotoSlot label="Side" hint="Turned 90°, arms relaxed" photo={side} onFile={(f) => take(f, setSide)} />
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        {nav(
          () => setStep('intro'),
          <Button onClick={analyse} disabled={!front || !side}>
            Analyse <ArrowRight size={16} />
          </Button>,
        )}
      </div>
    );
  }

  if (step === 'analyzing') {
    return (
      <div className="py-10 text-center" aria-live="polite">
        <ScanLine size={36} className="mx-auto mb-4 animate-pulse text-accent" />
        <p className="font-semibold">{progress.label || 'Preparing…'}</p>
        <ProgressBar value={progress.value} className="mx-auto mt-4 max-w-sm" label="Scan progress" />
        <p className="mt-3 text-xs text-muted">Everything runs on your device. The first scan downloads ~37 MB once.</p>
      </div>
    );
  }

  if (step === 'front' && frontA && front) {
    return (
      <div>
        {header(
          'Check the front measurements',
          'Drag the dots so each line spans the body part edge to edge, and the blue lines touch the top of your head and the floor.',
        )}
        {detectError && (
          <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            Automatic detection is unavailable ({detectError}). Place the lines by hand — it takes about a minute.
          </p>
        )}
        {warnings(frontA)}
        <ScanEditor
          photoUrl={front.url}
          markup={frontA.markup}
          onChange={(markup) => setFrontA({ ...frontA, markup })}
          heightCm={heightCm}
          units={units}
        />
        {nav(
          () => setStep('photos'),
          <Button onClick={() => setStep('side')}>
            Next <ArrowRight size={16} />
          </Button>,
        )}
      </div>
    );
  }

  if (step === 'side' && sideA && side) {
    return (
      <div>
        {header('Check the side measurements', 'Each line should span front to back at the labelled height.')}
        {warnings(sideA)}
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">Facing: {sideA.markup.facingRight ? 'right →' : '← left'}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSideA({ ...sideA, markup: { ...sideA.markup, facingRight: !sideA.markup.facingRight } })}
          >
            <FlipHorizontal size={14} /> Flip facing
          </Button>
        </div>
        <ScanEditor
          photoUrl={side.url}
          markup={sideA.markup}
          onChange={(markup) => setSideA({ ...sideA, markup })}
          heightCm={heightCm}
          units={units}
        />
        {nav(
          () => setStep('front'),
          <Button onClick={() => setStep('result')}>
            Review results <ArrowRight size={16} />
          </Button>,
        )}
      </div>
    );
  }

  if (step === 'result' && built.scan && !fitDone) {
    return (
      <div className="py-10 text-center" aria-live="polite">
        <ScanLine size={36} className="mx-auto mb-4 animate-pulse text-accent" />
        <p className="font-semibold">Fitting a 3D body to your photos…</p>
        <p className="mt-3 text-xs text-muted">This takes a few seconds and runs on your device.</p>
      </div>
    );
  }

  if (step === 'result' && scan && front && side) {
    const sites = Object.entries(scan.circumferences) as [MeasureSite, number][];
    const q = Math.round(scan.quality * 100);
    const onModel = !!scan.body && !scan.warnings.includes(FIT_WARNING);
    return (
      <div>
        {header(
          'Your scan',
          onModel
            ? 'Circumferences measured on a 3D body fitted to your photos.'
            : 'Circumferences estimated from your photos.',
        )}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="min-w-40 flex-1">
            <div className="flex justify-between text-sm">
              <span>Scan confidence</span>
              <span className="num font-semibold">{q}%</span>
            </div>
            <ProgressBar
              value={scan.quality}
              color={q >= 70 ? 'var(--good)' : q >= 40 ? 'var(--warn)' : 'var(--bad)'}
              className="mt-1"
              label="Scan confidence"
            />
          </div>
          {scan.bodyFatPct !== undefined && (
            <div className="text-sm">
              Body fat (Navy): <span className="num font-semibold">{round(scan.bodyFatPct, 1)}%</span>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          {sites.map(([site, v]) => (
            <div key={site} className="flex justify-between gap-2">
              <dt className="text-muted">{MEASURE_LABELS[site].replace(' (flexed)', ' (relaxed)')}</dt>
              <dd className="num font-semibold">{formatLength(v, units)}</dd>
            </div>
          ))}
        </dl>
        {scan.warnings.some((w) => w.includes('implausible')) && (
          <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            {scan.warnings
              .filter((w) => w.includes('implausible'))
              .map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /> {w}
                </li>
              ))}
          </ul>
        )}
        {fitted?.error && <p className="mt-3 text-xs text-muted">3D body fitting was unavailable ({fitted.error}).</p>}
        {scan.warnings.includes(FIT_WARNING) && (
          <p className="mt-3 flex gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /> {FIT_WARNING}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          {onModel ? `The fitted body matches your outline within ±${round(scan.body!.rmsCm, 1)} cm on average. ` : ''}
          With fitted clothing and a level phone, photo measurements are typically within ±2–4 cm of a tape measure. For
          the best tracking, add tape measurements now and then.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Checkbox
            checked={keepPhotos}
            onChange={setKeepPhotos}
            label="Keep these photos on this device for progress comparison"
          />
          {manual && (
            <Checkbox
              checked={manualOk}
              onChange={setManualOk}
              label="I placed the lines on my photos myself and they match my body"
            />
          )}
        </div>
        {nav(
          () => setStep('side'),
          <Button
            disabled={manual && !manualOk}
            onClick={() =>
              onComplete({
                scan: { ...scan, photosKept: keepPhotos },
                photos: keepPhotos ? { front: front.blob, side: side.blob } : null,
              })
            }
          >
            <Check size={16} /> Use this scan
          </Button>,
        )}
      </div>
    );
  }

  if (step === 'result' && built.error) {
    return (
      <div>
        {header('Something does not add up')}
        <p className="text-sm text-muted">
          These measurements are outside plausible ranges ({built.error}). Go back and check that the lines span your
          body and that the blue lines touch your head and the floor.
        </p>
        {nav(() => setStep('side'), <span />)}
      </div>
    );
  }

  return null;
}
