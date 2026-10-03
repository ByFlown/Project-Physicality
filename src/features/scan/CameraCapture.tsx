import { Camera, Timer } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { cx } from '../../lib/cx';
import { isLevel, portraitTilt, type Tilt } from '../../scan/level';

/**
 * In-app camera with a level guide. A tilted phone is the largest error
 * source we can still remove at capture time, so the bubble turns green
 * within ±2° and the photo records the tilt it was taken at.
 */
export function CameraCapture({
  label,
  onCapture,
  onClose,
}: {
  label: string;
  onCapture: (file: File, tilt: Tilt | null) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(() =>
    typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? null
      : 'This browser cannot open the camera. Upload photos instead.',
  );
  const [tilt, setTilt] = useState<Tilt | null>(null);
  const [sensor, setSensor] = useState<'waiting' | 'on' | 'none'>('waiting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const tiltRef = useRef<Tilt | null>(null);

  // Camera stream (the component is mounted only while the dialog is open).
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in your browser settings, or upload photos instead.'
            : 'The camera is not available. Upload photos instead.',
        ),
      );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Orientation sensor.
  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent) => {
      const t = portraitTilt(e.beta, e.gamma, screen.orientation?.angle ?? 0);
      tiltRef.current = t;
      setTilt(t);
      if (e.beta !== null) setSensor('on');
    };
    window.addEventListener('deviceorientation', onOrientation);
    const none = setTimeout(() => setSensor((s) => (s === 'waiting' ? 'none' : s)), 1500);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      clearTimeout(none);
    };
  }, []);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    const at = tiltRef.current;
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `${label.toLowerCase()}.jpg`, { type: 'image/jpeg' }), at);
      },
      'image/jpeg',
      0.92,
    );
  };
  const onTimerDone = useEffectEvent(capture);

  // Self-timer.
  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1);
      else {
        setCountdown(null);
        onTimerDone();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const level = isLevel(tilt);
  const bubble = tilt
    ? { x: Math.max(-1, Math.min(1, tilt.roll / 10)), y: Math.max(-1, Math.min(1, tilt.pitch / 10)) }
    : { x: 0, y: 0 };

  return (
    <Modal open onClose={onClose} title={`${label} photo`}>
      {error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-black">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            {/* Framing guide: head near the top line, feet near the bottom line. */}
            <div className="pointer-events-none absolute inset-x-6 top-[5%] bottom-[5%] rounded-lg border-2 border-dashed border-white/50" />
            {sensor === 'on' && (
              <div
                className={cx(
                  'pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full border-2 bg-black/40',
                  level ? 'border-good' : 'border-warn',
                )}
                aria-hidden
              >
                <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />
                <div
                  className={cx('absolute h-3 w-3 rounded-full', level ? 'bg-good' : 'bg-warn')}
                  style={{
                    left: `calc(50% + ${bubble.x * 22}px - 6px)`,
                    top: `calc(50% + ${bubble.y * 22}px - 6px)`,
                  }}
                />
              </div>
            )}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white drop-shadow">
                {countdown}
              </div>
            )}
          </div>
          <p className="text-center text-sm" aria-live="polite">
            {sensor === 'on'
              ? level
                ? 'Level — hold it there.'
                : `Tilt the phone upright (${Math.round(tilt?.pitch ?? 0)}° forward/back, ${Math.round(tilt?.roll ?? 0)}° sideways).`
              : sensor === 'none'
                ? 'No tilt sensor: keep the phone upright, at hip height.'
                : 'Checking the tilt sensor…'}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => setCountdown(10)} disabled={countdown !== null}>
              <Timer size={16} /> 10 s timer
            </Button>
            <Button onClick={capture} disabled={countdown !== null}>
              <Camera size={16} /> Take photo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
