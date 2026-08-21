import { useCallback, useEffect, useState } from 'react';
import { M32, type Inventory, type MegapatchPlan } from '@stagepatch/core';
import { api, type EventRecord } from './api.js';
import { InventoryScreen } from './screens/InventoryScreen.js';
import { RidersScreen } from './screens/RidersScreen.js';
import { PatchScreen } from './screens/PatchScreen.js';
import { ExportScreen } from './screens/ExportScreen.js';

type Step = 'inventory' | 'riders' | 'patch' | 'export';

const STEP_LABELS: Record<Step, string> = {
  inventory: '1 · מלאי ציוד',
  riders: '2 · מפרטים',
  patch: '3 · Megapatch',
  export: '4 · ייצוא',
};

export function App() {
  const [record, setRecord] = useState<EventRecord | null>(null);
  const [step, setStep] = useState<Step>('inventory');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Run an action, surfacing whatever went wrong instead of failing silently. */
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  // Resume the most recent event, or start one. A technician who reloads mid
  // soundcheck should not lose the event they were working on.
  useEffect(() => {
    void run(async () => {
      const events = await api.listEvents();
      if (events[0]) {
        setRecord(events[0]);
        return;
      }
      const created = await api.createEvent(
        { name: 'אירוע חדש', date: new Date().toISOString().slice(0, 10), venue: '' },
        { console: M32, stageBoxes: [], multicores: [] } satisfies Inventory,
      );
      setRecord(created);
    });
  }, [run]);

  async function refresh(id: string) {
    const updated = await api.getEvent(id);
    setRecord(updated);
  }

  function applyPlan(plan: MegapatchPlan) {
    setRecord((current) => (current ? { ...current, plan } : current));
  }

  if (!record) {
    return (
      <div className="app">
        <header className="top">
          <h1>StagePatch</h1>
        </header>
        {error ? <div className="error-banner">{error}</div> : <p className="empty">טוען…</p>}
      </div>
    );
  }

  const hasPlan = Boolean(record.plan && record.plan.channels.length > 0);

  return (
    <div className="app">
      <header className="top">
        <h1>StagePatch</h1>
        <span className="sub">
          {record.event.name} · {record.inventory.console.model} · {record.bands.length} להקות
        </span>
      </header>

      <nav className="steps">
        {(Object.keys(STEP_LABELS) as Step[]).map((s) => (
          <button
            key={s}
            aria-current={step === s}
            disabled={(s === 'patch' || s === 'export') && !hasPlan}
            onClick={() => setStep(s)}
          >
            {STEP_LABELS[s]}
          </button>
        ))}
      </nav>

      {error && <div className="error-banner">{error}</div>}

      {step === 'inventory' && (
        <InventoryScreen
          inventory={record.inventory}
          busy={busy}
          onSave={(inventory) =>
            void run(async () => {
              await api.saveInventory(record.id, inventory);
              await refresh(record.id);
              setStep('riders');
            })
          }
        />
      )}

      {step === 'riders' && (
        <RidersScreen
          record={record}
          busy={busy}
          onUpload={async (bandName, files) => {
            await run(async () => {
              await api.uploadRider(record.id, bandName, files);
              await refresh(record.id);
              setStep('patch');
            });
          }}
        />
      )}

      {step === 'patch' && record.plan && (
        <PatchScreen
          plan={record.plan}
          busy={busy}
          onChange={(plan) => {
            // Show the edit immediately, then persist. A grid that lags behind
            // typing is a grid nobody will use at a soundcheck.
            applyPlan(plan);
            void run(() => api.savePlan(record.id, plan));
          }}
          onReplan={() =>
            void run(async () => {
              const plan = await api.replan(record.id);
              applyPlan(plan);
            })
          }
        />
      )}

      {step === 'export' && record.plan && <ExportScreen eventId={record.id} plan={record.plan} />}
    </div>
  );
}
