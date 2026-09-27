import { ScanLine, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '../../components/toast-store';
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader } from '../../components/ui';
import { compareDates, formatDate, today } from '../../domain/dates';
import { MEASURE_LABELS, type MeasureSite, type Scan } from '../../domain/schema';
import { formatLength, round } from '../../lib/units';
import { measurementFromScan } from '../../scan/measurement';
import { getScanPhoto, putScanPhoto, type PhotoView } from '../../scan/photoStore';
import { useData, useProfile } from '../../store/hooks';
import { useAppStore } from '../../store/store';
import { ScanWizard } from './ScanWizard';

const METHOD_LABEL: Record<Scan['method'], string> = {
  auto: 'Automatic',
  adjusted: 'Adjusted by you',
  manual: 'Placed by hand',
};

function ScanPhoto({ scanId, view }: { scanId: string; view: PhotoView }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    getScanPhoto(scanId, view)
      .then((blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scanId, view]);
  if (!url) return null;
  return <img src={url} alt={`${view} photo`} className="h-48 w-full rounded-lg bg-black object-contain" />;
}

export default function ScanPage() {
  const data = useData();
  const profile = useProfile();
  const saveScan = useAppStore((s) => s.saveScan);
  const deleteScan = useAppStore((s) => s.deleteScan);
  const [scanning, setScanning] = useState(false);
  const units = data.settings.units;

  if (!profile) return null;
  const scans = [...data.scans].sort((a, b) => compareDates(b.date, a.date) || b.id.localeCompare(a.id));
  const latest = scans[0];
  const first = scans[scans.length - 1];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Body scans"
        subtitle="Front + side photos → circumferences, body fat and a 3D model shaped like you. Re-scan every 4–8 weeks."
        action={
          !scanning && (
            <Button onClick={() => setScanning(true)}>
              <ScanLine size={16} /> New scan
            </Button>
          )
        }
      />

      {scanning && (
        <Card>
          <ScanWizard
            sex={profile.sex}
            heightCm={profile.heightCm}
            units={units}
            date={today()}
            onCancel={() => setScanning(false)}
            onComplete={({ scan, photos }) => {
              saveScan(scan, measurementFromScan(scan));
              if (photos) {
                void putScanPhoto(scan.id, 'front', photos.front).catch(() => {});
                void putScanPhoto(scan.id, 'side', photos.side).catch(() => {});
              }
              setScanning(false);
              toast({ title: 'Scan saved', body: 'Your precise model is now calibrated to it.', tone: 'success' });
            }}
          />
        </Card>
      )}

      {scans.length === 0 && !scanning && (
        <Card>
          <EmptyState icon={<ScanLine size={32} />} title="No scans yet">
            A scan takes two photos and about two minutes, and unlocks the precise 3D model.
          </EmptyState>
        </Card>
      )}

      {latest && first && latest.id !== first.id && (
        <Card>
          <CardTitle>Change since {formatDate(first.date, { dateStyle: 'medium' })}</CardTitle>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
            {(Object.keys(latest.circumferences) as MeasureSite[]).map((site) => {
              const now = latest.circumferences[site];
              const then = first.circumferences[site];
              if (now === undefined || then === undefined) return null;
              const d = now - then;
              return (
                <div key={site} className="flex justify-between gap-2">
                  <dt className="text-muted">{MEASURE_LABELS[site].replace(' (flexed)', '')}</dt>
                  <dd className="num">
                    {formatLength(now, units)}{' '}
                    <span className={d > 0.2 ? 'text-good' : d < -0.2 ? 'text-bad' : 'text-muted'}>
                      ({d >= 0 ? '+' : ''}
                      {formatLength(d, units)})
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Changes smaller than ~2 cm are within the photo method's noise. A growing waist next to growing arms may
            mean fat gain rather than muscle.
          </p>
        </Card>
      )}

      {scans.map((s) => (
        <Card key={s.id}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{formatDate(s.date, { dateStyle: 'long' })}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge color={s.quality >= 0.7 ? '#22c55e' : s.quality >= 0.4 ? '#f59e0b' : '#f43f5e'}>
                  {Math.round(s.quality * 100)}% confidence
                </Badge>
                <span>{METHOD_LABEL[s.method]}</span>
                {s.bodyFatPct !== undefined && <span>· body fat ≈ {round(s.bodyFatPct, 1)}%</span>}
                {s.id === latest?.id && <Badge color="#ff7a2f">Model calibrated to this scan</Badge>}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete scan from ${formatDate(s.date)}`}
              onClick={() => {
                if (window.confirm('Delete this scan, its measurements and any kept photos?')) deleteScan(s.id);
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
          {s.photosKept && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <ScanPhoto scanId={s.id} view="front" />
              <ScanPhoto scanId={s.id} view="side" />
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {(Object.entries(s.circumferences) as [MeasureSite, number][]).map(([site, v]) => (
              <div key={site} className="flex justify-between gap-2">
                <dt className="text-muted">{MEASURE_LABELS[site].replace(' (flexed)', '')}</dt>
                <dd className="num font-semibold">{formatLength(v, units)}</dd>
              </div>
            ))}
          </dl>
          {s.warnings.length > 0 && (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">{s.warnings.length} note(s) from the scan</summary>
              <ul className="mt-1 list-disc pl-5">
                {s.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
