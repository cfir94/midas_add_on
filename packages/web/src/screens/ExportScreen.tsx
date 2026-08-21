import { api } from '../api.js';
import type { MegapatchPlan } from '@stagepatch/core';

/**
 * Step 4 — the two deliverables: the patch sheet the crew reads, and the scene
 * file the console loads.
 */
export function ExportScreen({ eventId, plan }: { eventId: string; plan: MegapatchPlan }) {
  const errors = plan.conflicts.filter((c) => c.severity === 'error');

  return (
    <section className="panel">
      <h2>ייצוא</h2>

      {errors.length > 0 && (
        <div className="error-banner">
          יש {errors.length} קונפליקטים פתוחים. הייצוא יעבוד, אבל התוכנית לא נכנסת במלאי שהזנת —
          כדאי לפתור אותם קודם.
        </div>
      )}

      <h3>מסמך Megapatch</h3>
      <div className="actions">
        <a className="ghost" href={api.exportUrl(eventId, 'csv')} download>
          הורד CSV (לאקסל)
        </a>
        <a className="ghost" href={api.exportUrl(eventId, 'markdown')} target="_blank" rel="noreferrer">
          צפה כ-Markdown
        </a>
      </div>

      <h3>קובץ Scene למיקסר</h3>
      <div className="actions">
        <a className="primary" href={api.exportUrl(eventId, 'scene')} download>
          הורד קובץ ‎.scn
        </a>
      </div>

      <p className="hint">
        העתק את הקובץ לדיסק-און-קי ← Setup → Scenes → Load במיקסר.
        כל הפייזרים נטענים סגורים (‎-oo‎) בכוונה, וערוצים לא בשימוש נמחקים כדי שההופעה הקודמת
        לא תישאר עליהם.
      </p>

      <div className="error-banner">
        <strong>לפני שסומכים על זה בהופעה:</strong> טען את הקובץ ל-M32 או ל-M32-Edit במצב Offline
        ובדוק שמות, צבעים, פאטצ' והגדרות. אף קובץ שנוצר כאן עדיין לא אומת מול חומרה.
      </div>
    </section>
  );
}
