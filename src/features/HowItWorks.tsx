import type { ReactNode } from 'react';
import { Card, PageHeader } from '../components/ui';
import { ENGINE } from '../domain/engine';
import { PLATEAU_LEVEL, xpToNext } from '../domain/leveling';
import { TIER_LEGEND } from '../lib/colors';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted [&_strong]:text-fg">{children}</div>
    </Card>
  );
}

export default function HowItWorks() {
  const costs = [1, 2, 3, 4, 5, 6].map((l) => ({ l, xp: xpToNext(l) }));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="How it works" subtitle="The rules behind your levels — and their limits." />

      <Section title="1. Hard sets earn XP">
        <p>
          Each <strong>working set</strong> is scored by how close to failure it was (reps in reserve) and whether its
          rep count is in the productive 5–30 range. A hard set on a primary mover is worth{' '}
          <strong>{ENGINE.xpPerSet} XP</strong>; secondary movers get half, stabilisers a quarter. Warm-ups earn
          nothing.
        </p>
        <p>
          Returns diminish: after ~6 effective sets for a muscle in one session, extra sets are worth progressively
          less, and beyond ~20 sets per week only 30% counts. This mirrors dose-response research on training volume.
        </p>
        <p>
          Beating an exercise's <strong>estimated 1-rep max</strong> (Epley formula) awards a PR bonus of{' '}
          {ENGINE.prBonus} XP to the main muscles — progression is rewarded, not just showing up.
        </p>
      </Section>

      <Section title="2. Levels">
        <p>
          The first levels get exponentially more expensive; from level <strong>{PLATEAU_LEVEL}</strong> on, every level
          costs the same flat amount:
        </p>
        <div className="flex flex-wrap gap-2">
          {costs.map((c) => (
            <span key={c.l} className="num rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-fg">
              L{c.l}→{c.l + 1}: {c.xp} XP
            </span>
          ))}
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-fg">…same from then on</span>
        </div>
        <p>
          Your <strong>overall physique level</strong> is a size-weighted average of all muscles (quads and glutes count
          more than forearms), so a balanced physique levels up fastest.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {TIER_LEGEND.map((t) => (
            <span key={t.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              <span className="text-fg">{t.name}</span> {t.minLevel}+
            </span>
          ))}
        </div>
      </Section>

      <Section title="3. Not training shrinks you">
        <p>
          A muscle is <strong>maintained</strong> while it gets at least {ENGINE.maintenanceSets} effective sets in any
          rolling 7-day window. Once it drops below that, a <strong>{ENGINE.graceDays}-day grace period</strong> starts.
          After that the muscle loses XP every day — slowly at first ({ENGINE.decayMin * 100}% of a level per day),
          ramping to {ENGINE.decayMax * 100}% per day over two weeks. Levels can go down.
        </p>
        <p>
          Lost XP is banked as <strong>muscle memory</strong>: when you return, every XP you earn is matched from the
          bank until it is repaid, so you regain lost levels at double speed (retained myonuclei make regrowth faster in
          real muscle, too).
        </p>
        <p>
          Deliberately, a plateau with maintenance volume does <em>not</em> decay: holding muscle is not losing it.
        </p>
      </Section>

      <Section title="4. Recovery matters">
        <p>
          Your daily check-in feeds a recovery multiplier from the last three days: ≥7 h sleep adds 5%, protein ≥1.6
          g/kg adds 10% (≥1.2 g/kg adds 5%). Clear deficits (under 6 h sleep, under 0.8 g/kg protein) subtract. Days you
          don't log are neutral — you are never punished for not logging.
        </p>
      </Section>

      <Section title="5. Your starting point & the 3D model">
        <p>
          Starting levels blend your training experience with your <strong>fat-free mass index</strong> (FFMI), computed
          from weight, height and body fat (reported, or estimated from neck/waist/hip measurements with the U.S. Navy
          formula). Self-rated weak and strong muscles shift individual starting levels.
        </p>
        <p>
          On the 3D model, each muscle's bulge grows with its level on a saturating curve — big visible changes early,
          smaller ones later, as with real hypertrophy. The realistic body starts from your shape (your scan, or a body
          predicted from your height, weight and body fat) and shows how your muscles and body fat changed since.
        </p>
      </Section>

      <Section title="6. Body scans & the precise model">
        <p>
          A scan takes a <strong>front and a side photo</strong>. On your device, a pose model finds your joints and a
          segmentation model outlines your body; measurement lines are placed across neck, shoulders, chest, waist,
          hips, arm, forearm, thigh and calf, and you can drag every line to correct it. Your height sets the scale.
          Then a <strong>3D body model is fitted</strong> to everything the photos show — your outline row by row from
          the front and the side, the lines you checked, and your joint positions — and circumferences are measured on
          that fitted body the way a tape would. Two photos can only show widths and depths, so the model fills in the
          shape of each cross-section from thousands of realistic bodies. The Navy body-fat estimate uses those
          circumferences.
        </p>
        <p>
          In <strong>Realistic</strong> mode you see that fitted body. Muscles are drawn as changes since the scan date,
          so the model matches your photos on that day and then grows or shrinks with your levels. The onboarding scan
          also nudges the starting level of the muscles a circumference covers — halfway between your experience-based
          level and what the girth suggests.
        </p>
        <p>
          How accurate? On synthetic test bodies with known measurements, the fitted body is within about 1.5 cm on
          average with ideal photos and about 3 cm with typical phone photos. Real people add error the test cannot
          capture: loose clothing, hair, posture and breathing. Keep the phone upright at hip height, wear fitted
          clothes, and add a tape measurement now and then.
        </p>
        <p>Photos never leave your device and are not kept unless you tick the box; backups never include them.</p>
      </Section>

      <Section title="Honest limits">
        <p>
          Levels measure <strong>training done and sustained</strong>, not muscle mass. Nobody can see individual
          muscles grow from a log — genetics, diet and technique vary enormously. Treat the model as a motivating,
          research-informed estimate. Your <strong>tape measurements and lean-mass trend</strong> are the ground truth;
          if they disagree with your levels for months, trust the tape.
        </p>
      </Section>
    </div>
  );
}
