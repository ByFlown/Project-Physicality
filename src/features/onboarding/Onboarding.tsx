import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { LevelRing } from '../../components/LevelRing';
import { Button, Card, Field, Input, NumberInput, Segmented } from '../../components/ui';
import { cx } from '../../lib/cx';
import { computeBaseline } from '../../domain/assessment';
import { navyBodyFat } from '../../domain/bodycomp';
import { today } from '../../domain/dates';
import { buildDemoData } from '../../domain/demo';
import { levelFromXp, tierForLevel } from '../../domain/leveling';
import { MUSCLE_IDS, MUSCLES, REGION_LABELS, type MuscleId, type MuscleRegion } from '../../domain/muscles';
import {
  EXPERIENCE_LABELS,
  MEASURE_LABELS,
  profileSchema,
  type Experience,
  type MeasureSite,
  type MeasurementValues,
  type Profile,
  type SelfRating,
  type Sex,
} from '../../domain/schema';
import { tierColor } from '../../lib/colors';
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay, lengthUnit, round, weightUnit } from '../../lib/units';
import { useAppStore } from '../../store/store';

const STEPS = ['Basics', 'Experience', 'Body', 'Muscles', 'Review'] as const;

interface Draft {
  name: string;
  sex: Sex;
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPct?: number;
  experience: Experience;
  measurements: MeasurementValues;
  selfRatings: Partial<Record<MuscleId, SelfRating>>;
}

const OPTIONAL_SITES: MeasureSite[] = ['chest', 'shoulders', 'upperArm', 'forearm', 'thigh', 'calf'];

function toProfile(d: Draft): Profile | null {
  const parsed = profileSchema.safeParse({
    name: d.name.trim(),
    sex: d.sex,
    birthYear: d.birthYear,
    heightCm: d.heightCm,
    startDate: today(),
    startWeightKg: d.weightKg,
    startBodyFatPct: d.bodyFatPct,
    experience: d.experience,
    selfRatings: Object.fromEntries(Object.entries(d.selfRatings).filter(([, v]) => v !== 0)),
    startMeasurements: d.measurements,
  });
  return parsed.success ? parsed.data : null;
}

