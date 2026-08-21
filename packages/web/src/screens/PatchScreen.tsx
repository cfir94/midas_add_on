import { PRESETS, STAGE_ZONES, type InstrumentTag, type MegapatchPlan, type PlannedChannel, type StageZone } from '@stagepatch/core';

const ZONE_LABELS: Record<StageZone, string> = {
  drums: 'תופים',
  'front-left': 'קדמת שמאל',
  'front-center': 'קדמת מרכז',
  'front-right': 'קדמת ימין',
  'upstage-left': 'אחורה שמאל',
  'upstage-center': 'אחורה מרכז',
  'upstage-right': 'אחורה ימין',
  foh: 'FOH',
};

const INSTRUMENT_TAGS = Object.keys(PRESETS) as InstrumentTag[];

/**
 * Step 3 — the megapatch itself, and the screen that decides whether the tool is
 * usable. Everything here is editable: the planner produces a starting point,
 * and a technician overriding it is the expected workflow, not an error.
 */
export function PatchScreen({
  plan,
  onChange,
  onReplan,
  busy,
}: {
  plan: MegapatchPlan;
  onChange: (plan: MegapatchPlan) => void;
  onReplan: () => void;
  busy: boolean;
}) {
  function updateChannel(index: number, patch: Partial<PlannedChannel>) {
    const channels = [...plan.channels];
    channels[index] = { ...channels[index]!, ...patch };
    onChange({ ...plan, channels });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= plan.channels.length) return;

    const channels = [...plan.channels];
    const [moved] = channels.splice(index, 1);
    channels.splice(target, 0, moved!);
    // Channel numbers follow position in the list, so renumber after a move
    // rather than leaving the strip numbers stale.
    onChange({
      ...plan,
      channels: channels.map((c, i) => ({ ...c, channelNumber: i + 1 })),
    });
  }

  const errors = plan.conflicts.filter((c) => c.severity === 'error');

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Megapatch — {plan.channels.length} ערוצים</h2>

        <div className="table-scroll">
          <table className="patch">
            <thead>
              <tr>
                <th>ערוץ</th>
                <th>שם</th>
                <th>פריסט</th>
                <th>מקור</th>
                <th>מיק / DI</th>
                <th>48V</th>
                <th>אזור</th>
                <th>מולטי</th>
                <th>קו</th>
                <th>כניסה</th>
                <th>להקות</th>
                <th>סדר</th>
              </tr>
            </thead>
            <tbody>
              {plan.channels.map((ch, i) => (
                <tr key={`${ch.requestIds.join('-')}-${i}`}>
                  <td className="num">{ch.channelNumber}</td>
                  <td className="name">
                    <input
                      value={ch.name}
                      maxLength={12}
                      onChange={(e) => updateChannel(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={ch.presetId}
                      onChange={(e) =>
                        updateChannel(i, { presetId: e.target.value as InstrumentTag })
                      }
                    >
                      {INSTRUMENT_TAGS.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{ch.sourceType.toUpperCase()}</td>
                  <td>{ch.micModel ?? '—'}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={ch.phantom}
                      onChange={(e) => updateChannel(i, { phantom: e.target.checked })}
                    />
                  </td>
                  <td>
                    <select
                      value={ch.stageZone}
                      onChange={(e) =>
                        updateChannel(i, { stageZone: e.target.value as StageZone })
                      }
                    >
                      {STAGE_ZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {ZONE_LABELS[zone]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{ch.multicore?.multicore ?? '—'}</td>
                  <td className="num">{ch.multicore?.line ?? '—'}</td>
                  <td className="num">
                    {ch.input.device} {ch.input.connector}
                  </td>
                  <td>
                    {ch.bandIds.length > 1 ? (
                      <span className="chip shared">משותף ×{ch.bandIds.length}</span>
                    ) : (
                      <span className="chip">{ch.bandIds[0] ?? '—'}</span>
                    )}
                  </td>
                  <td>
                    <button className="ghost" onClick={() => move(i, -1)} aria-label="העלה">
                      ↑
                    </button>
                    <button className="ghost" onClick={() => move(i, 1)} aria-label="הורד">
                      ↓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          שינוי סדר מעדכן את מספרי הערוצים. "תכנן מחדש" מייצר הכל מהמפרטים ומוחק את השינויים שלך.
        </p>

        <div className="actions">
          <button className="ghost" onClick={onReplan} disabled={busy}>
            תכנן מחדש מהמפרטים
          </button>
        </div>
      </section>

      <aside>
        <section className="panel">
          <h2>
            קונפליקטים{' '}
            {errors.length > 0 ? (
              <span className="chip guess">{errors.length} שגיאות</span>
            ) : (
              <span className="chip shared">נקי</span>
            )}
          </h2>
          {plan.conflicts.length === 0 ? (
            <p className="empty">התוכנית נכנסת במלאי הציוד.</p>
          ) : (
            <ul className="conflicts">
              {plan.conflicts.map((c, i) => (
                <li key={i} className={c.severity}>
                  {c.message}
                  {c.suggestion && <span className="suggestion">{c.suggestion}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>פריסת במה</h2>
          {plan.multicoreLayout.length === 0 ? (
            <p className="empty">לא שויכו מולטיקורים.</p>
          ) : (
            <ul className="conflicts">
              {plan.multicoreLayout.map((run) => (
                <li key={run.multicore}>
                  <strong>{run.multicore}</strong> ← {ZONE_LABELS[run.stageZone]}
                  <span className="suggestion">
                    {run.lines.length} כניסות · {run.returnsUsed} מוניטורים
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
