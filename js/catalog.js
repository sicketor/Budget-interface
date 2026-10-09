/* קטלוג הקטגוריות והסעיפים — מבוסס על קובץ האקסל "ניהול הכנסות והוצאות".
 * type: fixed | variable | once   (קבועה / משתנה / חד-פעמית)
 * kind: 'saving' מסמן הפקדה לחיסכון (יוצא מהתזרים אך אינו צריכה)
 * show(h): האם להציג את הסעיף לפי פרטי משק הבית
 */
(function (global) {
  'use strict';

  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  const FREQS = {
    monthly: { label: 'חודשי' },
    bimonthly: { label: 'דו-חודשי' },
    annual: { label: 'שנתי' },
    once: { label: 'חד-פעמי' },
    varying: { label: 'משתנה לפי חודש' }
  };

  const TYPES = {
    fixed: { label: 'קבועה' },
    variable: { label: 'משתנה' },
    once: { label: 'חד-פעמית' }
  };

  const hasCar = h => !!h.hasCar;
  const hasKids = h => (+h.kids || 0) > 0;

  const INCOMES = [
    { key: 'salary1', name: 'משכורת – בן/בת זוג 1', stable: true, employment: true },
    { key: 'salary2', name: 'משכורת – בן/בת זוג 2', stable: true, employment: true, show: h => (+h.adults || 1) >= 2 },
    { key: 'business', name: 'הכנסה מעסק', stable: false, show: h => !!h.hasBusiness },
    { key: 'property', name: 'הכנסה מנכס (שכירות)', stable: true, show: h => !!h.hasProperty },
    { key: 'portfolio', name: 'הכנסה מתיק השקעות', stable: false, show: h => !!h.hasPortfolio },
    { key: 'nii', name: 'ביטוח לאומי / קצבאות', stable: true },
    { key: 'family', name: 'עזרה מהמשפחה', stable: false }
  ];

  const CATEGORIES = [
    {
      id: 'housing', name: 'דיור', icon: '🏠', items: [
        { key: 'rent', name: 'שכר דירה', type: 'fixed', show: h => h.housing === 'rent' },
        { key: 'mortgage', name: 'משכנתא', type: 'fixed', show: h => h.housing === 'mortgage' },
        { key: 'vaad', name: 'ועד בית', type: 'fixed' },
        { key: 'arnona', name: 'ארנונה', type: 'fixed', hint: 'לרוב משולם דו-חודשי' },
        { key: 'water', name: 'מים', type: 'variable', hint: 'לרוב משולם דו-חודשי' },
        { key: 'electricity', name: 'חשמל', type: 'variable', reducible: true },
        { key: 'homeIns', name: 'ביטוח דירה', type: 'fixed', freq: 'annual' },
        { key: 'gas', name: 'גז', type: 'variable' },
        { key: 'cleaner', name: 'עוזרת בית', type: 'variable', reducible: true },
        { key: 'maintenance', name: 'אחזקת בית ותיקונים', type: 'once', freq: 'annual' },
        { key: 'garden', name: 'גינה (גנן)', type: 'variable', reducible: true },
        { key: 'tv', name: 'מנוי טלוויזיה', type: 'fixed', reducible: true },
        { key: 'digital', name: 'מנויים דיגיטליים', type: 'fixed', reducible: true },
        { key: 'papers', name: 'עיתונים ומגזינים', type: 'fixed', reducible: true },
        { key: 'homePhone', name: 'טלפון ביתי', type: 'fixed', reducible: true },
        { key: 'internet', name: 'אינטרנט (ספק + תשתית)', type: 'fixed', reducible: true },
        { key: 'mobile', name: 'טלפונים סלולריים', type: 'fixed', reducible: true }
      ]
    },
    {
      id: 'finance', name: 'פיננסים', icon: '🏦', items: [
        { key: 'loans', name: 'החזרי הלוואות', type: 'fixed', debt: true, show: h => !!h.hasLoans, hint: 'סך כל ההלוואות יחד' },
        { key: 'overdraft', name: 'ריבית עו"ש', type: 'variable', debt: true, reducible: true },
        { key: 'savingDeposit', name: 'הפקדה לחיסכון', type: 'fixed', kind: 'saving', hint: 'נספר כחיסכון, לא כצריכה' },
        { key: 'fees', name: 'עמלות בנק / כרטיסי אשראי', type: 'variable', reducible: true },
        { key: 'donations', name: 'תרומות', type: 'variable' }
      ]
    },
    {
      id: 'transport', name: 'תחבורה', icon: '🚗', items: [
        { key: 'carIns', name: 'ביטוח רכב (חובה + מקיף)', type: 'fixed', freq: 'annual', show: hasCar, reducible: true },
        { key: 'license', name: 'רישוי שנתי (טסט)', type: 'fixed', freq: 'annual', show: hasCar },
        { key: 'carService', name: 'טיפולים ותיקונים', type: 'once', freq: 'annual', show: hasCar },
        { key: 'publicTransport', name: 'תחבורה ציבורית', type: 'variable' },
        { key: 'fuel', name: 'דלק', type: 'variable', show: hasCar, reducible: true },
        { key: 'parking', name: 'חניה', type: 'variable', show: hasCar, reducible: true },
        { key: 'tolls', name: 'אגרות כבישים', type: 'variable', show: hasCar, reducible: true }
      ]
    },
    {
      id: 'kids', name: 'ילדים וחינוך', icon: '🎒', show: hasKids, items: [
        { key: 'daycare', name: 'גנים ומעונות', type: 'fixed' },
        { key: 'school', name: 'בתי ספר', type: 'fixed' },
        { key: 'university', name: 'אוניברסיטה', type: 'fixed', freq: 'annual' },
        { key: 'studyMaterials', name: 'חומרי לימוד ומבחנים', type: 'variable', freq: 'annual' },
        { key: 'tutoring', name: 'שיעורים פרטיים', type: 'variable', reducible: true },
        { key: 'baby', name: 'מוצרי תינוקות', type: 'variable' },
        { key: 'kidsClasses', name: 'חוגים', type: 'variable', reducible: true }
      ]
    },
    {
      id: 'daily', name: 'הוצאות יום-יומיות', icon: '🛒', items: [
        { key: 'groceries', name: 'מזון ומכולת', type: 'variable', reducible: true },
        { key: 'pharm', name: 'סופר-פארם', type: 'variable', reducible: true },
        { key: 'clothing', name: 'ביגוד והנעלה', type: 'variable', reducible: true },
        { key: 'pets', name: 'בעלי חיים', type: 'variable' },
        { key: 'hair', name: 'מספרה', type: 'variable', reducible: true },
        { key: 'cigarettes', name: 'סיגריות', type: 'variable', reducible: true },
        { key: 'alcohol', name: 'אלכוהול', type: 'variable', reducible: true },
        { key: 'cosmetics', name: 'קוסמטיקה', type: 'variable', reducible: true },
        { key: 'cash', name: 'מזומן ללא מעקב', type: 'variable', reducible: true, untracked: true },
        { key: 'familySupport', name: 'תמיכה בבן משפחה', type: 'fixed' },
        { key: 'unexpected', name: 'הוצאה בלתי צפויה', type: 'once', freq: 'once' },
        { key: 'atm', name: 'משיכות מכספומט', type: 'variable', reducible: true, untracked: true }
      ]
    },
    {
      id: 'leisure', name: 'תרבות ופנאי', icon: '🎭', items: [
        { key: 'abroad', name: 'חופשות בחו"ל', type: 'once', freq: 'annual', reducible: true },
        { key: 'localTrips', name: 'חופשות בארץ', type: 'once', freq: 'annual', reducible: true },
        { key: 'gym', name: 'קאנטרי / בריכה / חדר כושר', type: 'fixed', reducible: true },
        { key: 'restaurants', name: 'מסעדות וקפה', type: 'variable', reducible: true },
        { key: 'shows', name: 'סרטים והצגות', type: 'variable', reducible: true },
        { key: 'courses', name: 'חוגים / קורסים', type: 'variable', reducible: true },
        { key: 'babysitter', name: 'שמרטף', type: 'variable', reducible: true },
        { key: 'events', name: 'אירועים ומתנות', type: 'once', freq: 'annual', reducible: true }
      ]
    },
    {
      id: 'health', name: 'רפואה ובריאות', icon: '🩺', items: [
        { key: 'hmo', name: 'קופת חולים', type: 'fixed' },
        { key: 'supplemental', name: 'ביטוח בריאות משלים', type: 'fixed' },
        { key: 'privateHealth', name: 'ביטוח בריאות פרטי', type: 'fixed', reducible: true },
        { key: 'otherIns', name: 'ביטוחים אחרים (חיים, סיעודי)', type: 'fixed', reducible: true },
        { key: 'doctors', name: 'רופאים וטיפולים', type: 'variable' },
        { key: 'meds', name: 'תרופות', type: 'variable' }
      ]
    },
    { id: 'other', name: 'הוצאות נוספות', icon: '🧩', items: [] }
  ];

  const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const itemByKey = {};
  CATEGORIES.forEach(c => c.items.forEach(it => { itemByKey[it.key] = Object.assign({ cat: c.id }, it); }));
  const incomeByKey = Object.fromEntries(INCOMES.map(i => [i.key, i]));

  const visible = (def, h) => !def.show || def.show(h || {});

  global.Catalog = { MONTHS, FREQS, TYPES, INCOMES, CATEGORIES, catById, itemByKey, incomeByKey, visible };
})(window);
