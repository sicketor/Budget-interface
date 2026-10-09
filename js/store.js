/* שכבת אחסון. כרגע: שמירה אוטומטית בדפדפן (localStorage).
 * הממשק (load / save / clear / exportJSON / importJSON) מבודד את שאר האפליקציה,
 * כך שבשלב ה-Backend מחליפים רק את הקובץ הזה בקריאות API מאובטחות. */
(function (global) {
  'use strict';
  const KEY = 'household-budget.v1';
  const SCHEMA = 1;

  function blank() {
    return {
      schema: SCHEMA,
      year: new Date().getFullYear(),
      household: { adults: 2, kids: 0, housing: 'rent', hasCar: false, cars: 1, hasLoans: false, hasProperty: false, hasBusiness: false, hasPortfolio: false, liquidSavings: '', monthlyInvestGoal: '', bufferMonthly: '', age: '', horizon: '', riskTolerance: '', pensionType: '', hasStudyFund: '', pensionFeeDeposit: '', pensionFeeAccum: '' },
      incomes: {},
      expenses: {},
      progress: {},
      updatedAt: null
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const b = blank();
      return Object.assign(b, s, { household: Object.assign(b.household, s.household || {}) });
    } catch (e) { return null; }
  }

  let timer = null;
  function save(state, onSaved) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.updatedAt = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(state)); if (onSaved) onSaved(true); }
      catch (e) { if (onSaved) onSaved(false); }
    }, 350);
  }

  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  function exportJSON(state) { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    const s = JSON.parse(text);
    if (!s || typeof s !== 'object' || !s.household) throw new Error('קובץ לא תקין');
    const b = blank();
    return Object.assign(b, s, { household: Object.assign(b.household, s.household) });
  }

  // נתוני דוגמה — ערכי ינואר מהאקסל, בתוספת שתי הוצאות שנתיות להדגמת התזרים
  function sample() {
    const s = blank();
    Object.assign(s.household, { adults: 2, kids: 1, housing: 'rent', hasCar: true, cars: 1, hasPortfolio: true, liquidSavings: 45000, monthlyInvestGoal: 5000, age: 38, horizon: 'long', riskTolerance: 'medium', pensionType: 'pension' });
    const m = amount => ({ amount, freq: 'monthly' });
    s.incomes = { salary1: Object.assign(m(11000), { employment: 'salaried' }), salary2: Object.assign(m(11000), { employment: 'salaried' }), family: m(1000), portfolio: m(500) };
    s.expenses = {
      rent: m(4600), vaad: m(50), arnona: m(500), water: m(200), electricity: m(700), gas: m(40), cleaner: m(800), tv: m(100), internet: m(120), mobile: m(200),
      carIns: m(350), license: { amount: 1400, freq: 'annual', month: 4 }, fuel: m(1200), parking: m(300),
      daycare: m(5000), tutoring: m(500),
      groceries: m(1200), clothing: m(700), pets: m(200), hair: m(50),
      abroad: { amount: 12000, freq: 'annual', month: 7 }, restaurants: m(500), shows: m(200), babysitter: m(800),
      hmo: m(150), privateHealth: m(150)
    };
    return s;
  }

  global.Store = { load, save, clear, blank, sample, exportJSON, importJSON };
})(window);
