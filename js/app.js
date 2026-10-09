/* שכבת ה-UI: ניתוב, תהליך המילוי, לוח בקרה, תובנות, סימולטור ודוח. */
(function (global) {
  'use strict';
  const C = global.Catalog, E = global.Engine, I = global.Insights, Ch = global.Charts, S = global.Store;

  let state = S.load() || S.blank();
  const openMore = new Set();
  const ui = { month: new Date().getMonth(), cmpA: 0, cmpB: 1, potentialCut: 0.2, sim: { all: 0, variable: 0, cat: 'leisure', catCut: 0, income: 0 }, lastRoute: '' };

  const app = document.getElementById('app');

  /* ---------- עזרים ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = v => Math.round(Math.abs(v)).toLocaleString('he-IL');
  const money = (v, cls) => `<bdi dir="ltr" class="num ${cls || ''}">${v < -0.5 ? '−' : ''}₪${fmt(v)}</bdi>`;
  const pct = v => `<bdi dir="ltr" class="num">${Math.round(v * 100)}%</bdi>`;
  const inputVal = v => (v === '' || v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const parseAmt = s => { const t = String(s).replace(/[^\d.]/g, ''); return t === '' ? '' : Number(t); };
  const tone = v => (v < -0.5 ? 'neg' : 'pos');
  const LEVEL = {
    good: { icon: '●', label: 'מצב טוב' }, warn: { icon: '▲', label: 'לתשומת לב' },
    serious: { icon: '▲', label: 'לתשומת לב' }, bad: { icon: '■', label: 'דורש טיפול' }, info: { icon: 'i', label: 'מידע' }
  };
  const compute = () => E.compute(state);
  const hasData = () => Object.keys(state.incomes).length > 0 || Object.keys(state.expenses).length > 0;

  function persist() {
    S.save(state, ok => {
      const el = document.getElementById('save-status');
      if (!el) return;
      const t = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      el.textContent = ok ? `נשמר אוטומטית · ${t}` : 'השמירה נכשלה (אחסון הדפדפן חסום)';
      el.classList.toggle('err', !ok);
    });
  }

  /* ---------- שלבי המילוי ---------- */
  function steps() {
    const h = state.household;
    return [{ id: 'household', label: 'משק הבית', icon: '👪' }, { id: 'income', label: 'הכנסות', icon: '💼' }]
      .concat(C.CATEGORIES.filter(c => C.visible(c, h)).map(c => ({ id: c.id, label: c.name, icon: c.icon, cat: c })))
      .concat([{ id: 'finish', label: 'סיכום', icon: '✅' }]);
  }
  function entryFilled(e) { return e && (E.monthlyEquivalent(e) > 0); }
  function stepDone(st) {
    if (state.progress[st.id]) return true;
    if (st.id === 'income') return Object.values(state.incomes).some(entryFilled);
    if (st.cat) return Object.entries(state.expenses).some(([id, e]) => entryFilled(e) && ((C.itemByKey[id] && C.itemByKey[id].cat === st.id) || (e.custom && e.cat === st.id)));
    return false;
  }
  function completion() {
    const list = steps().filter(s => s.id !== 'finish');
    return list.filter(stepDone).length / list.length;
  }

  /* ---------- רשומות ---------- */
  function defaultEntry(coll, id) {
    const def = coll === 'expenses' ? C.itemByKey[id] : C.incomeByKey[id];
    const e = { amount: '', freq: (def && def.freq) || 'monthly', month: '', values: [] };
    if (coll === 'incomes' && def && def.employment) e.employment = 'salaried';
    return e;
  }
  const getEntry = (coll, id) => state[coll][id] || defaultEntry(coll, id);
  function ensureEntry(coll, id) { return state[coll][id] || (state[coll][id] = defaultEntry(coll, id)); }

  function freqSelect(e) {
    return `<select data-field="freq" aria-label="תדירות">${Object.entries(C.FREQS).map(([k, f]) => `<option value="${k}" ${e.freq === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select>`;
  }

  function eqText(e) {
    const m = E.monthlyEquivalent(e);
    if (!m || e.freq === 'monthly') return '';
    return `≈ ${money(m)} לחודש · ${money(m * 12)} בשנה`;
  }

  function entryRow(coll, id, name, opts) {
    opts = opts || {};
    const e = getEntry(coll, id);
    const needsMonth = e.freq === 'annual' || e.freq === 'once' || e.freq === 'bimonthly';
    const open = openMore.has(coll + id) || (needsMonth && e.amount !== '') || e.freq === 'varying';
    const def = coll === 'expenses' ? C.itemByKey[id] : null;
    const type = e.type || (def && def.type) || 'variable';

    let more = '';
    if (needsMonth) {
      const opt = e.freq === 'bimonthly'
        ? [0, 1].map(m => `<option value="${m}" ${String(e.month) === String(m) ? 'selected' : ''}>${C.MONTHS[m]} (ואז כל חודשיים)</option>`).join('')
        : `<option value="">פריסה שווה על כל השנה</option>` + C.MONTHS.map((mn, m) => `<option value="${m}" ${String(e.month) === String(m) ? 'selected' : ''}>${mn}</option>`).join('');
      more += `<label class="mini-field"><span>${e.freq === 'bimonthly' ? 'חודש תשלום ראשון' : (coll === 'incomes' ? 'חודש קבלה' : 'חודש תשלום')}</span><select data-field="month">${opt}</select></label>`;
    }
    if (e.freq === 'varying') {
      more += `<div class="month-grid">${C.MONTHS.map((mn, m) => `<label><span>${mn}</span><input class="amt" inputmode="decimal" data-field="v" data-m="${m}" value="${inputVal((e.values || [])[m])}" placeholder="0"></label>`).join('')}</div>`;
    }
    if (coll === 'expenses' && openMore.has(coll + id) && !(def && def.kind === 'saving')) {
      more += `<div class="mini-field"><span>סוג ההוצאה</span><div class="seg">${Object.entries(C.TYPES).map(([k, t]) => `<button type="button" data-act="type" data-val="${k}" class="${type === k ? 'on' : ''}">${t.label}</button>`).join('')}</div></div>`;
    }
    if (opts.custom) more += `<button type="button" class="link danger" data-act="del">מחיקת הסעיף</button>`;

    const amountCtl = e.freq === 'varying'
      ? `<div class="amount varying-sum">${money(E.sum((e.values || []).map(E.num)))}<small>בשנה</small></div>`
      : `<label class="amount"><span aria-hidden="true">₪</span><input class="amt" inputmode="decimal" data-field="amount" value="${inputVal(e.amount)}" placeholder="0" aria-label="סכום – ${esc(name)}"></label>`;

    const employment = opts.employment
      ? `<div class="seg small">${[['salaried', 'שכיר'], ['self', 'עצמאי']].map(([k, l]) => `<button type="button" data-act="employment" data-val="${k}" class="${(e.employment || 'salaried') === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';

    return `<div class="entry ${entryFilled(e) ? 'filled' : ''}" data-coll="${coll}" data-id="${id}">
      <div class="entry-head">
        <div class="entry-name">
          ${opts.custom ? `<input class="name-input" data-field="name" value="${esc(e.name)}" placeholder="${coll === 'incomes' ? 'שם מקור ההכנסה' : 'שם ההוצאה'}">` : `<span>${esc(name)}</span>`}
          ${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}
          ${employment}
        </div>
        <div class="entry-ctrls">
          ${amountCtl}
          ${freqSelect(e)}
          <button type="button" class="icon-btn" data-act="more" aria-label="אפשרויות נוספות" aria-expanded="${open}">⋯</button>
        </div>
      </div>
      <div class="entry-eq">${eqText(e)}</div>
      ${open && more ? `<div class="entry-more">${more}</div>` : ''}
    </div>`;
  }

  /* ---------- סיכום חי ---------- */
  function liveSummary() {
    return `<aside class="live" aria-live="polite">
      <h3>מצב פיננסי</h3>
      <dl>
        <div><dt>הכנסות חודשיות</dt><dd id="live-income"></dd></div>
        <div><dt>הוצאות חודשיות</dt><dd id="live-expense"></dd></div>
        <div class="big"><dt>עודף חודשי</dt><dd id="live-surplus"></dd></div>
        <div><dt>שיעור חיסכון</dt><dd id="live-rate"></dd></div>
        <div><dt>פוטנציאל השקעה</dt><dd id="live-invest"></dd></div>
      </dl>
    </aside>`;
  }
  function updateLive() {
    const r = compute();
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('live-income', money(r.monthly_income));
    set('live-expense', money(r.monthly_expenses));
    set('live-surplus', money(r.monthly_surplus, tone(r.monthly_surplus)));
    set('live-rate', r.monthly_income ? pct(r.savings_rate) : '—');
    set('live-invest', money(r.investment_capacity));
    document.querySelectorAll('[data-total-cat]').forEach(el => {
      const c = r.byCategory.find(x => x.id === el.dataset.totalCat);
      el.innerHTML = money(c ? c.monthly : 0);
    });
    document.querySelectorAll('[data-total="income"]').forEach(el => { el.innerHTML = money(r.monthly_income); });
    const bar = document.getElementById('progress-fill');
    if (bar) {
      const p = completion();
      bar.style.width = Math.round(p * 100) + '%';
      document.getElementById('progress-pct').textContent = Math.round(p * 100) + '%';
    }
    document.querySelectorAll('.step-chip').forEach(el => {
      const st = steps().find(s => s.id === el.dataset.step);
      if (st) el.classList.toggle('done', stepDone(st));
    });
  }

  /* ---------- מסך פתיחה ---------- */
  function viewWelcome() {
    return `<section class="welcome">
      <div class="welcome-card">
        <p class="eyebrow">ניהול תקציב משק הבית</p>
        <h1>כמה כסף באמת נשאר לכם להשקעה?</h1>
        <p class="lead">מזינים כמה נתונים על ההכנסות וההוצאות — והמערכת מחשבת את העודף החודשי, מראה לאן הולך הכסף, ומציגה כמה אפשר לחסוך ולהשקיע.</p>
        <ol class="how">
          <li><b>מזינים</b><span>הכנסות והוצאות, בתהליך קצר לפי נושאים</span></li>
          <li><b>מבינים</b><span>לוח בקרה, התפלגות הוצאות ותזרים שנתי</span></li>
          <li><b>פועלים</b><span>תובנות, פוטנציאל חיסכון וסימולציות "מה אם"</span></li>
        </ol>
        <div class="actions">
          <a class="btn primary" href="#/wizard/household">בואו נתחיל</a>
          <button class="btn ghost" data-act="sample">הצגת דוגמה</button>
        </div>
        <p class="fine">הנתונים נשמרים אוטומטית במכשיר הזה בלבד. כ-10 דקות מילוי.</p>
      </div>
    </section>`;
  }

  /* ---------- תהליך המילוי ---------- */
  function viewWizard(stepId) {
    const list = steps();
    let idx = list.findIndex(s => s.id === stepId);
    if (idx < 0) idx = 0;
    const st = list[idx];
    if (st.id === 'finish') return viewFinish(list, idx);
    const p = completion();
    const chips = list.map((s, i) => `<a class="step-chip ${i === idx ? 'current' : ''} ${stepDone(s) ? 'done' : ''}" data-step="${s.id}" href="#/wizard/${s.id}"><span class="dot"></span>${s.label}</a>`).join('');

    let body = '';
    if (st.id === 'household') body = stepHousehold();
    else if (st.id === 'income') body = stepIncome();
    else body = stepCategory(st.cat);

    const prev = idx > 0 ? `<a class="btn ghost" href="#/wizard/${list[idx - 1].id}">→ הקודם</a>` : '<span></span>';
    const next = list[idx + 1];
    return `<section class="wizard">
      <div class="progress">
        <div class="progress-top"><span>השלמת התקציב · שלב ${idx + 1} מתוך ${list.length}</span><b id="progress-pct">${Math.round(p * 100)}%</b></div>
        <div class="progress-bar"><div id="progress-fill" style="width:${Math.round(p * 100)}%"></div></div>
        <nav class="step-chips" aria-label="שלבים">${chips}</nav>
      </div>
      <div class="wizard-grid">
        <div class="wizard-main">
          ${body}
          <div class="wizard-nav">
            ${prev}
            <div class="right">
              ${st.id !== 'household' ? `<a class="link" href="#/wizard/${next.id}">דילוג</a>` : ''}
              <button class="btn primary" data-act="next" data-step="${st.id}" data-next="${next.id}">${next.id === 'finish' ? 'לסיכום' : 'הבא'} ←</button>
            </div>
          </div>
        </div>
        ${liveSummary()}
      </div>
    </section>`;
  }

  function stepHousehold() {
    const h = state.household;
    const stepper = (key, label, min, max) => `<div class="field"><span class="label">${label}</span>
      <div class="stepper"><button type="button" data-act="hh-step" data-hh="${key}" data-d="1" aria-label="הוספה">+</button><b>${h[key]}</b><button type="button" data-act="hh-step" data-hh="${key}" data-d="-1" aria-label="הפחתה" ${h[key] <= min ? 'disabled' : ''}>−</button></div>
      <input type="hidden" data-min="${min}" data-max="${max}" data-hh-range="${key}"></div>`;
    const toggle = (key, label, sub) => `<label class="toggle"><input type="checkbox" data-hh="${key}" ${h[key] ? 'checked' : ''}><span class="track"></span><span class="t-label">${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
    const moneyField = (key, label, help, ph) => `<label class="field"><span class="label">${label}</span><span class="amount wide"><span aria-hidden="true">₪</span><input class="amt" inputmode="decimal" data-hh="${key}" value="${inputVal(h[key])}" placeholder="${ph || '0'}"></span>${help ? `<small class="help">${help}</small>` : ''}</label>`;
    const r = compute();
    return `<div class="card">
      <div class="card-head"><h2>👪 פרטי משק הבית</h2><p>כמה שאלות קצרות, כדי שנציג לכם רק את מה שרלוונטי.</p></div>
      <div class="form-grid">
        ${stepper('adults', 'מבוגרים', 1, 6)}
        ${stepper('kids', 'ילדים', 0, 12)}
      </div>
      <div class="field"><span class="label">מגורים</span>
        <div class="seg wrap">${[['rent', 'שכירות'], ['mortgage', 'בבעלות עם משכנתא'], ['own', 'בבעלות ללא משכנתא'], ['family', 'אצל המשפחה']].map(([k, l]) => `<button type="button" data-act="hh-set" data-hh="housing" data-val="${k}" class="${h.housing === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="toggles">
        ${toggle('hasCar', 'יש לנו רכב')}
        ${h.hasCar ? stepper('cars', 'מספר כלי רכב', 1, 6) : ''}
        ${toggle('hasLoans', 'יש לנו הלוואות')}
        ${toggle('hasProperty', 'יש לנו נכס מניב', 'דירה להשכרה וכד׳')}
        ${toggle('hasBusiness', 'יש לנו הכנסה מעסק')}
        ${toggle('hasPortfolio', 'יש לנו תיק השקעות')}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>🎯 יעדים וכרית ביטחון</h2><p>לא חובה — אבל זה משפר את התובנות.</p></div>
      <div class="form-grid">
        ${moneyField('monthlyInvestGoal', 'יעד השקעה חודשי רצוי', '')}
        ${moneyField('liquidSavings', 'חיסכון נזיל קיים', 'כסף זמין (עו"ש, פיקדונות) — לחישוב כרית הביטחון')}
        ${moneyField('bufferMonthly', 'סכום חודשי שנשאיר בצד לביטחון', 'נגרע מהעודף לפני חישוב יכולת ההשקעה. ריק = 10% מההוצאות', r.suggestedBuffer ? inputVal(r.suggestedBuffer) : '0')}
      </div>
    </div>`;
  }

  function stepIncome() {
    const h = state.household;
    const rows = C.INCOMES.filter(d => C.visible(d, h)).map(d => entryRow('incomes', d.key, d.name, { employment: d.employment })).join('');
    const custom = Object.entries(state.incomes).filter(([, e]) => e.custom).map(([id, e]) => entryRow('incomes', id, e.name, { custom: true })).join('');
    return `<div class="card">
      <div class="card-head"><h2>💼 הכנסות</h2><p>סכומים נטו. לכל מקור אפשר לבחור תדירות: חודשי, שנתי, חד-פעמי או משתנה לפי חודש — והמערכת ממירה לממוצע חודשי.</p></div>
      <div class="entries">${rows}${custom}</div>
      <button type="button" class="btn add" data-act="add" data-coll="incomes">+ הוספת מקור הכנסה</button>
      <div class="card-total"><span>סה"כ הכנסה חודשית ממוצעת</span><b data-total="income">${money(compute().monthly_income)}</b></div>
    </div>`;
  }

  function stepCategory(cat) {
    const h = state.household;
    const rows = cat.items.filter(it => C.visible(it, h)).map(it => entryRow('expenses', it.key, it.name, { hint: it.hint })).join('');
    const custom = Object.entries(state.expenses).filter(([, e]) => e.custom && e.cat === cat.id).map(([id, e]) => entryRow('expenses', id, e.name, { custom: true })).join('');
    const r = compute(), c = r.byCategory.find(x => x.id === cat.id);
    const notes = {
      housing: 'הוצאות שמשולמות כל חודשיים (ארנונה, מים) — בחרו "דו-חודשי" והזינו את סכום החשבון.',
      transport: 'ביטוח וטסט — הזינו את הסכום השנתי ובחרו "שנתי". המערכת תחלק ל-12.',
      leisure: 'חופשות ואירועים — הזינו סכום שנתי ובחרו את החודש הצפוי, כדי לראות את ההשפעה על התזרים.',
      other: 'כאן מוסיפים כל הוצאה שלא מצאה מקום: תחביבים, ציוד, נסיעות עבודה...'
    };
    return `<div class="card">
      <div class="card-head"><h2>${cat.icon} ${cat.name}</h2>${notes[cat.id] ? `<p>${notes[cat.id]}</p>` : '<p>מלאו רק את מה שרלוונטי. שדה ריק = אין הוצאה.</p>'}</div>
      <div class="entries">${rows}${custom}</div>
      ${!rows && !custom ? '<p class="empty">אין עדיין סעיפים בקטגוריה הזו.</p>' : ''}
      <button type="button" class="btn add" data-act="add" data-coll="expenses" data-cat="${cat.id}">+ הוספת הוצאה</button>
      <div class="card-total"><span>סה"כ ${cat.name} (חודשי)</span><b data-total-cat="${cat.id}">${money(c.monthly)}</b></div>
    </div>`;
  }

  /* ---------- מסך סיום ---------- */
  function viewFinish(list, idx) {
    const r = compute();
    const ins = I.insights(r, state);
    const biggest = r.byCategory.filter(c => c.monthly).sort((a, b) => b.monthly - a.monthly)[0];
    const bullets = [];
    if (biggest) bullets.push(`${biggest.name} – הסעיף הגדול ביותר שלכם (${Math.round(biggest.pct * 100)}% מההוצאות).`);
    bullets.push(r.monthly_surplus >= 0 ? `יש לכם עודף חודשי חיובי של ${money(r.monthly_surplus)}.` : `קיים גירעון חודשי של ${money(r.monthly_surplus)} — כדאי לטפל בו קודם.`);
    if (r.investment_capacity > 0) bullets.push(`קיימת יכולת השקעה פוטנציאלית של כ-${money(r.investment_capacity)} בחודש.`);
    if (r.byType.variable) bullets.push(`צמצום של 10% בהוצאות המשתנות עשוי להגדיל את החיסכון בכ-${money(r.byType.variable * 0.1 * 12)} בשנה.`);
    const warn = ins.find(x => x.level === 'bad' || x.level === 'warn');
    if (warn && !/דיור|גירעון חודשי/.test(warn.title)) bullets.push(warn.text);
    const review = r.byCategory.filter(c => C.visible(C.catById[c.id], state.household)).map(c => `<li><a href="#/wizard/${c.id}"><span>${c.icon} ${c.name}</span>${money(c.monthly)}<em>עריכה</em></a></li>`).join('');

    return `<section class="finish">
      <a class="link back" href="#/wizard/${list[idx - 1].id}">→ חזרה לעריכה</a>
      <div class="finish-hero">
        <h1>התמונה הפיננסית שלכם</h1>
        <div class="finish-kpis">
          <div><span>הכנסות</span>${money(r.monthly_income)}<small>/ חודש</small></div>
          <div><span>הוצאות</span>${money(r.monthly_expenses)}<small>/ חודש</small></div>
          <div><span>עודף</span>${money(r.monthly_surplus, tone(r.monthly_surplus))}<small>/ חודש</small></div>
          <div><span>שיעור חיסכון</span>${r.monthly_income ? pct(r.savings_rate) : '—'}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card"><h2>💡 מה גילינו?</h2><ul class="bullets">${bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>
        <div class="card goal-card">
          <h2>🎯 היעד הבא שלכם</h2>
          ${goalBlock(r)}
          <div class="actions col">
            <a class="btn primary" href="#/simulator">התחל לבנות את תוכנית ההשקעה שלי</a>
            <a class="btn ghost" href="#/dashboard">ללוח הבקרה המלא</a>
          </div>
        </div>
      </div>
      <div class="card"><h2>סקירה ועריכה לפי קטגוריה</h2><ul class="review">${review}</ul></div>
    </section>`;
  }

  function goalBlock(r) {
    const goal = r.goal;
    if (!goal) return `<p class="muted">לא הוגדר יעד השקעה חודשי. <a href="#/wizard/household">הגדרת יעד</a></p><div class="goal-num"><span>יכולת השקעה חודשית</span>${money(r.investment_capacity)}</div>`;
    const p = Math.min(1, r.investment_capacity / goal);
    return `<div class="goal-num"><span>יעד השקעה חודשי</span>${money(goal)}</div>
      <div class="meter" role="img" aria-label="התקדמות ליעד ${Math.round(p * 100)}%"><div style="width:${p * 100}%"></div></div>
      <p class="muted">${r.investment_capacity >= goal ? `יכולת ההשקעה (${money(r.investment_capacity)}) עומדת ביעד.` : `יכולת ההשקעה הנוכחית ${money(r.investment_capacity)} — חסרים ${money(goal - r.investment_capacity)} בחודש.`}</p>`;
  }

  /* ---------- לוח בקרה ---------- */
  function kpi(label, value, sub, cls) {
    return `<div class="kpi ${cls || ''}"><span class="kpi-label">${label}</span><div class="kpi-value">${value}</div>${sub ? `<span class="kpi-sub">${sub}</span>` : ''}</div>`;
  }

  function alertsList(r) {
    const a = I.alerts(r);
    if (!a.length) return '';
    return `<ul class="alerts">${a.map(x => `<li class="lvl-${x.level}"><span class="lvl-icon" aria-hidden="true">${LEVEL[x.level].icon}</span><span class="sr">${LEVEL[x.level].label}: </span>${x.text}</li>`).join('')}</ul>`;
  }

  function ranking(r) {
    const cats = r.byCategory.filter(c => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);
    const max = cats[0] ? cats[0].monthly : 1;
    return `<ol class="ranking">${cats.map(c => `<li>
      <div class="rk-head"><span class="sw" style="background:${Ch.CAT_COLORS[c.id]}"></span><span class="rk-name">${c.icon} ${c.name}</span><span class="rk-val">${money(c.monthly)}</span><span class="rk-pct">${pct(c.pct)}</span></div>
      <div class="rk-bar"><div style="width:${(c.monthly / max) * 100}%;background:${Ch.CAT_COLORS[c.id]}"></div></div>
    </li>`).join('')}</ol>`;
  }

  function typeBreakdown(r) {
    const total = r.monthly_expenses || 1;
    const types = [
      { k: 'fixed', label: 'קבועות', color: '#2a78d6' }, { k: 'variable', label: 'משתנות', color: '#eb6834' },
      { k: 'once', label: 'חד-פעמיות / שנתיות', color: '#1baf7a' }, { k: 'saving', label: 'הפקדה לחיסכון', color: '#eda100' }
    ].filter(t => r.byType[t.k] > 0);
    const top = k => r.expenses.filter(e => (k === 'saving' ? e.kind === 'saving' : e.kind !== 'saving' && e.type === k)).sort((a, b) => b.monthly - a.monthly).slice(0, 3).map(e => esc(e.name)).join(' · ');
    return `<div class="stack" role="img" aria-label="חלוקת הוצאות לפי סוג">${types.map(t => `<div style="width:${(r.byType[t.k] / total) * 100}%;background:${t.color}" title="${t.label}"></div>`).join('')}</div>
      <ul class="type-list">${types.map(t => `<li><span class="sw" style="background:${t.color}"></span><div><b>${t.label}</b> ${money(r.byType[t.k])} · ${pct(r.byType[t.k] / total)}<small>${top(t.k)}</small></div></li>`).join('')}</ul>`;
  }

  function monthDetail(r) {
    const m = ui.month;
    return `<div class="month-picker" role="tablist">${C.MONTHS.map((mn, i) => `<button role="tab" aria-selected="${i === m}" data-act="month" data-val="${i}" class="${i === m ? 'on' : ''}">${mn.slice(0, 3)}</button>`).join('')}</div>
      <div class="month-detail"><b>${C.MONTHS[m]}</b>
        <span>הכנסות ${money(r.cashflow.income[m])}</span><span>הוצאות ${money(r.cashflow.expense[m])}</span><span>עודף ${money(r.cashflow.surplus[m], tone(r.cashflow.surplus[m]))}</span></div>`;
  }

  function cashTable(r) {
    return `<details class="table-view"><summary>הצגת התזרים כטבלה</summary><div class="table-wrap"><table>
      <thead><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>עודף</th></tr></thead>
      <tbody>${C.MONTHS.map((mn, i) => `<tr><td>${mn}</td><td>${money(r.cashflow.income[i])}</td><td>${money(r.cashflow.expense[i])}</td><td>${money(r.cashflow.surplus[i], tone(r.cashflow.surplus[i]))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>שנתי</td><td>${money(r.annual_income)}</td><td>${money(r.annual_expenses)}</td><td>${money(r.annual_surplus, tone(r.annual_surplus))}</td></tr></tfoot>
    </table></div></details>`;
  }

  function comparison(r) {
    if (ui.cmpAuto !== false) {
      // ברירת מחדל: החודש עם השינוי הגדול ביותר מול החודש שלפניו
      const f = r.cashflow.expense;
      let best = 1;
      for (let m = 1; m < 12; m++) if (Math.abs(f[m] - f[m - 1]) > Math.abs(f[best] - f[best - 1])) best = m;
      ui.cmpA = best - 1; ui.cmpB = best;
    }
    const opts = sel => C.MONTHS.map((mn, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${mn}</option>`).join('');
    const head = `<div class="cmp-controls"><select data-ui="cmpA" aria-label="חודש ראשון">${opts(ui.cmpA)}</select><span>מול</span><select data-ui="cmpB" aria-label="חודש שני">${opts(ui.cmpB)}</select></div>`;
    if (!E.hasMonthlyVariation(r)) return head + `<p class="muted">ההוצאות שלכם זהות בכל החודשים. כדי לראות השוואה, הגדירו הוצאות בתדירות "משתנה לפי חודש", או הוצאות שנתיות/חד-פעמיות עם חודש תשלום.</p>`;
    const rows = E.monthComparison(r, ui.cmpA, ui.cmpB);
    const big = rows.filter(x => x.change !== null && Math.abs(x.change) >= 0.1 && Math.abs(x.b - x.a) > 100).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    const chg = x => x.change === null ? '<span class="muted">חדש</span>' : `<bdi dir="ltr" class="num ${x.change > 0.005 ? 'up' : x.change < -0.005 ? 'down' : ''}">${x.change > 0 ? '+' : x.change < 0 ? '−' : ''}${Math.abs(Math.round(x.change * 100))}%</bdi>`;
    return head + `<div class="table-wrap"><table><thead><tr><th>קטגוריה</th><th>${C.MONTHS[ui.cmpA]}</th><th>${C.MONTHS[ui.cmpB]}</th><th>שינוי</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td>${x.icon} ${x.name}</td><td>${money(x.a)}</td><td>${money(x.b)}</td><td>${chg(x)}</td></tr>`).join('')}</tbody></table></div>
      ${big ? `<p class="note">נרשמה ${big.change > 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(Math.round(big.change * 100))}% בקטגוריית ${big.name} ב${C.MONTHS[ui.cmpB]} לעומת ${C.MONTHS[ui.cmpA]}.</p>` : ''}`;
  }

  function scoreMini(sc) {
    if (!sc) return '<p class="muted">הזינו הכנסות כדי לחשב ציון.</p>';
    return `<div class="score-ring lvl-${sc.level}" style="--p:${sc.total}"><b>${sc.total}</b><span>/100</span></div>
      <ul class="flags">${sc.parts.map(p => `<li class="lvl-${p.level}"><span class="lvl-icon" aria-hidden="true">${LEVEL[p.level].icon}</span>${p.label}</li>`).join('')}</ul>`;
  }

  function viewDashboard() {
    const r = compute();
    if (!hasData()) return viewWelcome();
    const sc = I.score(r);
    return `<section class="dash">
      <div class="page-head">
        <div><p class="eyebrow">לוח בקרה · ${state.year}</p><h1>התמונה הפיננסית שלכם</h1></div>
        <div class="head-actions"><a class="btn ghost sm" href="#/wizard/household">עריכת נתונים</a><a class="btn ghost sm" href="#/report">ייצוא דוח</a></div>
      </div>
      <div class="kpis">
        ${kpi('הכנסה חודשית', money(r.monthly_income))}
        ${kpi('הוצאות חודשיות', money(r.monthly_expenses))}
        ${kpi('עודף חודשי', money(r.monthly_surplus, tone(r.monthly_surplus)))}
        ${kpi('שיעור חיסכון', r.monthly_income ? pct(r.savings_rate) : '—', r.savings_deposits ? `כולל הפקדה לחיסכון ${money(r.savings_deposits)}` : '')}
        ${kpi('הכנסה פנויה שנתית', money(r.annual_surplus, tone(r.annual_surplus)))}
      </div>
      <div class="hero-invest card">
        <div>
          <p class="eyebrow">כמה אפשר להשקיע?</p>
          <div class="hero-num">${money(r.investment_capacity)}<small> בחודש</small></div>
          <p class="muted">${money(r.investment_capacity_annual)} פוטנציאל השקעה שנתי</p>
        </div>
        <div class="calc">
          <div><span>הכנסה</span>${money(r.monthly_income)}</div>
          <div><span>פחות הוצאות</span>${money(-r.monthly_expenses)}</div>
          <div class="sep"><span>עודף</span>${money(r.monthly_surplus, tone(r.monthly_surplus))}</div>
          <div><span>שמירה לכרית ביטחון</span>${money(-r.buffer)}</div>
          <div class="sep strong"><span>סכום פוטנציאלי להשקעה</span>${money(r.investment_capacity)}</div>
        </div>
      </div>
      ${alertsList(r)}
      <div class="card">
        <div class="card-head row"><h2>הכנסות מול הוצאות</h2><span class="muted">תזרים צפוי לאורך השנה</span></div>
        <div class="chart-box tall"><canvas id="ch-cash" aria-label="גרף הכנסות מול הוצאות לפי חודש" role="img"></canvas></div>
        ${monthDetail(r)}
        ${cashTable(r)}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>התפלגות ההוצאות</h2></div>
          <div class="donut-wrap"><div class="chart-box donut"><canvas id="ch-donut" role="img" aria-label="התפלגות הוצאות לפי קטגוריה"></canvas><div class="donut-center"><span>סה"כ</span>${money(r.monthly_expenses)}</div></div></div>
        </div>
        <div class="card"><div class="card-head"><h2>לאן הולך הכסף?</h2></div>${ranking(r)}</div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>קבועות, משתנות וחד-פעמיות</h2></div>${typeBreakdown(r)}</div>
        <div class="card">
          <div class="card-head row"><h2>הציון הפיננסי</h2><a class="link" href="#/insights">לכל התובנות ←</a></div>
          <div class="score-mini">${scoreMini(sc)}</div>
          <p class="fine">מדד פנימי וחינוכי בלבד. אינו דירוג אשראי ואינו ייעוץ פיננסי.</p>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>תחזית שנתית</h2></div>
          <dl class="forecast">
            <div><dt>הכנסות</dt><dd>${money(r.annual_income)}</dd></div>
            <div><dt>הוצאות</dt><dd>${money(r.annual_expenses)}</dd></div>
            <div><dt>עודף</dt><dd>${money(r.annual_surplus, tone(r.annual_surplus))}</dd></div>
            <div><dt>יכולת השקעה</dt><dd>${money(r.investment_capacity_annual)}</dd></div>
          </dl>
        </div>
        <div class="card goal-card"><div class="card-head"><h2>🎯 יעד השקעה</h2></div>${goalBlock(r)}</div>
      </div>
      <div class="card"><div class="card-head"><h2>השוואה בין חודשים</h2></div>${comparison(r)}</div>
    </section>`;
  }

  function afterDashboard() {
    const r = compute();
    if (!Ch.cashflow(document.getElementById('ch-cash'), r, m => { ui.month = m; rerender(); })) chartFallback('ch-cash');
    if (!Ch.donut(document.getElementById('ch-donut'), r)) chartFallback('ch-donut');
  }
  function chartFallback(id) {
    const el = document.getElementById(id);
    if (el) el.parentElement.innerHTML = '<p class="muted center">הגרף דורש חיבור לאינטרנט (טעינת ספריית הגרפים). הנתונים זמינים בטבלה.</p>';
  }

  /* ---------- תובנות ---------- */
  function viewInsights() {
    if (!hasData()) return viewWelcome();
    const r = compute(), sc = I.score(r), ins = I.insights(r, state);
    return `<section class="insights-page">
      <div class="page-head"><div><p class="eyebrow">ניתוח</p><h1>התובנות שלכם</h1></div></div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>הציון הפיננסי שלכם</h2></div>
          ${sc ? `<div class="score-big"><div class="score-ring lvl-${sc.level}" style="--p:${sc.total}"><b>${sc.total}</b><span>/100</span></div>
            <ul class="parts">${sc.parts.map(p => `<li class="lvl-${p.level}"><div class="p-head"><span><span class="lvl-icon" aria-hidden="true">${LEVEL[p.level].icon}</span> ${p.label}</span><b>${p.points}/${p.w}</b></div><div class="meter thin"><div style="width:${(p.points / p.w) * 100}%"></div></div></li>`).join('')}</ul></div>` : '<p class="muted">הזינו הכנסות כדי לחשב ציון.</p>'}
          <p class="fine">הציון הוא מדד פנימי וחינוכי המבוסס על שיעור חיסכון, הוצאות קבועות, חוב, דיור, יציבות הכנסה, כרית ביטחון ויכולת השקעה. אינו המלצה פיננסית אישית ואינו דירוג אשראי.</p>
        </div>
        <div class="card"><div class="card-head"><h2>התראות</h2></div>${alertsList(r) || '<p class="muted">אין התראות.</p>'}</div>
      </div>
      <div class="insight-list">${ins.map(x => `<article class="insight lvl-${x.level}"><div class="ins-icon" aria-hidden="true">${x.icon}</div><div><h3>${x.title} <span class="badge lvl-${x.level}">${LEVEL[x.level].label}</span></h3><p>${x.text}</p></div></article>`).join('')}</div>
      <div class="card">
        <div class="card-head row"><h2>פוטנציאל חיסכון</h2>
          <label class="inline-range">צמצום של <b data-label="potentialCut">${Math.round(ui.potentialCut * 100)}%</b><input type="range" min="5" max="50" step="5" value="${ui.potentialCut * 100}" data-ui="potentialCut"></label></div>
        <div id="pot-out">${potentialTable(r)}</div>
      </div>
    </section>`;
  }
  function potentialTable(r) {
    const pot = I.savingsPotential(r, ui.potentialCut);
    const potTotal = E.sum(pot.map(p => p.saveMonthly));
    if (!pot.length) return '<p class="muted">לא נמצאו סעיפים הניתנים לצמצום.</p>';
    return `<div class="table-wrap"><table class="potential">
      <thead><tr><th>סעיף</th><th>היום (חודשי)</th><th>% מההוצאות</th><th>סוג</th><th>חיסכון בחודש</th><th>חיסכון בשנה</th></tr></thead>
      <tbody>${pot.map(p => `<tr><td>${esc(p.name)}</td><td>${money(p.monthly)}</td><td>${pct(p.pctOfExpenses)}</td><td>${C.TYPES[p.type].label}</td><td>${money(p.saveMonthly)}</td><td><b>${money(p.saveAnnual)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">סה"כ אם תצמצמו את כל הסעיפים האלה</td><td>${money(potTotal)}</td><td><b>${money(potTotal * 12)}</b></td></tr></tfoot>
    </table></div>`;
  }

  /* ---------- סימולטור "מה אם" ---------- */
  function simFactor(sim) {
    return it => {
      if (it.kind === 'saving') return 1;
      let f = 1 - sim.all;
      if (it.type === 'variable') f *= 1 - sim.variable;
      if (it.cat === sim.cat) f *= 1 - sim.catCut;
      return f;
    };
  }
  function simResult(base) {
    const after = E.compute(state, { expenseFactor: simFactor(ui.sim), extraIncome: ui.sim.income });
    // lowerBetter: בהוצאות, ירידה היא שינוי חיובי
    const delta = (a, b, isPct, lowerBetter) => {
      const d = b - a;
      if (isPct ? Math.abs(d) < 0.0005 : Math.abs(d) < 0.5) return '';
      const cls = (d > 0) !== !!lowerBetter ? 'up-good' : 'down-bad';
      const sign = d > 0 ? '+' : '−';
      return isPct
        ? `<span class="delta ${cls}"><bdi dir="ltr">${sign}${Math.abs(Math.round(d * 1000) / 10)}</bdi> נק׳</span>`
        : `<bdi dir="ltr" class="delta ${cls}">${sign}₪${fmt(d)}</bdi>`;
    };
    const row = (label, a, b, isPct, lowerBetter) => `<tr><td>${label}</td><td>${isPct ? pct(a) : money(a, tone(a))}</td><td><b>${isPct ? pct(b) : money(b, tone(b))}</b> ${delta(a, b, isPct, lowerBetter)}</td></tr>`;
    return `<h2>התוצאה</h2>
      <div class="table-wrap"><table class="sim-table"><thead><tr><th></th><th>היום</th><th>בתרחיש</th></tr></thead><tbody>
        ${row('הכנסה חודשית', base.monthly_income, after.monthly_income)}
        ${row('הוצאות חודשיות', base.monthly_expenses, after.monthly_expenses, false, true)}
        ${row('עודף חודשי', base.monthly_surplus, after.monthly_surplus)}
        ${row('שיעור חיסכון', base.savings_rate, after.savings_rate, true)}
        ${row('יכולת השקעה חודשית', base.investment_capacity, after.investment_capacity)}
        ${row('יכולת השקעה שנתית', base.investment_capacity_annual, after.investment_capacity_annual)}
      </tbody></table></div>
      ${after.investment_capacity - base.investment_capacity > 0.5 ? `<p class="note">בתרחיש הזה תוכלו להשקיע עוד <b>${money((after.investment_capacity - base.investment_capacity) * 12)}</b> בשנה.</p>` : ''}`;
  }
  function refreshSim() {
    const out = document.getElementById('sim-out');
    if (out) out.innerHTML = simResult(compute());
    ['all', 'variable', 'catCut'].forEach(k => { const b = app.querySelector(`[data-label="${k}"]`); if (b) b.textContent = Math.round(ui.sim[k] * 100) + '%'; });
  }

  function viewSimulator() {
    if (!hasData()) return viewWelcome();
    const base = compute(), sim = ui.sim;
    const cats = base.byCategory.filter(c => c.monthly > 0);
    const restaurants = base.expenses.find(e => e.id === 'restaurants') || I.savingsPotential(base)[0];
    const scen = [];
    const s10 = E.compute(state, { expenseFactor: it => (it.kind === 'saving' ? 1 : 0.9) });
    scen.push({ t: 'אם נחסוך עוד 10% מההוצאות', save: base.monthly_expenses - s10.monthly_expenses });
    if (restaurants) scen.push({ t: `אם נצמצם ${restaurants.name} ב-20%`, save: restaurants.monthly * 0.2 });
    const inc = E.compute(state, { extraIncome: 2000 });

    let plan = '';
    if (base.goal && base.investment_capacity < base.goal) {
      const gap = base.goal - base.investment_capacity;
      const varCut = base.byType.variable ? gap / base.byType.variable : null;
      plan = `<div class="card plan"><h2>🎯 הדרך ליעד ${money(base.goal)} בחודש</h2>
        <p>חסרים כרגע ${money(gap)} בחודש. אפשרויות להגיע ליעד:</p>
        <ul class="bullets">
          ${varCut !== null && varCut <= 0.6 ? `<li>צמצום של כ-${Math.ceil(varCut * 100)}% בהוצאות המשתנות</li>` : ''}
          <li>הגדלת ההכנסה החודשית ב-${money(gap)}</li>
          <li>שילוב: צמצום ${money(gap / 2)} בהוצאות + תוספת הכנסה של ${money(gap / 2)}</li>
        </ul></div>`;
    } else if (base.goal) {
      plan = `<div class="card plan good"><h2>🎯 היעד שלכם בהישג יד</h2><p>יכולת ההשקעה (${money(base.investment_capacity)}) עומדת ביעד של ${money(base.goal)} בחודש. ${base.investment_capacity > base.goal ? `נותרים עוד ${money(base.investment_capacity - base.goal)} מעבר ליעד.` : ''}</p></div>`;
    }

    return `<section class="simulator">
      <div class="page-head"><div><p class="eyebrow">סימולציה</p><h1>מה אם?</h1></div><button class="btn ghost sm" data-act="sim-reset">איפוס</button></div>
      <div class="scenarios">
        ${scen.map(s => `<div class="scenario"><h3>${esc(s.t)}</h3><div class="sc-num">${money(s.save)}<small> לחודש</small></div><span class="muted">${money(s.save * 12)} בשנה</span></div>`).join('')}
        <div class="scenario"><h3>אם נגדיל את ההכנסה ב-₪2,000</h3><div class="sc-num">${money(inc.investment_capacity)}</div><span class="muted">יכולת ההשקעה תעלה מ-${money(base.investment_capacity)}</span></div>
      </div>
      <div class="grid-2">
        <div class="card controls">
          <h2>בנו תרחיש משלכם</h2>
          <label class="range"><span>צמצום כלל ההוצאות <b data-label="all">${Math.round(sim.all * 100)}%</b></span><input type="range" min="0" max="30" step="1" value="${sim.all * 100}" data-sim="all"></label>
          <label class="range"><span>צמצום ההוצאות המשתנות <b data-label="variable">${Math.round(sim.variable * 100)}%</b></span><input type="range" min="0" max="50" step="1" value="${sim.variable * 100}" data-sim="variable"></label>
          <div class="range"><span>צמצום בקטגוריה
            <select data-sim="cat">${cats.map(c => `<option value="${c.id}" ${c.id === sim.cat ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
            <b data-label="catCut">${Math.round(sim.catCut * 100)}%</b></span><input type="range" min="0" max="50" step="1" value="${sim.catCut * 100}" data-sim="catCut" aria-label="אחוז צמצום בקטגוריה"></div>
          <label class="field"><span class="label">תוספת הכנסה חודשית</span><span class="amount wide"><span aria-hidden="true">₪</span><input class="amt" inputmode="decimal" data-sim="income" value="${inputVal(sim.income || '')}" placeholder="0"></span></label>
        </div>
        <div class="card" id="sim-out">${simResult(base)}</div>
      </div>
      ${plan}
      <p class="fine">הסימולציה מציגה חישוב אריתמטי על בסיס הנתונים שהוזנו, לצורך המחשה בלבד, ואינה מהווה ייעוץ השקעות.</p>
    </section>`;
  }

  /* ---------- דוח (PDF) ---------- */
  function viewReport() {
    if (!hasData()) return viewWelcome();
    const r = compute(), sc = I.score(r), ins = I.insights(r, state);
    const today = new Date().toLocaleDateString('he-IL');
    return `<section class="report">
      <div class="report-tools no-print">
        <button class="btn primary" data-act="print">הדפסה / שמירה כ-PDF</button>
        <button class="btn ghost" data-act="excel">ייצוא ל-Excel</button>
        <span class="muted">בחלון ההדפסה בחרו "שמירה כ-PDF".</span>
      </div>
      <header class="report-head"><h1>דוח תקציב משק הבית</h1><p>שנת ${state.year} · הופק ב-${today}</p></header>
      <div class="kpis">
        ${kpi('הכנסה חודשית', money(r.monthly_income))}${kpi('הוצאות חודשיות', money(r.monthly_expenses))}
        ${kpi('עודף חודשי', money(r.monthly_surplus, tone(r.monthly_surplus)))}${kpi('שיעור חיסכון', pct(r.savings_rate))}
        ${kpi('יכולת השקעה', money(r.investment_capacity), money(r.investment_capacity_annual) + ' בשנה')}
      </div>
      <h2>מאזן שנתי</h2>
      <dl class="forecast"><div><dt>הכנסות</dt><dd>${money(r.annual_income)}</dd></div><div><dt>הוצאות</dt><dd>${money(r.annual_expenses)}</dd></div><div><dt>עודף</dt><dd>${money(r.annual_surplus, tone(r.annual_surplus))}</dd></div><div><dt>יכולת השקעה</dt><dd>${money(r.investment_capacity_annual)}</dd></div></dl>
      <div class="report-charts">
        <div><h2>הכנסות מול הוצאות</h2><div class="chart-box tall"><canvas id="rep-cash"></canvas></div></div>
        <div><h2>התפלגות הוצאות</h2><div class="chart-box donut"><canvas id="rep-donut"></canvas></div></div>
      </div>
      <h2>הוצאות לפי קטגוריה</h2>
      <table><thead><tr><th>קטגוריה</th><th>חודשי</th><th>שנתי</th><th>%</th></tr></thead><tbody>
        ${r.byCategory.filter(c => c.monthly).sort((a, b) => b.monthly - a.monthly).map(c => `<tr><td><span class="sw" style="background:${Ch.CAT_COLORS[c.id]}"></span> ${c.name}</td><td>${money(c.monthly)}</td><td>${money(c.annual)}</td><td>${pct(c.pct)}</td></tr>`).join('')}
      </tbody></table>
      <h2>הכנסות</h2>
      <table><thead><tr><th>מקור</th><th>תדירות</th><th>חודשי</th><th>שנתי</th></tr></thead><tbody>
        ${r.incomes.map(i => `<tr><td>${esc(i.name)}</td><td>${C.FREQS[i.freq] ? C.FREQS[i.freq].label : ''}</td><td>${money(i.monthly)}</td><td>${money(i.annual)}</td></tr>`).join('')}
      </tbody></table>
      <h2>פירוט הוצאות</h2>
      <table><thead><tr><th>סעיף</th><th>קטגוריה</th><th>סוג</th><th>חודשי</th><th>שנתי</th></tr></thead><tbody>
        ${r.expenses.slice().sort((a, b) => b.monthly - a.monthly).map(e => `<tr><td>${esc(e.name)}</td><td>${C.catById[e.cat].name}</td><td>${e.kind === 'saving' ? 'חיסכון' : C.TYPES[e.type].label}</td><td>${money(e.monthly)}</td><td>${money(e.annual)}</td></tr>`).join('')}
      </tbody></table>
      <h2>ציון פיננסי ${sc ? `· ${sc.total}/100` : ''}</h2>
      ${sc ? `<ul class="flags inline">${sc.parts.map(p => `<li class="lvl-${p.level}"><span class="lvl-icon">${LEVEL[p.level].icon}</span>${p.label} ${p.points}/${p.w}</li>`).join('')}</ul>` : ''}
      <h2>תובנות</h2>
      <ul class="report-insights">${ins.map(x => `<li><b>${x.icon} ${x.title}:</b> ${x.text}</li>`).join('')}</ul>
      <h2>מטרות</h2>
      ${goalBlock(r)}
      <p class="fine">הדוח מבוסס על הנתונים שהוזנו ומיועד לצורכי מידע והמחשה בלבד. אינו מהווה ייעוץ השקעות, ייעוץ פיננסי אישי או דירוג אשראי.</p>
    </section>`;
  }
  function afterReport() {
    const r = compute();
    if (!Ch.cashflow(document.getElementById('rep-cash'), r)) chartFallback('rep-cash');
    if (!Ch.donut(document.getElementById('rep-donut'), r)) chartFallback('rep-donut');
  }

  /* ---------- ניתוב ---------- */
  function route() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    return { view: parts[0] || (hasData() ? 'dashboard' : 'welcome'), arg: parts[1] };
  }

  function render() {
    const { view, arg } = route();
    const key = view + '/' + (arg || '');
    let html, after = null;
    switch (view) {
      case 'wizard': html = viewWizard(arg || 'household'); after = updateLive; break;
      case 'dashboard': html = viewDashboard(); after = hasData() ? afterDashboard : null; break;
      case 'insights': html = viewInsights(); break;
      case 'simulator': html = viewSimulator(); break;
      case 'report': html = viewReport(); after = hasData() ? afterReport : null; break;
      default: html = viewWelcome();
    }
    app.innerHTML = html;
    if (after) after();
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view || (view === 'welcome' && a.dataset.nav === 'dashboard')));
    if (key !== ui.lastRoute) { window.scrollTo(0, 0); ui.lastRoute = key; }
  }
  function rerender() {
    const y = window.scrollY, active = document.activeElement;
    const sel = active && active.dataset ? Object.entries(active.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"]`).join('') : '';
    render();
    window.scrollTo(0, y);
    if (sel) { const el = app.querySelector(sel); if (el) el.focus(); }
  }

  /* ---------- אירועים ---------- */
  function entryCtx(el) {
    const row = el.closest('.entry');
    return row ? { row, coll: row.dataset.coll, id: row.dataset.id } : null;
  }
  function refreshRow(ctx) {
    const def = ctx.coll === 'expenses' ? C.itemByKey[ctx.id] : C.incomeByKey[ctx.id];
    const e = getEntry(ctx.coll, ctx.id);
    const name = def ? def.name : e.name;
    const tmp = document.createElement('div');
    tmp.innerHTML = entryRow(ctx.coll, ctx.id, name, { hint: def && def.hint, custom: !!e.custom, employment: def && def.employment });
    ctx.row.replaceWith(tmp.firstElementChild);
  }

  app.addEventListener('input', ev => {
    const t = ev.target;
    // סעיפי הכנסה/הוצאה
    if (t.dataset.field && t.dataset.field !== 'freq' && t.dataset.field !== 'month') {
      const ctx = entryCtx(t); if (!ctx) return;
      const e = ensureEntry(ctx.coll, ctx.id);
      if (t.dataset.field === 'amount') e.amount = parseAmt(t.value);
      else if (t.dataset.field === 'v') { e.values = e.values || []; e.values[+t.dataset.m] = parseAmt(t.value); const vs = ctx.row.querySelector('.varying-sum'); if (vs) vs.innerHTML = money(E.sum(e.values.map(E.num))) + '<small>בשנה</small>'; }
      else if (t.dataset.field === 'name') e.name = t.value;
      ctx.row.classList.toggle('filled', entryFilled(e));
      ctx.row.querySelector('.entry-eq').innerHTML = eqText(e);
      persist(); updateLive();
      return;
    }
    // פרטי משק הבית (שדות כסף)
    if (t.dataset.hh && t.classList.contains('amt')) {
      state.household[t.dataset.hh] = parseAmt(t.value);
      persist(); updateLive();
      return;
    }
    if (t.dataset.sim) {
      const k = t.dataset.sim;
      if (k === 'income') ui.sim.income = E.num(parseAmt(t.value));
      else if (k !== 'cat') ui.sim[k] = +t.value / 100;
      refreshSim();
      return;
    }
    if (t.dataset.ui === 'potentialCut') {
      ui.potentialCut = +t.value / 100;
      app.querySelector('[data-label="potentialCut"]').textContent = Math.round(ui.potentialCut * 100) + '%';
      document.getElementById('pot-out').innerHTML = potentialTable(compute());
    }
  });

  app.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.field === 'freq' || t.dataset.field === 'month') {
      const ctx = entryCtx(t); if (!ctx) return;
      const e = ensureEntry(ctx.coll, ctx.id);
      if (t.dataset.field === 'freq') {
        e.freq = t.value;
        if (e.freq !== 'monthly') openMore.add(ctx.coll + ctx.id);
        if (e.freq === 'varying' && (!e.values || !e.values.length) && e.amount !== '') e.values = new Array(12).fill(e.amount);
        if (e.freq === 'bimonthly' && (e.month === '' || e.month > 1)) e.month = 0;
      } else e.month = t.value === '' ? '' : +t.value;
      refreshRow(ctx); persist(); updateLive();
      return;
    }
    if (t.dataset.hh && t.type === 'checkbox') { state.household[t.dataset.hh] = t.checked; persist(); rerender(); return; }
    if (t.dataset.hh && t.classList.contains('amt')) { t.value = inputVal(state.household[t.dataset.hh]); return; }
    if (t.classList.contains('amt')) {
      const ctx = entryCtx(t);
      if (ctx) {
        const e = getEntry(ctx.coll, ctx.id);
        // סכום ראשון בסעיף שנתי/חד-פעמי — לחשוף את בחירת החודש
        if (['annual', 'once', 'bimonthly'].includes(e.freq) && e.amount !== '' && !ctx.row.querySelector('.entry-more')) refreshRow(ctx);
        else t.value = inputVal(t.dataset.field === 'v' ? (e.values || [])[+t.dataset.m] : e.amount);
      }
    }
    if (t.dataset.sim === 'cat') { ui.sim.cat = t.value; refreshSim(); }
    if (t.dataset.sim === 'income') t.value = inputVal(ui.sim.income || '');
    if (t.dataset.ui === 'cmpA' || t.dataset.ui === 'cmpB') { ui[t.dataset.ui] = +t.value; ui.cmpAuto = false; rerender(); }
  });

  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, ctx = entryCtx(b);
    switch (act) {
      case 'more': openMore.has(ctx.coll + ctx.id) ? openMore.delete(ctx.coll + ctx.id) : openMore.add(ctx.coll + ctx.id); refreshRow(ctx); break;
      case 'type': ensureEntry(ctx.coll, ctx.id).type = b.dataset.val; refreshRow(ctx); persist(); updateLive(); break;
      case 'employment': ensureEntry(ctx.coll, ctx.id).employment = b.dataset.val; refreshRow(ctx); persist(); updateLive(); break;
      case 'del': delete state[ctx.coll][ctx.id]; persist(); rerender(); break;
      case 'add': {
        const id = 'c_' + Date.now().toString(36);
        state[b.dataset.coll][id] = { custom: true, name: '', amount: '', freq: 'monthly', month: '', values: [], cat: b.dataset.cat };
        persist(); rerender();
        const inp = app.querySelector(`.entry[data-id="${id}"] .name-input`); if (inp) inp.focus();
        break;
      }
      case 'hh-step': {
        const k = b.dataset.hh, rng = app.querySelector(`[data-hh-range="${k}"]`);
        state.household[k] = Math.max(+rng.dataset.min, Math.min(+rng.dataset.max, (+state.household[k] || 0) + +b.dataset.d));
        persist(); rerender(); break;
      }
      case 'hh-set': state.household[b.dataset.hh] = b.dataset.val; persist(); rerender(); break;
      case 'next': state.progress[b.dataset.step] = true; persist(); location.hash = '#/wizard/' + b.dataset.next; break;
      case 'month': ui.month = +b.dataset.val; rerender(); break;
      case 'sim-reset': ui.sim = { all: 0, variable: 0, cat: ui.sim.cat, catCut: 0, income: 0 }; rerender(); break;
      case 'sample':
        if (hasData() && !confirm('לטעון נתוני דוגמה? הנתונים הנוכחיים יוחלפו.')) break;
        state = S.sample(); persist(); location.hash = '#/dashboard'; render(); break;
      case 'print': window.print(); break;
      case 'excel': global.Exporter.excel(state); break;
      case 'backup': global.Exporter.backup(state); break;
      case 'restore': document.getElementById('restore-file').click(); break;
      case 'wipe':
        if (!confirm('למחוק את כל הנתונים מהמכשיר הזה? לא ניתן לשחזר (אלא מקובץ גיבוי).')) break;
        S.clear(); state = S.blank(); location.hash = '#/'; render(); break;
    }
    if (b.closest('details.menu')) b.closest('details.menu').open = false;
  });

  document.getElementById('restore-file').addEventListener('change', ev => {
    const f = ev.target.files[0]; if (!f) return;
    f.text().then(txt => {
      try { state = S.importJSON(txt); persist(); location.hash = '#/dashboard'; render(); }
      catch (e) { alert('לא ניתן לקרוא את קובץ הגיבוי.'); }
      ev.target.value = '';
    });
  });

  window.addEventListener('hashchange', render);
  render();

  global.App = { get state() { return state; }, compute };
})(window);
