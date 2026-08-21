/*
 * StagePatch demo UI.
 *
 * The planning, conflict detection and scene generation all come from the real
 * engine bundled above as `StagePatch` — this file only draws it. Nothing here
 * reimplements planner logic, so what the page shows is what the product does.
 */
(function () {
  'use strict';

  const {
    buildPlan, generateScene, toCsv, PRESETS, STAGE_ZONES, M32,
    seedBands, seedInventory, seedRequests, seedMonitors,
  } = StagePatch;

  const ZONE_LABELS = {
    drums: 'תופים',
    'front-left': 'קדמת שמאל',
    'front-center': 'קדמת מרכז',
    'front-right': 'קדמת ימין',
    'upstage-left': 'אחורה שמאל',
    'upstage-center': 'אחורה מרכז',
    'upstage-right': 'אחורה ימין',
    foh: 'FOH',
  };

  const INSTRUMENTS = Object.keys(PRESETS);

  /** Keywords that map a pasted line to an instrument, longest match first. */
  const KEYWORDS = [
    ['kick', ['kick', 'bass drum', 'בס דראם', 'קיק']],
    ['snare', ['snare', 'סנר', 'קלבש']],
    ['hihat', ['hi-hat', 'hihat', 'hh', 'היהט']],
    ['floor-tom', ['floor tom', 'floortom', 'פלור']],
    ['tom', ['tom', 'טום']],
    ['overhead', ['overhead', 'oh l', 'oh r', ' oh', 'מצילות']],
    ['cajon', ['cajon', 'קחון']],
    ['darbuka', ['darbuka', 'riq', 'דרבוקה', 'ריק']],
    ['bass-di', ['bass', 'בס', 'קונטרבס']],
    ['guitar-acoustic', ['acoustic', 'אקוסטית']],
    ['guitar-electric', ['guitar', 'גיטרה']],
    ['keys', ['keys', 'keyboard', 'piano', 'קליד', 'פסנתר']],
    ['oud', ['oud', 'עוד']],
    ['qanun', ['qanun', 'kanun', 'קאנון']],
    ['violin', ['violin', 'כינור']],
    ['woodwind', ['clarinet', 'flute', 'ney', 'sax', 'קלרינט', 'חליל']],
    ['brass', ['trumpet', 'trombone', 'חצוצרה']],
    ['talk-mic', ['talk', 'speech', 'דיבור']],
    ['vocal-lead', ['lead vox', 'lead vocal', 'סולן', 'שירה']],
    ['vocal-backing', ['bv', 'backing', 'ליווי']],
    ['playback-di', ['playback', 'track', 'פלייבק']],
  ];

  function guessInstrument(label) {
    const text = label.toLowerCase();
    for (const [tag, words] of KEYWORDS) {
      if (words.some((w) => text.includes(w))) return tag;
    }
    return 'keys';
  }

  // --- state ---------------------------------------------------------------

  const state = {
    step: 'inventory',
    event: { name: 'Safed Day 3', date: '2026-08-20', venue: 'Ashtam Stage' },
    inventory: clone(seedInventory),
    bands: [],
    requests: [],
    monitorsByZone: {},
    plan: null,
    pasteText: '',
    downloadNote: '',
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function replan() {
    state.plan = state.requests.length
      ? buildPlan({
          event: state.event,
          inventory: state.inventory,
          bands: state.bands,
          requests: state.requests,
          monitorsByZone: state.monitorsByZone,
        })
      : null;
  }

  function loadRealRiders() {
    state.bands = clone(seedBands);
    state.requests = clone(seedRequests);
    state.monitorsByZone = clone(seedMonitors);
    replan();
    state.step = 'patch';
    render();
  }

  function addBlankChannel() {
    ensureManualBand();
    const n = state.requests.length + 1;
    state.requests.push({
      id: 'manual-' + n + '-' + Date.now(),
      bandId: 'manual',
      label: 'ערוץ ' + n,
      instrument: 'keys',
      sourceType: 'di',
      phantom: false,
      stageZone: 'front-center',
      shareable: false,
    });
    replan();
    render();
  }

  function ensureManualBand() {
    if (!state.bands.some((b) => b.id === 'manual')) {
      state.bands.push({ id: 'manual', name: 'הזנה ידנית', slot: state.bands.length + 1 });
    }
  }

  /**
   * Parse a pasted channel list. Deliberately simple and deterministic — one
   * line per channel, optional `|`-separated mic and zone. This is a
   * convenience for the demo, NOT the product's rider extraction.
   */
  function applyPaste() {
    const lines = state.pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    ensureManualBand();
    state.requests = state.requests.filter((r) => r.bandId !== 'manual');

    lines.forEach((line, i) => {
      const parts = line.split('|').map((p) => p.trim());
      const label = parts[0];
      const mic = parts[1] || undefined;
      const zoneInput = (parts[2] || '').toLowerCase();
      const zone = STAGE_ZONES.includes(zoneInput) ? zoneInput : inferZone(label);

      state.requests.push({
        id: 'paste-' + (i + 1),
        bandId: 'manual',
        label: label.slice(0, 12),
        instrument: guessInstrument(label),
        sourceType: /\bdi\b/i.test(mic || '') ? 'di' : 'mic',
        micModel: mic,
        phantom: /condenser|phantom|48/i.test(mic || ''),
        stageZone: zone,
        shareable: false,
      });
    });

    state.pasteText = '';
    replan();
    state.step = 'patch';
    render();
  }

  function inferZone(label) {
    const tag = guessInstrument(label);
    if (['kick', 'snare', 'hihat', 'tom', 'floor-tom', 'overhead'].includes(tag)) return 'drums';
    return 'front-center';
  }

  function clearAll() {
    state.bands = [];
    state.requests = [];
    state.monitorsByZone = {};
    state.plan = null;
    state.step = 'channels';
    render();
  }

  // --- rendering helpers ---------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of children || []) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function field(labelText, control) {
    return el('label', {}, [el('span', { text: labelText }), control]);
  }

  function numberInput(value, onChange, min) {
    return el('input', {
      type: 'number',
      min: min == null ? 0 : min,
      value: String(value),
      oninput: (e) => onChange(Number(e.target.value)),
    });
  }

  function textInput(value, onChange) {
    return el('input', { type: 'text', value: value, oninput: (e) => onChange(e.target.value) });
  }

  function select(options, value, onChange, labelFor) {
    const node = el('select', { onchange: (e) => onChange(e.target.value) },
      options.map((opt) => el('option', { value: opt, text: labelFor ? labelFor(opt) : opt, selected: opt === value })));
    node.value = value;
    return node;
  }

  // --- screens -------------------------------------------------------------

  function inventoryScreen() {
    const inv = state.inventory;
    const totalInputs = inv.console.localInputs + inv.stageBoxes.reduce((s, b) => s + b.inputs, 0);

    const panel = el('section', { class: 'panel' }, [el('h2', { text: 'מלאי ציוד' })]);

    panel.appendChild(el('h3', { text: 'מיקסר' }));
    panel.appendChild(el('div', { class: 'row' }, [
      field('דגם', select(['M32', 'X32'], inv.console.model, (v) => {
        inv.console = Object.assign({}, M32, { model: v });
        replan(); render();
      })),
      field('כניסות מקומיות', numberInput(inv.console.localInputs, (v) => {
        inv.console.localInputs = v; replan(); render();
      })),
      field('יציאות מקומיות', numberInput(inv.console.localOutputs, (v) => {
        inv.console.localOutputs = v; replan(); render();
      })),
    ]));

    panel.appendChild(el('h3', { text: 'קופסאות במה' }));
    if (inv.stageBoxes.length === 0) {
      panel.appendChild(el('p', { class: 'empty', text: 'אין קופסאות במה — ייעשה שימוש בכניסות של המיקסר.' }));
    }
    inv.stageBoxes.forEach((box, i) => {
      panel.appendChild(el('div', { class: 'row' }, [
        field('שם', textInput(box.name, (v) => { box.name = v; replan(); render(); })),
        field('כניסות', numberInput(box.inputs, (v) => { box.inputs = v; replan(); render(); })),
        field('יציאות', numberInput(box.outputs, (v) => { box.outputs = v; replan(); render(); })),
        field('AES50', select(['A', 'B'], box.aesPort, (v) => { box.aesPort = v; replan(); render(); })),
        el('button', { class: 'ghost', text: 'הסר', onclick: () => {
          inv.stageBoxes.splice(i, 1); replan(); render();
        } }),
      ]));
    });
    panel.appendChild(el('button', { class: 'ghost', text: '+ קופסת במה', onclick: () => {
      inv.stageBoxes.push({ name: 'קופסת במה ' + (inv.stageBoxes.length + 1), inputs: 16, outputs: 8, aesPort: 'A', aesOffset: 0 });
      replan(); render();
    } }));

    panel.appendChild(el('h3', { text: 'מולטיקורים' }));
    if (inv.multicores.length === 0) {
      panel.appendChild(el('p', { class: 'empty', text: 'אין מולטיקורים — לא תיווצר פריסת במה.' }));
    }
    inv.multicores.forEach((mc, i) => {
      panel.appendChild(el('div', { class: 'row' }, [
        field('שם', textInput(mc.name, (v) => { mc.name = v; replan(); render(); })),
        field('כניסות', numberInput(mc.inputs, (v) => { mc.inputs = v; replan(); render(); })),
        field('יציאות (מוניטורים)', numberInput(mc.outputs, (v) => { mc.outputs = v; replan(); render(); })),
        el('button', { class: 'ghost', text: 'הסר', onclick: () => {
          inv.multicores.splice(i, 1); replan(); render();
        } }),
      ]));
    });
    panel.appendChild(el('button', { class: 'ghost', text: '+ מולטי', onclick: () => {
      inv.multicores.push({ name: 'מולטי ' + (inv.multicores.length + 1), inputs: 8, outputs: 4 });
      replan(); render();
    } }));

    panel.appendChild(el('p', { class: 'hint', text:
      'סה״כ ' + totalInputs + ' כניסות פיזיות · ' + inv.multicores.length + ' מולטיקורים. ' +
      'שם המולטי קובע לאיזה אזור במה הוא ישויך — "מולטי תופים" ילך לתופים, כל עוד הקיבולת מספיקה.' }));

    panel.appendChild(el('div', { class: 'actions' }, [
      el('button', { class: 'primary', text: 'המשך לערוצים →', onclick: () => { state.step = 'channels'; render(); } }),
    ]));

    return panel;
  }

  function channelsScreen() {
    const nodes = [];

    const loadPanel = el('section', { class: 'panel' }, [
      el('h2', { text: 'קלט ערוצים' }),
      el('p', { class: 'hint', html:
        '<strong>שלב חילוץ ה-AI לא רץ בדמו הזה.</strong> דף Artifact מפורסם חסום מקריאה לכל שרת חיצוני, ' +
        'ולכן אי אפשר לשלוח מפרט למודל מכאן. שלוש הדרכים למטה מזינות את אותם הנתונים שהחילוץ היה מייצר.' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'primary', text: 'טען את המפרטים האמיתיים (מוזאיקה + מוסא ברלין)', onclick: loadRealRiders }),
        el('button', { class: 'ghost', text: 'הוסף ערוץ ריק', onclick: addBlankChannel }),
        state.requests.length ? el('button', { class: 'ghost', text: 'נקה הכל', onclick: clearAll }) : null,
      ]),
    ]);
    nodes.push(loadPanel);

    const pastePanel = el('section', { class: 'panel' }, [
      el('h2', { text: 'הדבקת רשימה' }),
      el('textarea', {
        placeholder: 'ערוץ לכל שורה. אפשר גם:  שם | מיקרופון | אזור\n\nKick | Beta91 | drums\nSnare | SM57 | drums\nקלידים L | DI | front-left\nכינור | DI',
        oninput: (e) => { state.pasteText = e.target.value; },
      }),
      el('p', { class: 'hint', html:
        'זהו פרסר דטרמיניסטי פשוט — שורה לערוץ, ניחוש הכלי לפי מילות מפתח. ' +
        '<strong>זה לא החילוץ של המוצר</strong>, שקורא PDF, צילומי מסך ופריסות במה מצוירות ביד ומסמן כל שדה שהוא ניחש.' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'ghost', text: 'הוסף מהטקסט', onclick: applyPaste }),
      ]),
    ]);
    nodes.push(pastePanel);

    if (state.requests.length > 0) {
      const table = el('table', { class: 'patch' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'שם' }), el('th', { text: 'כלי' }), el('th', { text: 'מקור' }),
          el('th', { text: 'מיק / DI' }), el('th', { text: '48V' }), el('th', { text: 'אזור' }),
          el('th', { text: 'משותף' }), el('th', { text: 'להקה' }), el('th', { text: '' }),
        ])]),
      ]);
      const tbody = el('tbody', {}, []);
      state.requests.forEach((req, i) => {
        tbody.appendChild(el('tr', {}, [
          el('td', { class: 'name' }, [textInput(req.label, (v) => { req.label = v; replan(); })]),
          el('td', {}, [select(INSTRUMENTS, req.instrument, (v) => { req.instrument = v; replan(); render(); })]),
          el('td', {}, [select(['mic', 'di', 'wireless', 'line'], req.sourceType, (v) => { req.sourceType = v; replan(); })]),
          el('td', { text: req.micModel || '—' }),
          el('td', {}, [el('input', { type: 'checkbox', checked: !!req.phantom, onchange: (e) => { req.phantom = e.target.checked; replan(); } })]),
          el('td', {}, [select(STAGE_ZONES, req.stageZone, (v) => { req.stageZone = v; replan(); render(); }, (z) => ZONE_LABELS[z])]),
          el('td', {}, [el('input', { type: 'checkbox', checked: !!req.shareable, onchange: (e) => { req.shareable = e.target.checked; replan(); render(); } })]),
          el('td', { text: req.bandId }),
          el('td', {}, [el('button', { class: 'ghost tiny', text: '✕', onclick: () => {
            state.requests.splice(i, 1); replan(); render();
          } })]),
        ]));
      });
      table.appendChild(tbody);

      nodes.push(el('section', { class: 'panel' }, [
        el('h2', {}, ['ערוצים מבוקשים ', el('span', { class: 'chip', text: String(state.requests.length) })]),
        el('div', { class: 'table-scroll' }, [table]),
        el('p', { class: 'hint', text: 'סמן "משותף" בסט התופים כדי לראות את המיזוג בין להקות — שני מפרטים שמבקשים אותו קיק יקבלו ערוץ אחד.' }),
        el('div', { class: 'actions' }, [
          el('button', { class: 'primary', text: 'תכנן Megapatch →', onclick: () => { replan(); state.step = 'patch'; render(); } }),
        ]),
      ]));
    }

    return nodes;
  }

  function patchScreen() {
    const plan = state.plan;
    if (!plan) {
      return [el('section', { class: 'panel' }, [
        el('p', { class: 'empty', text: 'עדיין אין ערוצים. חזור לשלב 2 וטען את המפרטים האמיתיים.' }),
      ])];
    }

    const errors = plan.conflicts.filter((c) => c.severity === 'error');

    const table = el('table', { class: 'patch' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'ערוץ' }), el('th', { text: 'שם' }), el('th', { text: 'פריסט' }),
        el('th', { text: 'מיק / DI' }), el('th', { text: '48V' }),
        el('th', { text: 'אזור' }), el('th', { text: 'מולטי' }), el('th', { text: 'קו' }),
        el('th', { text: 'כניסה' }), el('th', { text: 'להקות' }), el('th', { text: 'סדר' }),
      ])]),
    ]);

    const tbody = el('tbody', {}, []);
    plan.channels.forEach((ch, i) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { class: 'num', text: String(ch.channelNumber) }),
        el('td', { class: 'name' }, [el('input', {
          type: 'text', value: ch.name, maxlength: '12',
          oninput: (e) => { ch.name = e.target.value; },
        })]),
        el('td', {}, [select(INSTRUMENTS, ch.presetId, (v) => { ch.presetId = v; render(); })]),
        // The mic model already says how the source arrives ("DI", "Wireless
        // RX"), so a separate source-type column costs width for no new
        // information. It only appears when the rider named no model.
        el('td', { text: ch.micModel || ch.sourceType.toUpperCase() }),
        el('td', {}, [el('input', { type: 'checkbox', checked: !!ch.phantom, onchange: (e) => { ch.phantom = e.target.checked; } })]),
        el('td', { text: ZONE_LABELS[ch.stageZone] }),
        el('td', { text: ch.multicore ? ch.multicore.multicore : '—' }),
        el('td', { class: 'num', text: ch.multicore ? String(ch.multicore.line) : '—' }),
        el('td', { class: 'num', text: ch.input.device + ' ' + ch.input.connector }),
        el('td', {}, [ch.bandIds.length > 1
          ? el('span', { class: 'chip shared', text: 'משותף ×' + ch.bandIds.length })
          : el('span', { class: 'chip', text: ch.bandIds[0] || '—' })]),
        el('td', {}, [
          el('button', { class: 'ghost tiny', text: '↑', onclick: () => moveChannel(i, -1) }),
          el('button', { class: 'ghost tiny', text: '↓', onclick: () => moveChannel(i, 1) }),
        ]),
      ]));
    });
    table.appendChild(tbody);

    const main = el('section', { class: 'panel' }, [
      el('h2', {}, ['Megapatch']),
      el('div', { class: 'stat' }, [
        el('div', { html: '<b>' + plan.channels.length + '</b>ערוצים' }),
        el('div', { html: '<b>' + plan.channels.filter((c) => c.bandIds.length > 1).length + '</b>משותפים' }),
        el('div', { html: '<b>' + plan.multicoreLayout.length + '</b>מולטיקורים בשימוש' }),
        el('div', { html: '<b>' + errors.length + '</b>קונפליקטים' }),
      ]),
      el('div', { class: 'table-scroll' }, [table]),
      el('p', { class: 'hint', text: 'שינוי סדר מעדכן את מספרי הערוצים. כל שדה כאן ניתן לעריכה — המתכנן מייצר נקודת התחלה, לא גזר דין.' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'ghost', text: 'תכנן מחדש מהערוצים', onclick: () => { replan(); render(); } }),
        el('button', { class: 'primary', text: 'המשך לייצוא →', onclick: () => { state.step = 'export'; render(); } }),
      ]),
    ]);

    const conflictsPanel = el('section', { class: 'panel' }, [
      el('h2', {}, ['קונפליקטים ', errors.length
        ? el('span', { class: 'chip bad', text: errors.length + ' שגיאות' })
        : el('span', { class: 'chip shared', text: 'נקי' })]),
    ]);
    if (plan.conflicts.length === 0) {
      conflictsPanel.appendChild(el('p', { class: 'empty', text: 'התוכנית נכנסת במלאי הציוד.' }));
    } else {
      conflictsPanel.appendChild(el('ul', { class: 'notes' }, plan.conflicts.map((c) =>
        el('li', { class: c.severity }, [
          document.createTextNode(c.message),
          c.suggestion ? el('span', { class: 'suggestion', text: c.suggestion }) : null,
        ]))));
    }

    const layoutPanel = el('section', { class: 'panel' }, [el('h2', { text: 'פריסת במה' })]);
    if (plan.multicoreLayout.length === 0) {
      layoutPanel.appendChild(el('p', { class: 'empty', text: 'לא שויכו מולטיקורים.' }));
    } else {
      layoutPanel.appendChild(el('ul', { class: 'notes' }, plan.multicoreLayout.map((run) =>
        el('li', {}, [
          el('strong', { text: run.multicore }),
          document.createTextNode(' ← ' + ZONE_LABELS[run.stageZone]),
          el('span', { class: 'suggestion', text: run.lines.length + ' כניסות · ' + run.returnsUsed + ' מוניטורים' }),
        ]))));
    }

    return [el('div', { class: 'grid-2' }, [main, el('div', {}, [conflictsPanel, layoutPanel])])];
  }

  function moveChannel(index, delta) {
    const target = index + delta;
    const channels = state.plan.channels;
    if (target < 0 || target >= channels.length) return;
    const [moved] = channels.splice(index, 1);
    channels.splice(target, 0, moved);
    // Channel numbers follow position, so renumber rather than leave them stale.
    channels.forEach((c, i) => { c.channelNumber = i + 1; });
    render();
  }

  function exportScreen() {
    const plan = state.plan;
    if (!plan) {
      return [el('section', { class: 'panel' }, [el('p', { class: 'empty', text: 'אין תוכנית לייצא.' })])];
    }

    const scene = generateScene(plan);
    const csv = toCsv(plan);
    const errors = plan.conflicts.filter((c) => c.severity === 'error');

    const panel = el('section', { class: 'panel' }, [el('h2', { text: 'ייצוא' })]);

    if (errors.length > 0) {
      panel.appendChild(el('div', { class: 'caution', text:
        'יש ' + errors.length + ' קונפליקטים פתוחים. הייצוא יעבוד, אבל התוכנית לא נכנסת במלאי שהזנת.' }));
    }

    panel.appendChild(el('div', { class: 'stat' }, [
      // trimEnd first: the file ends with a newline, which would otherwise
      // count as an extra empty line.
      el('div', { html: '<b>' + scene.trimEnd().split('\n').length + '</b>שורות ב-‎.scn' }),
      el('div', { html: '<b>' + plan.channels.length + '</b>ערוצים מתוכנתים' }),
      el('div', { html: '<b>' + (scene.match(/^\/headamp/gm) || []).length + '</b>פרי-אמפים' }),
    ]));

    panel.appendChild(el('div', { class: 'actions' }, [
      el('button', { class: 'primary', text: 'הורד קובץ ‎.scn', onclick: () => save('stagepatch.scn', scene) }),
      el('button', { class: 'ghost', text: 'הורד CSV', onclick: () => save('stagepatch-megapatch.csv', csv) }),
    ]));

    if (state.downloadNote) {
      panel.appendChild(el('p', { class: 'hint', text: state.downloadNote }));
    }

    panel.appendChild(el('h3', { text: 'קובץ ה-Scene' }));
    panel.appendChild(el('pre', { class: 'scene', text: scene.split('\n').slice(0, 40).join('\n') + '\n…' }));
    panel.appendChild(el('p', { class: 'hint', text:
      'העתק לדיסק-און-קי ← Setup → Scenes → Load במיקסר. כל הפייזרים נטענים סגורים (‎-oo‎) בכוונה, ' +
      'וערוצים לא בשימוש נכתבים ריקים כדי שההופעה הקודמת לא תישאר עליהם.' }));

    panel.appendChild(el('div', { class: 'caution', html:
      '<strong>לפני שסומכים על זה בהופעה:</strong> טען את הקובץ ל-M32 או ל-M32-Edit במצב Offline ובדוק ' +
      'שמות, צבעים, פאטצ׳ והגדרות. אף קובץ שנוצר כאן עדיין לא אומת מול חומרה.' }));

    return [panel];
  }

  /**
   * Hand a file to the viewer. The capability may be absent and the viewer may
   * decline, so both cases are reported rather than failing silently.
   */
  async function save(filename, data) {
    state.downloadNote = '';
    try {
      const downloads = await window.claude?.use?.('downloads');
      if (!downloads) {
        state.downloadNote = 'ההורדה לא זמינה בתצוגה הזו. תוכן קובץ ה-Scene מוצג במלואו למטה להעתקה.';
        render();
        return;
      }
      await downloads.save({ filename, data });
    } catch (error) {
      state.downloadNote = 'ההורדה לא הושלמה: ' + (error && error.message ? error.message : String(error));
      render();
    }
  }

  // --- shell ---------------------------------------------------------------

  const STEPS = [
    ['inventory', '1 · מלאי ציוד'],
    ['channels', '2 · ערוצים'],
    ['patch', '3 · Megapatch'],
    ['export', '4 · ייצוא'],
  ];

  function render() {
    const app = document.getElementById('app');
    app.textContent = '';

    app.appendChild(el('header', { class: 'top' }, [
      el('h1', { text: 'StagePatch' }),
      el('span', { class: 'sub', text:
        state.inventory.console.model + ' · ' + state.requests.length + ' ערוצים מבוקשים · ' +
        state.bands.length + ' להקות' }),
    ]));

    app.appendChild(el('div', { class: 'banner', html:
      'מפרט טכני ← Megapatch ← קובץ Scene ל-MIDAS M32. ' +
      '<strong>זהו דמו של המנוע:</strong> התכנון, זיהוי הקונפליקטים וייצור קובץ ה-‎.scn‎ הם הקוד האמיתי. ' +
      'שלב חילוץ ה-AI מהמפרטים לא רץ כאן — דף מפורסם חסום מקריאה לשרת חיצוני.' }));

    app.appendChild(el('nav', { class: 'steps' }, STEPS.map(([id, label]) =>
      el('button', {
        'aria-current': state.step === id ? 'true' : 'false',
        text: label,
        onclick: () => { state.step = id; render(); },
      }))));

    let content;
    if (state.step === 'inventory') content = [inventoryScreen()];
    else if (state.step === 'channels') content = channelsScreen();
    else if (state.step === 'patch') content = patchScreen();
    else content = exportScreen();

    for (const node of content) app.appendChild(node);
  }

  render();
})();
