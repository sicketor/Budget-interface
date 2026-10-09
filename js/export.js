/* ייצוא: Excel (SheetJS), PDF (דוח הדפסה של הדפדפן), גיבוי JSON. */
(function (global) {
  'use strict';
  const C = global.Catalog, E = global.Engine, I = global.Insights;
  const r0 = v => Math.round(v);

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function excel(state) {
    if (typeof global.XLSX === 'undefined') { alert('ייצוא Excel דורש חיבור לאינטרנט (טעינת ספריית SheetJS). נסו שוב כשיש חיבור.'); return; }
    const X = global.XLSX, r = E.compute(state), wb = X.utils.book_new();
    const sc = I.score(r);

    const summary = [
      ['מדד', 'חודשי', 'שנתי'],
      ['הכנסות', r0(r.monthly_income), r0(r.annual_income)],
      ['הוצאות', r0(r.monthly_expenses), r0(r.annual_expenses)],
      ['עודף / גירעון', r0(r.monthly_surplus), r0(r.annual_surplus)],
      ['כרית ביטחון שמורה', r0(r.buffer), r0(r.buffer * 12)],
      ['יכולת השקעה', r0(r.investment_capacity), r0(r.investment_capacity_annual)],
      [],
      ['שיעור חיסכון', I.pc(r.savings_rate)],
      ['הוצאות קבועות מההכנסה', I.pc(r.fixed_expense_ratio)],
      ['ציון פיננסי (מדד חינוכי)', sc ? sc.total + '/100' : '—'],
      [],
      ['קטגוריה', 'חודשי', 'שנתי', '% מההוצאות'],
      ...r.byCategory.filter(c => c.monthly).map(c => [c.name, r0(c.monthly), r0(c.annual), I.pc(c.pct)])
    ];
    const incomes = [['מקור', 'תדירות', 'שווי חודשי', 'שנתי'], ...r.incomes.map(i => [i.name, C.FREQS[i.freq] ? C.FREQS[i.freq].label : '', r0(i.monthly), r0(i.annual)])];
    const expenses = [['קטגוריה', 'סעיף', 'סוג', 'תדירות', 'שווי חודשי', 'שנתי'],
      ...r.expenses.map(e => [C.catById[e.cat].name, e.name, e.kind === 'saving' ? 'חיסכון' : C.TYPES[e.type].label, C.FREQS[e.freq] ? C.FREQS[e.freq].label : '', r0(e.monthly), r0(e.annual)])];
    const flow = [['חודש', 'הכנסות', 'הוצאות', 'עודף', ...r.byCategory.filter(c => c.monthly).map(c => c.name)],
      ...C.MONTHS.map((m, i) => [m, r0(r.cashflow.income[i]), r0(r.cashflow.expense[i]), r0(r.cashflow.surplus[i]), ...r.byCategory.filter(c => c.monthly).map(c => r0(c.flow[i]))])];
    const ins = [['רמה', 'נושא', 'תובנה'], ...I.insights(r, state).map(x => [x.level, x.title, x.text])];

    [['סיכום', summary], ['הכנסות', incomes], ['הוצאות', expenses], ['תזרים חודשי', flow], ['תובנות', ins]].forEach(([name, rows]) => {
      const ws = X.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 2 && name === 'תובנות' ? 90 : 18 }));
      X.utils.book_append_sheet(wb, ws, name);
    });
    wb.Workbook = { Views: [{ RTL: true }] };
    X.writeFile(wb, `דוח-תקציב-${state.year}.xlsx`);
  }

  function backup(state) {
    download(`גיבוי-תקציב-${new Date().toISOString().slice(0, 10)}.json`, new Blob([global.Store.exportJSON(state)], { type: 'application/json' }));
  }

  global.Exporter = { excel, backup };
})(window);
