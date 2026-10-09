/* גרפים (Chart.js). צבע קבוע לכל קטגוריה — הצבע הולך עם הישות, לא עם הדירוג. */
(function (global) {
  'use strict';
  const C = global.Catalog;
  const registry = {};

  const CAT_COLORS = {
    housing: '#2a78d6', finance: '#eb6834', transport: '#1baf7a', kids: '#eda100',
    daily: '#e87ba4', leisure: '#008300', health: '#4a3aa7', other: '#8a8984'
  };
  const SERIES = { income: '#2a78d6', expense: '#eb6834' };
  const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8984', grid: '#e9e8e4', surface: '#ffffff' };

  const ils = v => '₪' + Math.round(v).toLocaleString('he-IL');
  const available = () => typeof global.Chart !== 'undefined';

  function destroy(id) { if (registry[id]) { registry[id].destroy(); delete registry[id]; } }

  function base() {
    if (!available()) return;
    const Ch = global.Chart;
    Ch.defaults.font.family = "'Heebo', system-ui, sans-serif";
    Ch.defaults.color = INK.secondary;
  }

  function cashflow(canvas, r, onPick) {
    if (!available() || !canvas) return false;
    base(); destroy(canvas.id);
    registry[canvas.id] = new global.Chart(canvas, {
      type: 'bar',
      data: {
        labels: C.MONTHS,
        datasets: [
          { label: 'הכנסות', data: r.cashflow.income, backgroundColor: SERIES.income, borderRadius: 4, maxBarThickness: 18 },
          { label: 'הוצאות', data: r.cashflow.expense, backgroundColor: SERIES.expense, borderRadius: 4, maxBarThickness: 18 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, locale: 'he-IL',
        interaction: { mode: 'index', intersect: false },
        onClick: (evt, els) => { if (els.length && onPick) onPick(els[0].index); },
        scales: {
          x: { reverse: true, grid: { display: false }, ticks: { color: INK.secondary, autoSkip: true, maxRotation: 0, callback: (v, i) => C.MONTHS[i].slice(0, 3) } },
          y: { position: 'right', beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { color: INK.muted, callback: v => ils(v), maxTicksLimit: 5 } }
        },
        plugins: {
          legend: { rtl: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, color: INK.primary } },
          tooltip: {
            rtl: true, textDirection: 'rtl', backgroundColor: '#ffffff', borderColor: INK.grid, borderWidth: 1, titleColor: INK.primary, bodyColor: INK.secondary, footerColor: INK.primary, padding: 10,
            callbacks: {
              label: c => ` ${c.dataset.label}: ${ils(c.raw)}`,
              footer: items => { const i = items[0].dataIndex; return 'עודף: ' + ils(r.cashflow.surplus[i]); }
            }
          }
        }
      }
    });
    return true;
  }

  function donut(canvas, r) {
    if (!available() || !canvas) return false;
    base(); destroy(canvas.id);
    const cats = r.byCategory.filter(c => c.monthly > 0);
    registry[canvas.id] = new global.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.name),
        datasets: [{ data: cats.map(c => c.monthly), backgroundColor: cats.map(c => CAT_COLORS[c.id]), borderColor: INK.surface, borderWidth: 2, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: true, textDirection: 'rtl', backgroundColor: '#ffffff', borderColor: INK.grid, borderWidth: 1, titleColor: INK.primary, bodyColor: INK.secondary, padding: 10,
            callbacks: { label: c => ` ${ils(c.raw)} · ${Math.round(cats[c.dataIndex].pct * 100)}%` }
          }
        }
      }
    });
    return true;
  }

  global.Charts = { cashflow, donut, destroy, available, CAT_COLORS, SERIES };
})(window);
