import { useState } from 'react';
import type { EventRecord } from '../api.js';

/**
 * Step 2 — upload each band's rider. Several files per band are expected: a
 * channel list and a stage plot describe the same act, and the plot is what
 * makes the stage positions trustworthy.
 */
export function RidersScreen({
  record,
  onUpload,
  busy,
}: {
  record: EventRecord;
  onUpload: (bandName: string, files: File[]) => Promise<void>;
  busy: boolean;
}) {
  const [bandName, setBandName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function submit() {
    if (files.length === 0) return;
    const name = bandName;
    await onUpload(name, files);
    setLastResult(`נקלט: ${name || 'להקה'} — ${files.length} קבצים`);
    setBandName('');
    setFiles([]);
  }

  return (
    <>
      <section className="panel">
        <h2>העלאת מפרט טכני</h2>
        <div className="row">
          <label>
            <span>שם הלהקה (אופציונלי — יילקח מהמסמך אם ריק)</span>
            <input
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              placeholder="מוזאיקה"
            />
          </label>
          <label>
            <span>קבצים — מפרט, רשימת ערוצים, פריסת במה</span>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.csv,.txt"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <button className="primary" onClick={submit} disabled={busy || files.length === 0}>
            {busy ? 'מנתח…' : 'נתח מפרט'}
          </button>
        </div>
        <p className="hint">
          PDF, צילום מסך של אקסל, או תמונה של פריסת במה מצוירת ביד. עברית ואנגלית מעורבבות זה בסדר.
          כל שדה שהמערכת ניחשה יסומן בטבלה כדי שתאשר אותו.
        </p>
        {lastResult && <p className="hint">{lastResult}</p>}
      </section>

      <section className="panel">
        <h2>להקות באירוע ({record.bands.length})</h2>
        {record.bands.length === 0 ? (
          <p className="empty">עדיין לא הועלה מפרט.</p>
        ) : (
          <table className="patch">
            <thead>
              <tr>
                <th>סדר</th>
                <th>להקה</th>
                <th>ערוצים</th>
              </tr>
            </thead>
            <tbody>
              {[...record.bands]
                .sort((a, b) => a.slot - b.slot)
                .map((band) => (
                  <tr key={band.id}>
                    <td className="num">{band.slot}</td>
                    <td>{band.name}</td>
                    <td className="num">
                      {record.plan?.channels.filter((c) => c.bandIds.includes(band.id)).length ?? 0}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {record.warnings.length > 0 && (
          <>
            <h3>שים לב</h3>
            <ul className="conflicts">
              {record.warnings.map((w, i) => (
                <li key={i} className="warning">
                  <strong>{record.bands.find((b) => b.id === w.bandId)?.name ?? w.bandId}:</strong>{' '}
                  {w.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
