import { useState } from 'react';
import { M32, type Inventory } from '@stagepatch/core';

/**
 * Step 1 — the technician's gear. Entered once per rig; everything downstream
 * treats these numbers as hard limits, so getting them right here is what makes
 * the conflict reporting meaningful.
 */
export function InventoryScreen({
  inventory,
  onSave,
  busy,
}: {
  inventory: Inventory;
  onSave: (inventory: Inventory) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Inventory>(inventory);

  function addStageBox() {
    setDraft({
      ...draft,
      stageBoxes: [
        ...draft.stageBoxes,
        { name: `קופסת במה ${draft.stageBoxes.length + 1}`, inputs: 16, outputs: 8, aesPort: 'A', aesOffset: 0 },
      ],
    });
  }

  function addMulticore() {
    setDraft({
      ...draft,
      multicores: [
        ...draft.multicores,
        { name: `מולטי ${draft.multicores.length + 1}`, inputs: 8, outputs: 4 },
      ],
    });
  }

  const totalInputs =
    draft.console.localInputs + draft.stageBoxes.reduce((sum, b) => sum + b.inputs, 0);

  return (
    <section className="panel">
      <h2>מלאי ציוד</h2>

      <h3>מיקסר</h3>
      <div className="row">
        <label>
          <span>דגם</span>
          <select
            value={draft.console.model}
            onChange={(e) =>
              setDraft({ ...draft, console: { ...M32, model: e.target.value as 'M32' | 'X32' } })
            }
          >
            <option value="M32">MIDAS M32</option>
            <option value="X32">Behringer X32</option>
          </select>
        </label>
        <label>
          <span>כניסות מקומיות</span>
          <input
            type="number"
            min={0}
            value={draft.console.localInputs}
            onChange={(e) =>
              setDraft({
                ...draft,
                console: { ...draft.console, localInputs: Number(e.target.value) },
              })
            }
          />
        </label>
        <label>
          <span>יציאות מקומיות</span>
          <input
            type="number"
            min={0}
            value={draft.console.localOutputs}
            onChange={(e) =>
              setDraft({
                ...draft,
                console: { ...draft.console, localOutputs: Number(e.target.value) },
              })
            }
          />
        </label>
      </div>

      <h3>קופסאות במה</h3>
      {draft.stageBoxes.length === 0 && <p className="empty">אין קופסאות במה — נשתמש בכניסות של המיקסר.</p>}
      {draft.stageBoxes.map((box, i) => (
        <div className="row" key={i}>
          <label>
            <span>שם</span>
            <input
              value={box.name}
              onChange={(e) => {
                const boxes = [...draft.stageBoxes];
                boxes[i] = { ...box, name: e.target.value };
                setDraft({ ...draft, stageBoxes: boxes });
              }}
            />
          </label>
          <label>
            <span>כניסות</span>
            <input
              type="number"
              min={0}
              value={box.inputs}
              onChange={(e) => {
                const boxes = [...draft.stageBoxes];
                boxes[i] = { ...box, inputs: Number(e.target.value) };
                setDraft({ ...draft, stageBoxes: boxes });
              }}
            />
          </label>
          <label>
            <span>יציאות</span>
            <input
              type="number"
              min={0}
              value={box.outputs}
              onChange={(e) => {
                const boxes = [...draft.stageBoxes];
                boxes[i] = { ...box, outputs: Number(e.target.value) };
                setDraft({ ...draft, stageBoxes: boxes });
              }}
            />
          </label>
          <label>
            <span>יציאת AES50</span>
            <select
              value={box.aesPort}
              onChange={(e) => {
                const boxes = [...draft.stageBoxes];
                boxes[i] = { ...box, aesPort: e.target.value as 'A' | 'B' };
                setDraft({ ...draft, stageBoxes: boxes });
              }}
            >
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <button
            className="ghost"
            onClick={() =>
              setDraft({ ...draft, stageBoxes: draft.stageBoxes.filter((_, j) => j !== i) })
            }
          >
            הסר
          </button>
        </div>
      ))}
      <button className="ghost" onClick={addStageBox}>+ קופסת במה</button>

      <h3>מולטיקורים</h3>
      {draft.multicores.length === 0 && (
        <p className="empty">אין מולטיקורים — לא תתקבל פריסת במה.</p>
      )}
      {draft.multicores.map((mc, i) => (
        <div className="row" key={i}>
          <label>
            <span>שם</span>
            <input
              value={mc.name}
              onChange={(e) => {
                const list = [...draft.multicores];
                list[i] = { ...mc, name: e.target.value };
                setDraft({ ...draft, multicores: list });
              }}
            />
          </label>
          <label>
            <span>כניסות</span>
            <input
              type="number"
              min={0}
              value={mc.inputs}
              onChange={(e) => {
                const list = [...draft.multicores];
                list[i] = { ...mc, inputs: Number(e.target.value) };
                setDraft({ ...draft, multicores: list });
              }}
            />
          </label>
          <label>
            <span>יציאות (מוניטורים)</span>
            <input
              type="number"
              min={0}
              value={mc.outputs}
              onChange={(e) => {
                const list = [...draft.multicores];
                list[i] = { ...mc, outputs: Number(e.target.value) };
                setDraft({ ...draft, multicores: list });
              }}
            />
          </label>
          <button
            className="ghost"
            onClick={() =>
              setDraft({ ...draft, multicores: draft.multicores.filter((_, j) => j !== i) })
            }
          >
            הסר
          </button>
        </div>
      ))}
      <button className="ghost" onClick={addMulticore}>+ מולטי</button>

      <p className="hint">
        סה״כ {totalInputs} כניסות פיזיות · {draft.multicores.length} מולטיקורים.
        שם המולטי קובע לאיזה אזור במה הוא ישויך — "מולטי תופים" ילך לתופים.
      </p>

      <div className="actions">
        <button className="primary" onClick={() => onSave(draft)} disabled={busy}>
          {busy ? 'שומר…' : 'שמור מלאי'}
        </button>
      </div>
    </section>
  );
}
