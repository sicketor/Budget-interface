/* מנוע תובנות, התראות, ציון פיננסי ופוטנציאל חיסכון. עובד על תוצאת Engine.compute בלבד. */
(function (global) {
  'use strict';
  const C = global.Catalog, E = global.Engine;

  const ils = v => '₪' + Math.round(Math.abs(v)).toLocaleString('he-IL');
  const pc = v => Math.round(v * 100) + '%';
  const clamp01 = x => Math.max(0, Math.min(1, x));
  // ניקוד לינארי: מלא ב-good, אפס ב-bad (עובד בשני הכיוונים)
  const lin = (v, good, bad) => clamp01((v - bad) / (good - bad));

  function score(r) {
    if (!r.monthly_income) return null;
    const parts = [
      { key: 'savings', label: 'שיעור חיסכון', w: 25, s: lin(r.savings_rate, 0.2, 0) },
      { key: 'fixed', label: 'הוצאות קבועות מההכנסה', w: 15, s: lin(r.fixed_expense_ratio, 0.5, 0.8) },
      { key: 'debt', label: 'רמת חוב', w: 15, s: lin(r.debt_ratio, 0.1, 0.4) * (r.expenses.some(e => e.id === 'overdraft') ? 0.6 : 1) },
      { key: 'housing', label: 'הוצאות דיור', w: 15, s: lin(r.housing_ratio_income, 0.3, 0.5) },
      { key: 'stability', label: 'יציבות הכנסה', w: 10, s: lin(r.stable_income_share, 0.8, 0.3) },
      { key: 'emergency', label: 'כרית ביטחון', w: 10, s: r.emergency_months === null ? 0.5 : lin(r.emergency_months, 6, 0) },
      { key: 'invest', label: 'יכולת השקעה', w: 10, s: lin(r.investment_capacity / r.monthly_income, 0.15, 0) }
    ];
    if (r.monthly_surplus < 0) parts[0].s = 0;
    parts.forEach(p => { p.points = Math.round(p.s * p.w); p.level = p.s >= 0.75 ? 'good' : p.s >= 0.4 ? 'warn' : 'bad'; });
    const total = parts.reduce((t, p) => t + p.points, 0);
    return { total, parts, level: total >= 75 ? 'good' : total >= 50 ? 'warn' : 'bad' };
  }

  function alerts(r) {
    const out = [];
    if (!r.monthly_income && !r.monthly_expenses) return out;
    if (r.monthly_surplus < 0) out.push({ level: 'bad', text: `ההוצאות גבוהות מההכנסות ב-${ils(r.monthly_surplus)} בחודש` });
    else out.push({ level: 'good', text: 'אין גירעון חודשי — התזרים חיובי' });
    if (r.fixed_expense_ratio > 0.6) out.push({ level: 'serious', text: `ההוצאות הקבועות מהוות ${pc(r.fixed_expense_ratio)} מההכנסה` });
    if (r.housing_ratio_income > 0.35) out.push({ level: 'serious', text: `הוצאות הדיור מהוות ${pc(r.housing_ratio_income)} מההכנסה` });
    if (r.expenses.some(e => e.id === 'overdraft')) out.push({ level: 'serious', text: 'משולמת ריבית על משיכת יתר (עו"ש)' });
    if (r.debt_ratio > 0.3) out.push({ level: 'serious', text: `החזרי החוב מהווים ${pc(r.debt_ratio)} מההכנסה` });
    const negMonths = r.cashflow.surplus.map((v, m) => ({ v, m })).filter(x => x.v < -0.5);
    if (r.monthly_surplus >= 0 && negMonths.length) out.push({ level: 'warn', text: `צפוי גירעון תזרימי ב${negMonths.map(x => C.MONTHS[x.m]).join(', ')}` });
    const leisure = r.byCategory.find(c => c.id === 'leisure');
    const f = leisure.flow, m = maxChangeMonth(f);
    if (m && m.change > 0.3 && m.delta > 300) out.push({ level: 'warn', text: `הוצאות הפנאי עולות ב-${pc(m.change)} ב${C.MONTHS[m.m]} לעומת החודש הקודם` });
    if (r.emergency_months !== null && r.emergency_months < 3) out.push({ level: 'warn', text: `כרית הביטחון מכסה ${r.emergency_months.toFixed(1)} חודשי הוצאות בלבד` });
    if (r.savings_rate >= 0.2) out.push({ level: 'good', text: `שיעור חיסכון גבוה — ${pc(r.savings_rate)}` });
    if (r.goal && r.investment_capacity >= r.goal) out.push({ level: 'good', text: 'יעד ההשקעה החודשי בהישג יד' });
    const order = { bad: 0, serious: 1, warn: 2, good: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  function maxChangeMonth(flow) {
    let best = null;
    for (let m = 1; m < 12; m++) {
      if (!flow[m - 1]) continue;
      const change = (flow[m] - flow[m - 1]) / flow[m - 1];
      if (!best || change > best.change) best = { m, change, delta: flow[m] - flow[m - 1] };
    }
    return best;
  }

  function savingsPotential(r, cut) {
    cut = cut === undefined ? 0.2 : cut;
    return r.expenses
      .filter(e => e.reducible && e.kind !== 'saving')
      .sort((a, b) => b.monthly - a.monthly)
      .map(e => ({ id: e.id, name: e.name, cat: e.cat, type: e.type, monthly: e.monthly, pctOfExpenses: r.monthly_expenses ? e.monthly / r.monthly_expenses : 0, saveMonthly: e.monthly * cut, saveAnnual: e.monthly * cut * 12 }));
  }

  function insights(r, state) {
    const out = [];
    if (!r.monthly_income) {
      out.push({ level: 'info', icon: '✍️', title: 'עוד לא הוזנו הכנסות', text: 'הזינו את ההכנסות כדי לקבל ניתוח מלא של משק הבית.' });
      return out;
    }
    const h = state.household || {};

    // 1. חיסכון
    const sr = r.savings_rate;
    if (r.monthly_surplus < 0) {
      out.push({ level: 'bad', icon: '💰', title: 'גירעון חודשי', text: `ההוצאות עולות על ההכנסות ב-${ils(r.monthly_surplus)} בחודש (${ils(r.monthly_surplus * 12)} בשנה). זהו הדבר הראשון שכדאי לטפל בו — לפני כל השקעה.` });
    } else {
      const lvl = sr >= 0.2 ? 'good' : sr >= 0.1 ? 'warn' : 'bad';
      const desc = sr >= 0.2 ? 'מדובר בשיעור חיסכון גבוה יחסית.' : sr >= 0.1 ? 'שיעור סביר, ויש מקום לשיפור — יעד מקובל הוא 20% ומעלה.' : 'שיעור נמוך. כדאי לבחון היכן ניתן לצמצם.';
      let text = `אתם חוסכים ${pc(sr)} מההכנסה החודשית (${ils(r.monthly_income - r.monthly_consumption)} בחודש). ${desc}`;
      if (r.savings_deposits) text += ` הנתון כולל הפקדה קבועה לחיסכון של ${ils(r.savings_deposits)}.`;
      out.push({ level: lvl, icon: '💰', title: 'יכולת חיסכון', text });
    }

    // 2. הקטגוריה הגדולה + דיור
    const cats = r.byCategory.filter(c => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);
    const housing = r.byCategory.find(c => c.id === 'housing');
    if (housing.monthly) {
      const lvl = r.housing_ratio_income > 0.35 ? 'warn' : 'good';
      out.push({ level: lvl, icon: '🏠', title: 'דיור', text: `הדיור מהווה ${pc(housing.pct)} מהוצאות משק הבית ו-${pc(r.housing_ratio_income)} מההכנסה.${lvl === 'warn' ? ' מדובר בסעיף משמעותי בתקציב — מעל לטווח המקובל (עד כ-30%–35% מההכנסה).' : ''}${cats[0] && cats[0].id === 'housing' ? ' זהו הסעיף הגדול ביותר שלכם.' : ''}` });
    }
    if (cats[0] && cats[0].id !== 'housing') {
      out.push({ level: 'info', icon: cats[0].icon, title: `הסעיף הגדול ביותר: ${cats[0].name}`, text: `${cats[0].name} מהווה ${pc(cats[0].pct)} מכלל ההוצאות (${ils(cats[0].monthly)} בחודש).` });
    }

    // 3. תחבורה
    const tr = r.byCategory.find(c => c.id === 'transport');
    if (tr.monthly) {
      const high = tr.pct > 0.15;
      out.push({ level: high ? 'warn' : 'info', icon: '🚗', title: 'תחבורה', text: `עלות התחבורה הכוללת היא ${ils(tr.monthly)} בחודש (${pc(tr.pct)} מההוצאות).${high ? ' כדאי לבדוק את עלויות הדלק, הביטוח והחניה.' : ''}` });
    }

    // 4. ההוצאה המשתנה הגדולה
    const bigVar = r.expenses.filter(e => e.type === 'variable' && e.reducible).sort((a, b) => b.monthly - a.monthly)[0];
    if (bigVar) out.push({ level: 'info', icon: '🔎', title: 'הוצאה משתנה בולטת', text: `${bigVar.name} (${ils(bigVar.monthly)} בחודש) היא אחת ההוצאות המשתנות הגדולות שלכם. צמצום של 20% יחסוך ${ils(bigVar.monthly * 0.2 * 12)} בשנה.` });

    // 5. ריבית עו"ש
    const od = r.expenses.find(e => e.id === 'overdraft');
    if (od) out.push({ level: 'bad', icon: '⚠️', title: 'ריבית עו"ש', text: `אתם משלמים כ-${ils(od.monthly)} בחודש ריבית על משיכת יתר — ${ils(od.annual)} בשנה. זה "כסף שהולך לאיבוד"; לרוב עדיף לסגור את המינוס לפני השקעה.` });

    // 6. מזומן ללא מעקב
    const untracked = E.sum(r.expenses.filter(e => e.untracked).map(e => e.monthly));
    if (untracked && untracked / r.monthly_expenses > 0.05) out.push({ level: 'warn', icon: '🕳️', title: 'כסף ללא מעקב', text: `${ils(untracked)} בחודש (${pc(untracked / r.monthly_expenses)} מההוצאות) יוצאים במזומן ללא מעקב. מעקב אחרי הסכום הזה הוא לרוב הדרך הקלה ביותר למצוא חיסכון.` });

    // 7. הוצאות קבועות
    if (r.fixed_expense_ratio > 0.6) out.push({ level: 'warn', icon: '🔒', title: 'הוצאות קבועות גבוהות', text: `${pc(r.fixed_expense_ratio)} מההכנסה מתחייבים מראש להוצאות קבועות. זה מקטין את הגמישות במקרה של ירידה בהכנסה.` });

    // 8. הוצאות שנתיות/חד-פעמיות
    const lumpy = r.expenses.filter(e => e.freq === 'annual' || e.freq === 'once');
    const lumpyAnnual = E.sum(lumpy.map(e => e.annual));
    if (lumpyAnnual > 0) out.push({ level: 'info', icon: '📅', title: 'הוצאות שנתיות וחד-פעמיות', text: `יש לכם ${ils(lumpyAnnual)} בשנה של הוצאות שאינן חודשיות (${lumpy.slice(0, 3).map(e => e.name).join(', ')}${lumpy.length > 3 ? ' ועוד' : ''}). הפרשה של ${ils(lumpyAnnual / 12)} בחודש לחשבון נפרד תמנע הפתעות בתזרים.` });

    // 9. חודשי גירעון
    const neg = r.cashflow.surplus.map((v, m) => ({ v, m })).filter(x => x.v < -0.5);
    if (neg.length && r.monthly_surplus >= 0) {
      const worst = neg.sort((a, b) => a.v - b.v)[0];
      out.push({ level: 'warn', icon: '📉', title: 'גירעון תזרימי בחלק מהחודשים', text: `למרות עודף שנתי, ב${C.MONTHS[worst.m]} צפוי גירעון של ${ils(worst.v)} בגלל הוצאות שמתרכזות באותו חודש.` });
    }

    // 10. כרית ביטחון
    if (r.emergency_months !== null) {
      const m = r.emergency_months;
      out.push({ level: m >= 6 ? 'good' : m >= 3 ? 'warn' : 'bad', icon: '🛟', title: 'כרית ביטחון', text: `החיסכון הנזיל מכסה כ-${m.toFixed(1)} חודשי הוצאות. ${m >= 6 ? 'מצוין — מעל 6 חודשים.' : 'מקובל לשאוף ל-3–6 חודשי הוצאות לפני השקעה לטווח ארוך.'}` });
    }

    // 11. יציבות הכנסה
    const top = r.incomes.slice().sort((a, b) => b.monthly - a.monthly)[0];
    if (r.incomes.length === 1 || (top && top.monthly / r.monthly_income > 0.8)) out.push({ level: 'info', icon: '🧷', title: 'ריכוזיות הכנסה', text: `${pc(top.monthly / r.monthly_income)} מההכנסה מגיעים ממקור אחד (${top.name}). כדאי לקחת זאת בחשבון בתכנון כרית הביטחון.` });

    // 12. צמצום הוצאות משתנות
    if (r.byType.variable > 0) out.push({ level: 'info', icon: '✂️', title: 'צמצום הוצאות משתנות', text: `צמצום של 10% בהוצאות המשתנות (${ils(r.byType.variable)} בחודש) עשוי להגדיל את החיסכון בכ-${ils(r.byType.variable * 0.1 * 12)} בשנה.` });

    // 13. השקעה ויעד
    if (r.monthly_surplus > 0) {
      let text = `בהתבסס על הנתונים שהזנתם, אחרי שמירת ${ils(r.buffer)} בחודש לכרית ביטחון, קיימת אפשרות להשקיע כ-${ils(r.investment_capacity)} בחודש (${ils(r.investment_capacity_annual)} בשנה).`;
      let lvl = 'good';
      if (r.goal) {
        if (r.investment_capacity >= r.goal) text += ` זה עומד ביעד שהגדרתם (${ils(r.goal)}).`;
        else { lvl = 'warn'; text += ` כדי להגיע ליעד של ${ils(r.goal)} חסרים ${ils(r.goal - r.investment_capacity)} בחודש.`; }
      }
      out.push({ level: lvl, icon: '📈', title: 'פוטנציאל השקעה', text });
    }
    // כללי הסדנה (js/playbook.js)
    if (global.Playbook) out.push(...global.Playbook.extraInsights(r, state));
    return out;
  }

  global.Insights = { score, alerts, insights, savingsPotential, ils, pc };
})(window);