export default function Onboarding() {
  const hasProfile = useAppStore((s) => s.data.profile !== null);
  const units = useAppStore((s) => s.data.settings.units);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setProfile = useAppStore((s) => s.setProfile);
  const replaceData = useAppStore((s) => s.replaceData);
  const navigate = useNavigate();

  const [step, setStep] = useState(-1);
  const [draft, setDraft] = useState<Draft>({
    name: '',
    sex: 'male',
    experience: 'beginner',
    measurements: {},
    selfRatings: {},
  });
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const profile = useMemo(() => toProfile(draft), [draft]);
  const baseline = useMemo(() => (profile ? computeBaseline(profile) : null), [profile]);

  if (hasProfile) return <Navigate to="/" replace />;

  const basicsValid =
    draft.name.trim().length > 0 &&
    !!draft.birthYear &&
    draft.birthYear >= 1900 &&
    draft.birthYear <= new Date().getFullYear() - 10 &&
    !!draft.heightCm &&
    draft.heightCm >= 120 &&
    draft.heightCm <= 250 &&
    !!draft.weightKg &&
    draft.weightKg >= 30 &&
    draft.weightKg <= 300;

  const canContinue = step === 0 ? basicsValid : step === STEPS.length - 1 ? !!profile : true;

  const finish = () => {
    if (!profile) return;
    setProfile(profile);
    navigate('/', { replace: true });
  };

  const startDemo = () => {
    replaceData({ ...buildDemoData(today()), settings: { ...useAppStore.getState().data.settings } });
    navigate('/', { replace: true });
  };

  if (step === -1) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="animate-pop-in w-full max-w-lg text-center">
          <svg viewBox="0 0 32 32" className="mx-auto mb-6 h-14 w-14" aria-hidden>
            <rect width="32" height="32" rx="9" fill="var(--accent)" />
            <path
              d="M9 23V9h7.5a4.5 4.5 0 0 1 0 9H9"
              fill="none"
              stroke="var(--accent-fg)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Project Physicality</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Every muscle has a level. Train it and it grows — on a live 3D model of your body. Skip it and it slowly
            shrinks. Your data never leaves this device.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={() => setStep(0)} className="w-full max-w-xs">
              Create my profile <ArrowRight size={18} />
            </Button>
            <Button variant="ghost" onClick={startDemo}>
              <Sparkles size={16} /> Explore with demo data
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6 sm:py-10">
      <ol className="mb-6 flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5">
            <div className={cx('h-1.5 rounded-full transition', i <= step ? 'bg-accent' : 'bg-surface-2')} />
            <span className={cx('hidden text-xs sm:block', i === step ? 'font-semibold' : 'text-muted')}>{s}</span>
          </li>
        ))}
      </ol>

      <Card className="animate-pop-in flex-1" key={step}>
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">The basics</h2>
                <p className="text-sm text-muted">Used to scale your 3D model and estimate body composition.</p>
              </div>
              <Segmented
                ariaLabel="Units"
                size="sm"
                value={units}
                onChange={(u) => updateSettings({ units: u })}
                options={[
                  { value: 'metric', label: 'kg / cm' },
                  { value: 'imperial', label: 'lb / in' },
                ]}
              />
            </div>
            <Field label="Name" htmlFor="ob-name">
              <Input
                id="ob-name"
                autoComplete="given-name"
                value={draft.name}
                maxLength={40}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="What should we call you?"
              />
            </Field>
            <Field label="Sex" hint="Affects body-fat formulas and model proportions.">
              <Segmented
                ariaLabel="Sex"
                value={draft.sex}
                onChange={(sex) => patch({ sex })}
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Birth year" htmlFor="ob-year">
                <NumberInput
                  id="ob-year"
                  value={draft.birthYear}
                  onChange={(v) => patch({ birthYear: v })}
                  step={1}
                  placeholder="1995"
                />
              </Field>
              <Field label="Height" htmlFor="ob-height">
                <NumberInput
                  id="ob-height"
                  unit={lengthUnit(units)}
                  value={draft.heightCm !== undefined ? round(cmToDisplay(draft.heightCm, units), 1) : undefined}
                  onChange={(v) => patch({ heightCm: v === undefined ? undefined : displayToCm(v, units) })}
                  placeholder={units === 'metric' ? '178' : '70'}
                />
              </Field>
              <Field label="Weight" htmlFor="ob-weight">
                <NumberInput
                  id="ob-weight"
                  unit={weightUnit(units)}
                  value={draft.weightKg !== undefined ? round(kgToDisplay(draft.weightKg, units), 1) : undefined}
                  onChange={(v) => patch({ weightKg: v === undefined ? undefined : displayToKg(v, units) })}
                  placeholder={units === 'metric' ? '75' : '165'}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold">Training background</h2>
              <p className="text-sm text-muted">Sets your starting levels. Be honest — the model corrects over time.</p>
            </div>
            <div role="radiogroup" aria-label="Experience" className="grid gap-2">
              {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={draft.experience === e}
                  onClick={() => patch({ experience: e })}
                  className={cx(
                    'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                    draft.experience === e ? 'border-accent bg-accent-soft' : 'border-border hover:border-muted',
                  )}
                >
                  <span>
                    <span className="block font-semibold">{EXPERIENCE_LABELS[e].label}</span>
                    <span className="block text-sm text-muted">{EXPERIENCE_LABELS[e].hint}</span>
                  </span>
                  {draft.experience === e && <Check size={18} className="text-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && <BodyStep draft={draft} patch={patch} units={units} />}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-bold">Strong points & weak spots</h2>
              <p className="text-sm text-muted">
                Optional. Mark muscles that are noticeably behind or ahead of the rest. Each shifts that muscle's
                starting level by about 20%.
              </p>
            </div>
            {(['chest', 'shoulders', 'arms', 'back', 'core', 'legs'] as MuscleRegion[]).map((region) => (
              <div key={region}>
                <div className="mb-1 text-[11px] font-semibold tracking-widest text-muted uppercase">
                  {REGION_LABELS[region]}
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {MUSCLE_IDS.filter((id) => MUSCLES[id].region === region).map((id) => (
                    <div key={id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm">{MUSCLES[id].name}</span>
                      <Segmented<string>
                        ariaLabel={`${MUSCLES[id].name} rating`}
                        size="sm"
                        value={String(draft.selfRatings[id] ?? 0)}
                        onChange={(v) =>
                          patch({ selfRatings: { ...draft.selfRatings, [id]: Number(v) as SelfRating } })
                        }
                        options={[
                          { value: '-1', label: 'Lagging' },
                          { value: '0', label: 'Average' },
                          { value: '1', label: 'Strong' },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && baseline && profile && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-xl font-bold">Your starting point</h2>
              <p className="text-sm text-muted">Here's where your journey begins.</p>
            </div>
            <div className="flex items-center gap-5">
              <LevelRing level={Math.floor(baseline.level)} progress={baseline.level % 1} size={104} label="Level" />
              <div>
                <div className="text-lg font-bold" style={{ color: tierColor(Math.floor(baseline.level)) }}>
                  {tierForLevel(Math.floor(baseline.level)).name}
                </div>
                <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-muted">Body fat</dt>
                  <dd className="num">
                    {round(baseline.bodyFat.value, 1)}%{' '}
                    <span className="text-xs text-muted">({baseline.bodyFat.source})</span>
                  </dd>
                  <dt className="text-muted">FFMI</dt>
                  <dd className="num">{round(baseline.ffmi, 1)}</dd>
                  <dt className="text-muted">From experience</dt>
                  <dd className="num">L{round(baseline.experienceLevel, 1)}</dd>
                  <dt className="text-muted">From FFMI</dt>
                  <dd className="num">L{round(baseline.ffmiLevel, 1)}</dd>
                </dl>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {MUSCLE_IDS.map((id) => (
                <div key={id} className="flex justify-between gap-2">
                  <span className="text-muted">{MUSCLES[id].name}</span>
                  <span className="num font-semibold">L{levelFromXp(baseline.muscleXp[id]).level}</span>
                </div>
              ))}
            </div>
            {baseline.bodyFat.source === 'estimated' && (
              <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                Body fat was estimated from BMI and age, which is rough. Add neck and waist measurements later for a
                better estimate.
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft size={16} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continue <ArrowRight size={16} />
          </Button>
        ) : (
          <Button onClick={finish} disabled={!canContinue}>
            Start training <Check size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

function BodyStep({
  draft,
  patch,
  units,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  units: 'metric' | 'imperial';
}) {
  const setSite = (site: MeasureSite, v: number | undefined) => {
    const next = { ...draft.measurements };
    if (v === undefined) delete next[site];
    else next[site] = displayToCm(v, units);
    patch({ measurements: next });
  };
  const navy = draft.heightCm ? navyBodyFat(draft.sex, draft.heightCm, draft.measurements) : undefined;
  const required: MeasureSite[] = draft.sex === 'female' ? ['neck', 'waist', 'hips'] : ['neck', 'waist'];
  const siteInput = (site: MeasureSite) => (
    <Field key={site} label={MEASURE_LABELS[site]} htmlFor={`ob-${site}`}>
      <NumberInput
        id={`ob-${site}`}
        unit={lengthUnit(units)}
        value={
          draft.measurements[site] !== undefined ? round(cmToDisplay(draft.measurements[site]!, units), 1) : undefined
        }
        onChange={(v) => setSite(site, v)}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold">Body composition</h2>
        <p className="text-sm text-muted">
          Optional but recommended. Lean mass (FFMI) is the most objective signal for your starting level.
        </p>
      </div>
      <Field label="Body fat % (if you know it)" htmlFor="ob-bf" hint="From DEXA, calipers or a smart scale.">
        <NumberInput id="ob-bf" unit="%" value={draft.bodyFatPct} onChange={(v) => patch({ bodyFatPct: v })} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">…or tape measurements (U.S. Navy method)</p>
        <div className="grid gap-4 sm:grid-cols-3">{required.map(siteInput)}</div>
        {navy !== undefined && (
          <p className="mt-2 text-sm">
            Estimated body fat: <span className="num font-semibold">{navy}%</span>
            {draft.bodyFatPct !== undefined && (
              <span className="text-muted"> (your reported value takes priority)</span>
            )}
          </p>
        )}
      </div>
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">More circumferences (for tracking growth)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">{OPTIONAL_SITES.map(siteInput)}</div>
      </details>
    </div>
  );
}
