import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from '../components/toast-store';
import { Button, Card, CardTitle, Field, Input, NumberInput, PageHeader, Segmented, Select } from '../components/ui';
import { today } from '../domain/dates';
import { EXPERIENCE_LABELS, profileSchema, type Experience, type Profile } from '../domain/schema';
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay, lengthUnit, round, weightUnit } from '../lib/units';
import { parseImport, serializeExport } from '../store/persistence';
import { useData } from '../store/hooks';
import { useAppStore } from '../store/store';

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ProfileForm({ profile, units }: { profile: Profile; units: 'metric' | 'imperial' }) {
  const updateProfile = useAppStore((s) => s.updateProfile);
  const [draft, setDraft] = useState(profile);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const save = () => {
    const parsed = profileSchema.safeParse(draft);
    if (!parsed.success) {
      toast({ title: 'Check your profile', body: parsed.error.issues[0]?.message, tone: 'warn' });
      return;
    }
    updateProfile(parsed.data);
    toast({ title: 'Profile updated', body: 'Levels were recalculated from your full history.', tone: 'success' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="p-name">
          <Input
            id="p-name"
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Sex">
          <Segmented
            ariaLabel="Sex"
            value={draft.sex}
            onChange={(sex) => setDraft({ ...draft, sex })}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
        </Field>
        <Field label="Birth year" htmlFor="p-year">
          <NumberInput
            id="p-year"
            step={1}
            value={draft.birthYear}
            onChange={(v) => v && setDraft({ ...draft, birthYear: Math.round(v) })}
          />
        </Field>
        <Field label="Height" htmlFor="p-height">
          <NumberInput
            id="p-height"
            unit={lengthUnit(units)}
            value={round(cmToDisplay(draft.heightCm, units), 1)}
            onChange={(v) => v && setDraft({ ...draft, heightCm: displayToCm(v, units) })}
          />
        </Field>
        <Field
          label="Starting weight"
          htmlFor="p-weight"
          hint="Your weight when you started. Log current weight via check-ins."
        >
          <NumberInput
            id="p-weight"
            unit={weightUnit(units)}
            value={round(kgToDisplay(draft.startWeightKg, units), 1)}
            onChange={(v) => v && setDraft({ ...draft, startWeightKg: displayToKg(v, units) })}
          />
        </Field>
        <Field label="Experience at start" htmlFor="p-exp">
          <Select
            id="p-exp"
            value={draft.experience}
            onChange={(e) => setDraft({ ...draft, experience: e.target.value as Experience })}
          >
            {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((e) => (
              <option key={e} value={e}>
                {EXPERIENCE_LABELS[e].label} — {EXPERIENCE_LABELS[e].hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Start date"
          htmlFor="p-start"
          hint="Everything before this date is ignored unless workouts exist earlier."
        >
          <Input
            id="p-start"
            type="date"
            max={today()}
            value={draft.startDate}
            onChange={(e) => e.target.value && setDraft({ ...draft, startDate: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(profile)}>
            Cancel
          </Button>
        )}
        <Button onClick={save} disabled={!dirty}>
          <Save size={16} /> Save profile
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const data = useData();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const replaceData = useAppStore((s) => s.replaceData);
  const resetAll = useAppStore((s) => s.resetAll);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  const exportData = () => {
    download(`physicality-backup-${today()}.json`, serializeExport(data));
    toast({ title: 'Backup downloaded', tone: 'success' });
  };

  const importData = async (file: File) => {
    const result = parseImport(await file.text());
    if (!result.ok) {
      toast({ title: 'Import failed', body: result.error, tone: 'warn' });
      return;
    }
    const d = result.data;
    if (
      !window.confirm(
        `Replace all current data with this backup (${d.workouts.length} workouts, ${d.checkIns.length} check-ins)?`,
      )
    )
      return;
    replaceData(d);
    toast({ title: 'Backup restored', tone: 'success' });
  };

  const reset = async () => {
    if (!window.confirm('Delete ALL data on this device? This cannot be undone. Export a backup first if unsure.'))
      return;
    await resetAll();
    navigate('/welcome', { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />

      <Card>
        <CardTitle>Preferences</CardTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">Units</span>
            <Segmented
              ariaLabel="Units"
              value={data.settings.units}
              onChange={(units) => updateSettings({ units })}
              options={[
                { value: 'metric', label: 'Metric (kg, cm)' },
                { value: 'imperial', label: 'Imperial (lb, in)' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">Theme</span>
            <Segmented
              ariaLabel="Theme"
              value={data.settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium">3D model detail</span>
              <p className="text-xs text-muted">
                Precise uses your latest body scan and extra muscle heads. Standard is lighter for older devices.
              </p>
            </div>
            <Segmented
              ariaLabel="3D model detail"
              value={data.settings.modelDetail}
              onChange={(modelDetail) => updateSettings({ modelDetail })}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'precise', label: 'Precise' },
              ]}
            />
          </div>
        </div>
      </Card>

      {data.profile && (
        <Card>
          <CardTitle>Profile</CardTitle>
          <ProfileForm key={JSON.stringify(data.profile)} profile={data.profile} units={data.settings.units} />
        </Card>
      )}

      <Card>
        <CardTitle>Your data</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Everything is stored only in this browser (IndexedDB) — no account, no server, no tracking.
          {persisted === false && ' The browser may clear it under storage pressure, so export backups regularly.'}
          {persisted === true && ' Storage is marked persistent.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportData}>
            <Download size={16} /> Export backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
          <Button variant="danger" onClick={reset}>
            <RotateCcw size={16} /> Reset everything
          </Button>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">Project Physicality v{__APP_VERSION__}</p>
    </div>
  );
}
