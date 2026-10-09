/* Playbook — כללי הסדנה "כסף, התנהלות פיננסית והשקעות נכונות" (סמארט טרייד) כמנוע חישוב.
 * פונקציות טהורות על תוצאת Engine.compute + state. אין כאן DOM.
 * המספרים (טווחי חיסכון, תקרות, דמי ניהול) הם כפי שהוצגו בסדנה — ראו SOURCE ליד כל נתון. */
(function (global) {
  'use strict';
  const E = global.Engine;
  const num = E.num;
  const hasVal = v => v !== null && v !== undefined && v !== '';

  /* ---------- מודל חשוב / דחוף (שקפים 21–22) ---------- */
  // סדר הטיפול בסדנה: חשוב ודחוף → חשוב ולא דחוף → לא חשוב אבל דחוף → לא חשוב ולא דחוף.
  // לצמצום מתחילים מהסוף: מה שלא חשוב ולא דחוף.
  const QUADRANTS = [
    { id: 'ninu', label: 'לא חשוב ולא דחוף', hint: 'כאן מתחילים לצמצם', color: '#e34948', cut: 1 },
    { id: 'niu', label: 'לא חשוב אבל דחוף', hint: 'לבדוק ולהוזיל', color: '#eb6834', cut: 2 },
    { id: 'inu', label: 'חשוב ולא דחוף', hint: 'לתכנן מראש', color: '#eda100', cut: 3 },
    { id: 'iu', label: 'חשוב ודחוף', hint: 'הבסיס — לא מוותרים', color: '#2a78d6', cut: 4 }
  ];
  const QUADRANT_OF = {
    // חשוב ודחוף: דיור, משכנתא, החזר הלוואות, מסגרות חינוך, מזון, חשבונות, טיפול רפואי דחוף
    rent: 'iu', mortgage: 'iu', vaad: 'iu', arnona: 'iu', water: 'iu', electricity: 'iu', gas: 'iu',
    loans: 'iu', overdraft: 'iu', daycare: 'iu', school: 'iu', university: 'iu', studyMaterials: 'iu',
    groceries: 'iu', hmo: 'iu', doctors: 'iu', meds: 'iu', baby: 'iu', familySupport: 'iu', pets: 'iu',
    publicTransport: 'iu', unexpected: 'iu',
    // חשוב ולא דחוף: חיסכון, ביטוחים, בילויים, לימודים, רכב, ביגוד, טיפולים לא דחופים, חופשה
    savingDeposit: 'inu', homeIns: 'inu', maintenance: 'inu', carIns: 'inu', license: 'inu', carService: 'inu',
    supplemental: 'inu', privateHealth: 'inu', otherIns: 'inu', clothing: 'inu', tutoring: 'inu',
    localTrips: 'inu', shows: 'inu', events: 'inu', courses: 'inu', babysitter: 'inu', donations: 'inu',
    // לא חשוב אבל דחוף: תקשורת ואינטרנט, דלק וחניה, עמלות, טיפולים קוסמטיים
    mobile: 'niu', internet: 'niu', homePhone: 'niu', fuel: 'niu', parking: 'niu', tolls: 'niu',
    fees: 'niu', hair: 'niu', cosmetics: 'niu', pharm: 'niu', cleaner: 'niu',
    // לא חשוב ולא דחוף: תשלומים כפולים, חדר כושר וחוגים, טיסות לחו"ל, הזמנת אוכל, טלוויזיה, אלכוהול וסיגריות
    tv: 'ninu', digital: 'ninu', papers: 'ninu', gym: 'ninu', kidsClasses: 'ninu', restaurants: 'ninu',
    abroad: 'ninu', cigarettes: 'ninu', alcohol: 'ninu', cash: 'ninu', atm: 'ninu', garden: 'ninu'
  };
  function quadrantOf(e) {
    if (QUADRANT_OF[e.id]) return QUADRANT_OF[e.id];
    return e.type === 'fixed' || e.type === 'once' ? 'inu' : 'niu'; // הוצאה מותאמת אישית
  }
  function matrix(r) {
    const total = r.monthly_expenses || 1;
    return QUADRANTS.map(q => {
      const items = r.expenses.filter(e => quadrantOf(e) === q.id).sort((a, b) => b.monthly - a.monthly);
      const monthly = E.sum(items.map(i => i.monthly));
      return Object.assign({}, q, { items, monthly, pct: monthly / total });
    });
  }

  /* ---------- דרכים לצמצום הוצאות (שקפים 23–28) ---------- */
  // min/max: טווח חיסכון חודשי בש"ח כפי שהוצג בסדנה. pct: אחוז מההוצאה בפועל.
  // alt: חלופות לאותה הוצאה — בסיכום נלקחת החלופה הטובה ביותר ולא סכום כולן.
  const TIPS = [
    { id: 'boiler', on: ['electricity'], area: 'חשמל', title: 'שעון שבת / טיימר לדוד', text: 'שעתיים עד שעתיים וחצי של חימום מספיקות למקלחות של 3–5 נפשות. כל שעת דוד עולה כ-1.5–2 ₪.', min: 30, max: 90 },
    { id: 'ac', on: ['electricity'], area: 'חשמל', title: 'מזגן על 22–25 מעלות', text: 'אין צורך ביותר או בפחות מזה. כל מעלה מוסיפה כ-5% לצריכת החשמל של המזגן.', min: 30, max: 250 },
    { id: 'smartHome', on: ['electricity'], area: 'חשמל', title: 'מתגים חכמים / ניהול חכם בבית', text: 'כיבוי אוטומטי של מכשירים ומזגנים כשאין איש בבית.', min: 50, max: 250 },
    { id: 'elecSupplier', on: ['electricity'], area: 'חשמל', title: 'מעבר לספק חשמל פרטי', text: 'ספקים פרטיים מציעים הנחה קבועה על תעריף חברת החשמל — בלי שינוי בתשתית.', pct: [0.04, 0.08] },
    { id: 'telecom', on: ['mobile', 'internet', 'homePhone'], area: 'תקשורת', title: 'בדיקת חבילות סלולר ואינטרנט', text: 'צריך באמת חבילת 200 גיגה? לרוב הצרכנים מספיקה מהירות אינטרנט של 100Mb. למשפחות של 3 נפשות ומעלה יש חבילות משפחתיות משתלמות מאוד.', min: 30, max: 200 },
    { id: 'streaming', on: ['tv', 'digital'], area: 'מנויים', title: 'טלוויזיה ומנויי סטרימינג', text: 'האם אתם צופים בכל השירותים? לפעמים משלמים על דבר שאנחנו לא באמת צריכים. אפשר לצפות בתכני הטלוויזיה גם דרך האינטרנט.', min: 30, max: 250 },
    { id: 'privateLabel', on: ['groceries'], area: 'מזון', title: 'מותגים פרטיים', text: 'מותג הבית של הרשת זול בממוצע ב-5%–10% ממותגים מובילים.', pct: [0.05, 0.10], alt: 'groceries' },
    { id: 'plannedShopping', on: ['groceries'], area: 'מזון', title: 'תזמון רכישה חכם', text: 'מוצרים טריים ובשר בסוף היום או לקראת סוף השבוע — אז הרשתות מורידות מחירים, לעיתים עד 20%.', min: 30, max: 200, alt: 'groceries' },
    { id: 'discount', on: ['groceries'], area: 'מזון', title: 'רשתות דיסקאונט', text: 'אותו סל ברשתות הדיסקאונט זול ב-5%–20%.', pct: [0.05, 0.20], alt: 'groceries' },
    { id: 'takeaway', on: ['restaurants'], area: 'אוכל בחוץ', title: 'פחות Take-away ומסעדות', text: 'ארוחה ממוצעת במסעדה עלתה ב-2023 כ-60–100 ₪ לסועד. תפריט עסקי ומבצעי 1+1 מוזילים עד 40%, וצמצום היציאות חוסך משמעותית לאורך זמן.', min: 50, max: 600 },
    { id: 'outlet', on: ['clothing'], area: 'ביגוד', title: 'קנייה במתחמי Outlet', text: 'אותם מותגים בהנחה של 20%–60%. כדאי לרכז קניות מספר פעמים בשנה.', pct: [0.20, 0.60], alt: 'clothing' },
    { id: 'onlineShopping', on: ['clothing'], area: 'ביגוד', title: 'רכישה מקוונת', text: 'רכישה באתרים בינלאומיים חוסכת לרוב 5%–30%.', pct: [0.05, 0.30], alt: 'clothing' },
    { id: 'secondHand', on: ['clothing'], area: 'ביגוד', title: 'יד 2 וחנויות יד שנייה', text: 'בגדים במצב טוב ב-20%–50% מהמחיר המקורי, במיוחד לילדים.', pct: [0.20, 0.50], alt: 'clothing' },
    { id: 'mortgageRefi', on: ['mortgage'], area: 'משכנתא', title: 'בדיקת מחזור משכנתא', text: 'המשכנתא היא לרוב ההוצאה הגדולה ביותר. בדיקה אחת לכ-5 שנים (שינוי תנאים או מחזור) עשויה להוזיל את ההחזר החודשי משמעותית.', min: 400, max: 2000 },
    { id: 'loanSurvey', on: ['loans'], area: 'הלוואות', title: 'סקר שוק ואיחוד הלוואות', text: 'ריבית על הלוואה היא הוצאה משמעותית — חייבים לצמצם אותה. סקר שוק לפני לקיחת הלוואה, ואיחוד כמה הלוואות להלוואה אחת בריבית נמוכה יותר.', min: 50, max: 500 },
    { id: 'overdraftCover', on: ['overdraft'], area: 'עו"ש', title: 'סגירת המינוס', text: 'הריבית על המינוס יכולה להגיע לשיעור דו-ספרתי. ב-99% מהמקרים עדיף לקחת הלוואה בריבית נמוכה יותר ולכסות את המינוס.', min: 50, max: 500 }
  ];
  function tips(r) {
    const byId = Object.fromEntries(r.expenses.map(e => [e.id, e]));
    const out = [];
    TIPS.forEach(t => {
      const base = E.sum(t.on.map(id => (byId[id] ? byId[id].monthly : 0)));
      if (!base) return;
      let min, max;
      if (t.pct) { min = base * t.pct[0]; max = base * t.pct[1]; }
      else { max = Math.min(t.max, base); min = Math.min(t.min, max); }
      out.push(Object.assign({}, t, { base, min, max }));
    });
    // סיכום: חלופות → הטובה ביותר; ולכל הוצאה לא יותר מ-50% מהסכום שלה
    const groups = {};
    out.forEach(t => {
      const g = t.alt || t.id;
      if (!groups[g] || groups[g].max < t.max) groups[g] = t;
    });
    const perArea = {};
    Object.values(groups).forEach(t => {
      const a = perArea[t.on.join()] || (perArea[t.on.join()] = { base: t.base, min: 0, max: 0 });
      a.min += t.min; a.max += t.max;
    });
    let totalMin = 0, totalMax = 0;
    Object.values(perArea).forEach(a => { totalMin += Math.min(a.min, a.base * 0.5); totalMax += Math.min(a.max, a.base * 0.5); });
    return { list: out, totalMin, totalMax };
  }

  /* ---------- סל הצריכה הממוצע בישראל (שקף 10, נתוני הלמ"ס כפי שהוצגו) ---------- */
  const BASKET = [
    { id: 'housing', label: 'דיור', share: 0.25, pick: e => e.cat === 'housing' && !['mobile', 'internet', 'homePhone', 'tv', 'digital', 'papers'].includes(e.id) },
    { id: 'transport', label: 'תחבורה ותקשורת', share: 0.20, pick: e => e.cat === 'transport' || ['mobile', 'internet', 'homePhone'].includes(e.id) },
    { id: 'food', label: 'מזון', share: 0.17, pick: e => ['groceries', 'restaurants'].includes(e.id) },
    { id: 'edu', label: 'חינוך, תרבות ובידור', share: 0.10, pick: e => e.cat === 'kids' || (e.cat === 'leisure' && e.id !== 'restaurants') || ['tv', 'digital', 'papers'].includes(e.id) },
    { id: 'health', label: 'בריאות', share: 0.05, pick: e => e.cat === 'health' }
  ];
  const IL_AVG = { expense: 15865, salary: 13514, medianSalary: 8702 }; // שקף 12
  function benchmark(r) {
    const spend = r.expenses.filter(e => e.kind !== 'saving');
    const total = E.sum(spend.map(e => e.monthly)) || 1;
    return BASKET.map(b => {
      const monthly = E.sum(spend.filter(b.pick).map(e => e.monthly));
      const share = monthly / total;
      return { id: b.id, label: b.label, monthly, share, avg: b.share, diff: share - b.share };
    });
  }

  /* ---------- איפה אתם עומדים (שקף 13) ---------- */
  function position(r) {
    if (!r.monthly_income) return null;
    const overdraft = r.expenses.some(e => e.id === 'overdraft');
    if (r.monthly_surplus < 0 || overdraft) return { group: 'minus', share: 40, level: 'bad', title: 'בקבוצת ה-40% שחיים במינוס', text: 'לפי נתוני הסדנה, כ-40% ממשקי הבית בישראל חיים במינוס מתמשך. הצעד הראשון: להגיע לתזרים חיובי ולסגור את המינוס.' };
    if (r.savings_rate < 0.1) return { group: 'edge', share: 40, level: 'warn', title: 'בקבוצת ה-40% שגומרים את החודש בקושי', text: 'כ-40% ממשקי הבית בישראל מצליחים לסגור את החודש, אבל כמעט בלי לחסוך. המטרה: לפנות לפחות 10%–20% מההכנסה לחיסכון.' };
    return { group: 'good', share: 20, level: 'good', title: 'בקבוצת ה-20% שחיים "את החיים הטובים"', text: 'רק כ-20% ממשקי הבית בישראל חוסכים באופן קבוע. השלב הבא: לגרום לחיסכון לעבוד בשבילכם — להשקיע אותו.' };
  }

  /* ---------- הדרך: הערכת מצב → הגדלת הכנסות → צמצום הוצאות → תזרים חיובי → חיסכון והשקעה (שקפים 15, 37) ---------- */
  function actionPath(r, state, completion) {
    const h = state.household || {};
    const m = matrix(r);
    const softShare = (m[0].monthly + m[1].monthly) / (r.monthly_expenses || 1);
    const negMonths = r.cashflow.surplus.filter(v => v < -0.5).length;
    const saving = r.savings_deposits > 0;
    const steps = [];
    steps.push({
      id: 'assess', title: 'הערכת המצב הפיננסי',
      status: completion >= 0.7 ? 'done' : 'todo',
      text: completion >= 0.7 ? 'הנתונים הוזנו. כדי לדייק — עברו על פירוט העו"ש של 3–7 החודשים האחרונים ועל פירוט האשראי, ובדקו שלא חסרים מנויים או תשלומים כפולים.' : `הוזנו ${Math.round(completion * 100)}% מהנתונים. השלימו את ההזנה בעזרת פירוט העו"ש של 3–7 חודשים אחרונים ופירוט כרטיסי האשראי.`
    });
    const secondEarner = (+h.adults || 1) >= 2 && !r.incomes.some(i => i.id === 'salary2');
    steps.push({
      id: 'income', title: 'הגדלת הכנסות',
      status: r.savings_rate >= 0.2 ? 'done' : 'todo',
      text: r.savings_rate >= 0.2 ? 'שיעור החיסכון מעל 20% — ההכנסה מספיקה לחיסכון משמעותי.' : `כדי להגיע ל-20% חיסכון חסרים כ-₪${Math.round(Math.max(0, 0.2 * r.monthly_income - (r.monthly_income - r.monthly_consumption))).toLocaleString('he-IL')} בחודש. שילוב של הגדלת הכנסה וצמצום הוצאות הוא הדרך המהירה ביותר.${secondEarner ? ' לא הוזנה הכנסה לבן/בת הזוג השני/ה.' : ''}`
    });
    steps.push({
      id: 'cut', title: 'צמצום הוצאות',
      status: r.monthly_expenses && softShare <= 0.15 ? 'done' : 'todo',
      text: `${Math.round(softShare * 100)}% מההוצאות הן "לא חשובות" (דחופות או לא). ${softShare <= 0.15 ? 'רמה נמוכה — התקציב כבר מצומצם.' : 'כאן מתחילים לצמצם — לפי הסדר במטריצה.'}`
    });
    steps.push({
      id: 'cashflow', title: 'תזרים מזומנים חיובי',
      status: r.monthly_surplus > 0 && !negMonths ? 'done' : r.monthly_surplus > 0 ? 'partial' : 'todo',
      text: r.monthly_surplus <= 0 ? 'ההוצאות עולות על ההכנסות. בלי תזרים חיובי אין "סגירת חודש" ואין ממה לחסוך.' : negMonths ? `עודף שנתי חיובי, אבל ${negMonths === 1 ? 'בחודש אחד' : `ב-${negMonths} חודשים`} צפוי גירעון. הפרישו מראש להוצאות השנתיות.` : 'יש עודף בכל חודשי השנה. את העודף אפשר להפנות לחיסכון ולהשקעה.'
    });
    steps.push({
      id: 'invest', title: 'חוסכים ומשקיעים',
      status: saving && h.hasPortfolio ? 'done' : saving || h.hasPortfolio ? 'partial' : 'todo',
      text: saving ? (h.hasPortfolio ? 'יש הפקדה קבועה לחיסכון ותיק השקעות.' : 'יש הפקדה קבועה לחיסכון. השלב הבא — להשקיע אותה ולא להשאיר אותה בעו"ש.') : 'אין הפקדה קבועה לחיסכון. "שלמו לעצמכם קודם": חשבון ייעודי לחיסכון והוראת קבע בתחילת כל חודש.'
    });
    return steps;
  }

  /* ---------- "שלמו לעצמכם קודם" (שקף 39) ---------- */
  function payYourselfFirst(r) {
    if (!r.monthly_income) return null;
    const target = Math.round((0.2 * r.monthly_income) / 50) * 50;
    const realistic = Math.max(0, Math.min(target, r.monthly_surplus + r.savings_deposits));
    return { target, current: r.savings_deposits, realistic: Math.round(realistic / 50) * 50 };
  }

  /* ---------- כוחה של ריבית דריבית (שקפים 41–43, 225) ---------- */
  function futureValue(monthly, years, annualRate) {
    const n = years * 12;
    if (!annualRate) return monthly * n;
    const i = annualRate / 12;
    return monthly * ((Math.pow(1 + i, n) - 1) / i);
  }
  const RATES = [0, 0.06, 0.08];
  function growth(monthly) {
    return [10, 20, 30].map(y => ({ years: y, values: RATES.map(rate => futureValue(monthly, y, rate)) }));
  }

  /* ---------- פרופיל סיכון ופילוח תיק (שקפים 160–174) ---------- */
  const LEVELS = ['low', 'medium', 'high'];
  const LEVEL_LABEL = { low: 'סיכון נמוך', medium: 'סיכון בינוני', high: 'סיכון גבוה' };
  const ALLOCATION = {
    low: { stocks: 0.22, bonds: 0.70, cash: 0.08 },
    medium: { stocks: 0.60, bonds: 0.32, cash: 0.08 },
    high: { stocks: 0.80, bonds: 0.10, cash: 0.10 }
  };
  function riskProfile(r, state) {
    const h = state.household || {};
    const missing = [];
    if (!hasVal(h.horizon)) missing.push('אופק ההשקעה');
    if (!hasVal(h.riskTolerance)) missing.push('יחס לסיכון');
    if (!hasVal(h.age)) missing.push('גיל');
    if (missing.length) return { missing };
    const reasons = [];
    const byHorizon = { short: 'low', mid: 'medium', long: 'high' }[h.horizon];
    reasons.push({ factor: 'תקופת ההשקעה', level: byHorizon, text: { short: 'עד 5 שנים → סיכון נמוך', mid: '5–10 שנים → סיכון בינוני ומטה', long: 'מעל 10 שנים → אפשר סיכון גבוה' }[h.horizon] });
    const age = num(h.age);
    const byAge = age < 60 ? 'high' : age < 75 ? 'medium' : 'low';
    reasons.push({ factor: 'גיל', level: byAge, text: `גיל ${age} → ${LEVEL_LABEL[byAge]} לכל היותר (לפי גרף רמות הסיכון לפי גיל)` });
    reasons.push({ factor: '"שנאת סיכון"', level: h.riskTolerance, text: { low: 'ירידה זמנית בתיק תגרום לכם לחץ משמעותי', medium: 'אפשר לסבול ירידות מתונות', high: 'ירידות זמניות לא יגרמו לכם למכור' }[h.riskTolerance] });
    let idx = Math.min(...[byHorizon, byAge, h.riskTolerance].map(l => LEVELS.indexOf(l)));
    const insecure = r.monthly_surplus < 0 || r.expenses.some(e => e.id === 'overdraft') || (r.emergency_months !== null && r.emergency_months < 3);
    if (insecure && idx > 0) {
      idx -= 1;
      reasons.push({ factor: 'מצב פיננסי', level: LEVELS[idx], text: 'הביטחון הפיננסי נמוך (גירעון, מינוס או כרית ביטחון של פחות מ-3 חודשים) → מורידים רמת סיכון אחת' });
    } else {
      reasons.push({ factor: 'מצב פיננסי', level: null, text: 'ככל שהביטחון הפיננסי גדול יותר, אפשר לקחת יותר סיכון' });
    }
    const level = LEVELS[idx];
    const base = r.investment_capacity;
    const a = ALLOCATION[level];
    return { level, label: LEVEL_LABEL[level], reasons, allocation: a, monthly: { stocks: base * a.stocks, bonds: base * a.bonds, cash: base * a.cash } };
  }

  /* ---------- חיסכון פנסיוני (שקפים 193–226) — נכון למועד הסדנה ---------- */
  const PENSION_FACTS = {
    pensionMax: { deposit: 6, accum: 0.5 }, pensionAvg: { deposit: 2.8, accum: 0.3 },
    managersMax: { deposit: 4, accum: 1.05 }, gemelAvgAccum: 0.6,
    studyFundSalaryCap: 15712, studyFundSelfExempt: 18960, studyFundSelfDeduct: 12250,
    gemelInvestCap: 76449
  };
  function pensionChecks(r, state) {
    const h = state.household || {};
    const self = r.incomes.some(i => i.id === 'salary1' && state.incomes.salary1 && state.incomes.salary1.employment === 'self') ||
      r.incomes.some(i => i.id === 'salary2' && state.incomes.salary2 && state.incomes.salary2.employment === 'self') || !!h.hasBusiness;
    const out = [];
    const dep = num(h.pensionFeeDeposit), acc = num(h.pensionFeeAccum);
    if (hasVal(h.pensionFeeDeposit) || hasVal(h.pensionFeeAccum)) {
      const high = dep > PENSION_FACTS.pensionAvg.deposit || acc > PENSION_FACTS.pensionAvg.accum;
      out.push({ level: high ? 'warn' : 'good', title: 'דמי הניהול שלכם', text: `${dep}% מההפקדה ו-${acc}% מהצבירה. ${high ? `גבוה מהממוצע שהוצג בסדנה (${PENSION_FACTS.pensionAvg.deposit}% ו-${PENSION_FACTS.pensionAvg.accum}%) — שווה להתמקח או להחליף קרן. דמי ניהול גבוהים יכולים להוריד מאות אלפי שקלים מהחיסכון.` : 'בטווח הממוצע ומטה — מצוין.'}` });
    } else {
      out.push({ level: 'info', title: 'בדקו את דמי הניהול', text: `בקרן פנסיה המקסימום הוא ${PENSION_FACTS.pensionMax.deposit}% מההפקדה ו-${PENSION_FACTS.pensionMax.accum}% מהצבירה, והממוצע שהוצג בסדנה הוא כ-${PENSION_FACTS.pensionAvg.deposit}% ו-${PENSION_FACTS.pensionAvg.accum}%. הזינו את דמי הניהול שלכם בפרטי משק הבית כדי לקבל השוואה.` });
    }
    if (h.pensionType === 'managers') out.push({ level: 'warn', title: 'ביטוח מנהלים', text: `דמי הניהול בביטוח מנהלים יכולים להגיע ל-${PENSION_FACTS.managersMax.deposit}% מההפקדה ו-${PENSION_FACTS.managersMax.accum}% מהצבירה — עד פי 5 מקרן פנסיה. לפי הסדנה, ביטוח מנהלים כדאי בעיקר כמכשיר משלים להכנסה של מעל פי 2 מהשכר הממוצע.` });
    out.push({ level: 'info', title: 'מסלול ההשקעה', text: 'ברוב המסלולים לא ניתן לדעת מראש את התשואה. מסלולים עוקבי מדדים (כמו מסלול עוקב S&P 500) הניבו לאורך זמן כ-8%–10% בשנה בממוצע — כדאי לבדוק באיזה מסלול נמצא הכסף ומה דמי הניהול בו.' });
    if (h.hasStudyFund === false || h.hasStudyFund === 'no') {
      out.push({ level: 'warn', title: 'קרן השתלמות', text: self ? `עצמאים שאינם מפקידים לקרן השתלמות מפסידים: הפקדה של עד ₪${PENSION_FACTS.studyFundSelfExempt.toLocaleString('he-IL')} בשנה פטורה ממס רווחי הון, ו-4.5% מההכנסה (עד ₪${PENSION_FACTS.studyFundSelfDeduct.toLocaleString('he-IL')}) מוכרים כהוצאה.` : `שכירים — בקשו ממקום העבודה להפריש לקרן השתלמות. ההטבה פטורה ממס עד שכר של ₪${PENSION_FACTS.studyFundSalaryCap.toLocaleString('he-IL')} בחודש. זהו אפיק החיסכון המשתלם ביותר היום.` });
    } else if (h.hasStudyFund === true || h.hasStudyFund === 'yes') {
      out.push({ level: 'good', title: 'קרן השתלמות', text: 'יש לכם קרן השתלמות — אפיק החיסכון המשתלם ביותר. ודאו שדמי הניהול נמוכים ושמסלול ההשקעה מתאים לאופק שלכם.' });
    }
    if (self) out.push({ level: 'info', title: 'חובת פנסיה לעצמאים', text: 'מאז 2017 עצמאים חייבים להפקיד לחיסכון פנסיוני. ההפקדה מזכה בהטבות מס בשלב ההפקדה, בשלב החיסכון ובשלב המשיכה.' });
    return out;
  }

  /* ---------- תובנות נוספות לרשימה הראשית ---------- */
  function extraInsights(r, state) {
    const out = [];
    if (!r.monthly_income) return out;
    const pyf = payYourselfFirst(r);
    if (pyf && !r.savings_deposits && r.monthly_surplus > 0) out.push({ level: 'warn', icon: '🏦', title: 'שלמו לעצמכם קודם', text: `אין הפקדה קבועה לחיסכון. פתחו חשבון ייעודי לחיסכון והגדירו הוראת קבע של כ-₪${pyf.realistic.toLocaleString('he-IL')} (כרית ביטחון + השקעה) בתחילת כל חודש — לפני שהכסף "נבלע" בהוצאות. אל תשתמשו בחשבון הזה לשום דבר אחר.` });
    const m = matrix(r)[0];
    if (m.monthly > 0) out.push({ level: m.pct > 0.1 ? 'warn' : 'info', icon: '🧭', title: 'לא חשוב ולא דחוף', text: `${Math.round(m.pct * 100)}% מההוצאות (₪${Math.round(m.monthly).toLocaleString('he-IL')} בחודש) הן הוצאות שאינן חשובות ואינן דחופות: ${m.items.slice(0, 3).map(i => i.name).join(', ')}. לפי מודל "חשוב/דחוף", מכאן מתחילים לצמצם.` });
    if (r.investment_capacity > 0) {
      const v = futureValue(r.investment_capacity, 20, 0.08), c = futureValue(r.investment_capacity, 20, 0);
      out.push({ level: 'good', icon: '🌱', title: 'כסף שעובד בשבילכם', text: `השקעה של ₪${Math.round(r.investment_capacity).toLocaleString('he-IL')} בחודש למשך 20 שנה בתשואה שנתית ממוצעת של 8% מצטברת לכ-₪${Math.round(v).toLocaleString('he-IL')}, לעומת ₪${Math.round(c).toLocaleString('he-IL')} אם הכסף נשאר בעו"ש — ובעו"ש האינפלציה עוד שוחקת את ערכו.` });
    }
    return out;
  }

  global.Playbook = { QUADRANTS, quadrantOf, matrix, tips, benchmark, IL_AVG, position, actionPath, payYourselfFirst, futureValue, RATES, growth, riskProfile, ALLOCATION, LEVEL_LABEL, pensionChecks, PENSION_FACTS, extraInsights };
})(window);
