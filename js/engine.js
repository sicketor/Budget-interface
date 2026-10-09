/* Calculation Engine — שכבת חישוב נפרדת מה-UI. פונקציות טהורות בלבד (ללא DOM).
 *
 * כלל עקביות: לכל סעיף, סכום התזרים ב-12 החודשים == 12 × השווי החודשי.
 * כך הנתונים החודשיים והשנתיים תמיד מתיישבים (סעיף 29 במפרט).
 */
(function (global) {
  'use strict';
  const C = global.Catalog;

  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const hasMonth = m => m !== null && m !== undefined && m !== '';

  function monthlyEquivalent(e) {
    switch (e.freq) {
      case 'monthly': return num(e.amount);
      case 'bimonthly': return num(e.amount) / 2;
      case 'annual':
      case 'once': return num(e.amount) / 12;
      case 'varying': return sum((e.values || []).map(num)) / 12;
      default: return num(e.amount);
    }
  }

  // תזרים ל-12 חודשים: סכום שנתי/חד-פעמי עם חודש מוגדר נרשם בחודש התשלום; בלי חודש — נפרס שווה.
  function cashflow(e) {
    const a = num(e.amount), out = new Array(12).fill(0);
    switch (e.freq) {
      case 'bimonthly':
        for (let m = hasMonth(e.month) ? (+e.month % 2) : 0; m < 12; m += 2) out[m] = a;
        break;
      case 'annual':
      case 'once':
        if (hasMonth(e.month)) out[+e.month] = a; else out.fill(a / 12);
        break;
      case 'varying':
        for (let m = 0; m < 12; m++) out[m] = num((e.values || [])[m]);
        break;
      default:
        out.fill(a);
    }
    return out;
  }

  function resolveIncomes(state) {
    const h = state.household || {}, list = [];
    Object.entries(state.incomes || {}).forEach(([id, e]) => {
      const def = C.incomeByKey[id];
      if (def && !C.visible(def, h)) return;
      if (!def && !e.custom) return;
      const stable = def ? (def.employment ? e.employment !== 'self' : def.stable) : e.freq === 'monthly';
      const monthly = monthlyEquivalent(e);
      if (!monthly) return;
      list.push({ id, name: def ? def.name : (e.name || 'הכנסה נוספת'), freq: e.freq, stable, monthly, annual: monthly * 12, flow: cashflow(e) });
    });
    return list;
  }

  function resolveExpenses(state) {
    const h = state.household || {}, list = [];
    Object.entries(state.expenses || {}).forEach(([id, e]) => {
      let def = C.itemByKey[id];
      if (def) {
        const cat = C.catById[def.cat];
        if (!C.visible(def, h) || !C.visible(cat, h)) return;
      } else if (e.custom) {
        const cat = C.catById[e.cat] || C.catById.other;
        if (!C.visible(cat, h)) return;
        def = { cat: cat.id, name: e.name || 'הוצאה נוספת', type: 'variable', reducible: true };
      } else return;
      const monthly = monthlyEquivalent(e);
      if (!monthly) return;
      list.push({
        id, cat: def.cat, name: e.custom ? (e.name || def.name) : def.name,
        type: e.type || def.type || 'variable',
        kind: def.kind || 'spend',
        reducible: e.reducible !== undefined ? !!e.reducible : !!def.reducible,
        debt: !!def.debt, untracked: !!def.untracked,
        freq: e.freq, monthly, annual: monthly * 12, flow: cashflow(e)
      });
    });
    return list;
  }

  /* opts (לסימולציה):
   *   expenseFactor(item) → מכפיל לסעיף הוצאה (ברירת מחדל 1)
   *   extraIncome → תוספת הכנסה חודשית */
  function compute(state, opts) {
    opts = opts || {};
    const h = state.household || {};
    const incomes = resolveIncomes(state);
    if (num(opts.extraIncome)) {
      const x = num(opts.extraIncome);
      incomes.push({ id: '_sim', name: 'תוספת הכנסה (סימולציה)', freq: 'monthly', stable: true, monthly: x, annual: x * 12, flow: new Array(12).fill(x) });
    }
    const expenses = resolveExpenses(state).map(it => {
      const f = opts.expenseFactor ? opts.expenseFactor(it) : 1;
      if (f === 1) return it;
      return Object.assign({}, it, { monthly: it.monthly * f, annual: it.annual * f, flow: it.flow.map(v => v * f) });
    });

    const incomeMonthly = sum(incomes.map(i => i.monthly));
    const expenseMonthly = sum(expenses.map(e => e.monthly));
    const savingsDeposits = sum(expenses.filter(e => e.kind === 'saving').map(e => e.monthly));
    const consumption = expenseMonthly - savingsDeposits;
    const surplus = incomeMonthly - expenseMonthly;
    const pct = (a, b) => (b > 0 ? a / b : 0);

    const byType = { fixed: 0, variable: 0, once: 0, saving: 0 };
    expenses.forEach(e => { byType[e.kind === 'saving' ? 'saving' : e.type] += e.monthly; });

    const byCategory = C.CATEGORIES.map(c => {
      const items = expenses.filter(e => e.cat === c.id).sort((a, b) => b.monthly - a.monthly);
      const monthly = sum(items.map(i => i.monthly));
      const flow = new Array(12).fill(0);
      items.forEach(i => i.flow.forEach((v, m) => { flow[m] += v; }));
      return { id: c.id, name: c.name, icon: c.icon, monthly, annual: monthly * 12, pct: pct(monthly, expenseMonthly), items, flow };
    });

    const incomeFlow = new Array(12).fill(0), expenseFlow = new Array(12).fill(0);
    incomes.forEach(i => i.flow.forEach((v, m) => { incomeFlow[m] += v; }));
    expenses.forEach(e => e.flow.forEach((v, m) => { expenseFlow[m] += v; }));

    const suggestedBuffer = Math.round((consumption * 0.1) / 100) * 100;
    const buffer = hasMonth(h.bufferMonthly) ? num(h.bufferMonthly) : suggestedBuffer;
    const investMonthly = Math.max(0, surplus - buffer);
    const debtMonthly = sum(expenses.filter(e => e.debt).map(e => e.monthly));
    const housing = byCategory.find(c => c.id === 'housing').monthly;
    const stableIncome = sum(incomes.filter(i => i.stable).map(i => i.monthly));

    return {
      incomes, expenses, byCategory, byType,
      monthly_income: incomeMonthly,
      monthly_expenses: expenseMonthly,
      monthly_consumption: consumption,
      monthly_surplus: surplus,
      annual_income: incomeMonthly * 12,
      annual_expenses: expenseMonthly * 12,
      annual_surplus: surplus * 12,
      savings_deposits: savingsDeposits,
      savings_rate: pct(incomeMonthly - consumption, incomeMonthly),
      fixed_expense_ratio: pct(byType.fixed, incomeMonthly),
      fixed_share_of_expenses: pct(byType.fixed, expenseMonthly),
      debt_monthly: debtMonthly,
      debt_ratio: pct(debtMonthly, incomeMonthly),
      housing_ratio_income: pct(housing, incomeMonthly),
      stable_income_share: pct(stableIncome, incomeMonthly),
      emergency_months: consumption > 0 && hasMonth(h.liquidSavings) ? num(h.liquidSavings) / consumption : null,
      buffer, suggestedBuffer,
      investment_capacity: investMonthly,
      investment_capacity_annual: investMonthly * 12,
      goal: num(h.monthlyInvestGoal),
      cashflow: { income: incomeFlow, expense: expenseFlow, surplus: incomeFlow.map((v, m) => v - expenseFlow[m]) }
    };
  }

  // שינוי בין שני חודשים לכל קטגוריה (month_over_month_change)
  function monthComparison(result, a, b) {
    return result.byCategory
      .filter(c => c.flow[a] || c.flow[b])
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, a: c.flow[a], b: c.flow[b], change: c.flow[a] ? (c.flow[b] - c.flow[a]) / c.flow[a] : null }));
  }

  // יש נתונים שונים בין החודשים? (אחרת השוואה חודשית חסרת משמעות)
  function hasMonthlyVariation(result) {
    const f = result.cashflow.expense;
    return f.some(v => Math.abs(v - f[0]) > 0.5);
  }

  global.Engine = { num, sum, monthlyEquivalent, cashflow, resolveIncomes, resolveExpenses, compute, monthComparison, hasMonthlyVariation };
})(window);
