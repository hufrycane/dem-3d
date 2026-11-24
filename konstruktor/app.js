/* Конструктор шкафа DEM — четыре шага. Демонстрационный прототип.
   Модель: всё в миллиметрах, x от левого края шкафа, y от пола.
   Каждый элемент хранит свою геометрию; правила — в validate(). */
(function () {
  'use strict';
  const C = window.KONSTRUKTOR_CONFIG;
  const R = C.rules;
  const P = C.prices;
  const T = C.panel;

  const TYPES = {
    shelf:  { name: 'Полка', acc: 'полку',
      desc: `Горизонтальная полка на всю ширину секции. Между полками не меньше ${R.shelf.minGap} мм. Полка длиннее ${R.shelf.maxSpan} мм прогибается, нужна стойка.` },
    stand:  { name: 'Стойка', acc: 'стойку',
      desc: `Вертикальная перегородка от полки до полки. Делит секцию, каждая часть не уже ${R.stand.minCell} мм. Не может разрезать штангу, ящик или полку.` },
    rod:    { name: 'Штанга', acc: 'штангу',
      desc: `Для вешалок. Под ней нужно не меньше ${R.rod.minHang} мм для одежды, ширина секции ${R.rod.minWidth}–${R.rod.maxSpan} мм.` },
    drawer: { name: 'Ящик', acc: 'ящик',
      desc: `Ставится на дно секции или на другой ящик, верх не выше ${R.drawer.maxTop} мм от дна. Демонстрационное упрощение: запрещена зона стыка закрытых дверей. Это не точный расчёт открывания купе.` },
    shoe:   { name: 'Выкатная полка для обуви', acc: 'выкатную полку',
      desc: `Только в нижней части шкафа. Другие элементы не ближе ${R.shoe.clearAbove} мм сверху. Секция ${R.shoe.minWidth}–${R.shoe.maxWidth} мм, за одной дверью.` },
    panto:  { name: 'Пантограф', acc: 'пантограф',
      desc: `Опускающаяся штанга для верхней зоны. Крепится вверху секции, не ниже ${R.panto.minMount} мм от пола. Ширина ${R.panto.minWidth}–${R.panto.maxWidth} мм, под ним ${R.panto.minHang} мм свободно.` }
  };

  const ICONS = {
    shelf: '<rect x="4" y="17" width="56" height="7" rx="1" fill="#D9C3A0" stroke="#8E7556"/>',
    stand: '<rect x="28" y="2" width="8" height="36" rx="1" fill="#D9C3A0" stroke="#8E7556"/>',
    rod: '<line x1="8" y1="20" x2="56" y2="20" stroke="#8A8D91" stroke-width="4" stroke-linecap="round"/><rect x="4" y="14" width="5" height="12" fill="#4C4648"/><rect x="55" y="14" width="5" height="12" fill="#4C4648"/>',
    drawer: '<rect x="4" y="8" width="56" height="24" rx="2" fill="#D9C3A0" stroke="#8E7556"/><line x1="24" y1="20" x2="40" y2="20" stroke="#4C4648" stroke-width="3" stroke-linecap="round"/>',
    shoe: '<rect x="6" y="10" width="52" height="22" fill="none" stroke="#8A8D91" stroke-width="2"/><path d="M6 32 L58 18 M6 24 L58 10" stroke="#8A8D91" stroke-width="2"/>',
    panto: '<line x1="6" y1="4" x2="58" y2="4" stroke="#4C4648" stroke-width="3"/><path d="M10 4 L14 30 M54 4 L50 30" stroke="#8A8D91" stroke-width="2.5"/><line x1="12" y1="30" x2="52" y2="30" stroke="#8A8D91" stroke-width="4" stroke-linecap="round"/>'
  };

  // ---------- состояние ----------
  const state = {
    W: 2400, H: 2500, D: 600, kind: 'built',
    walls: { left: false, right: false, top: false, bottom: true },
    plinth: true, doors: 3, material: 'ldsp', profile: 'silver',
    doorDesigns: Array.from({length: 3}, () => ({material: 'ldsp'})),
    items: [], sel: null, nextId: 1
  };
  let step = 1;
  let history = [];
  let blockedStorage = false;
  const clone = v => JSON.parse(JSON.stringify(v));
  const snapshot = () => clone(state);
  function restore(s) { Object.assign(state, clone(s)); }
  function remember() { history.push(snapshot()); if (history.length > 40) history.shift(); }
  function persist() {
    if (blockedStorage) return;
    try { localStorage.setItem(C.storageKey, JSON.stringify(project())); $('storageStatus').textContent = 'Проект сохранён в браузере.'; }
    catch (_) { $('storageStatus').textContent = 'Браузер не разрешает автосохранение. Скачайте проект JSON.'; }
  }
  function project() {
    const s = snapshot(); delete s.sel;
    return { version: C.formatVersion, project: s };
  }
  let ghost = null;      // { cand, issues }
  let drag = null;       // { kind: 'new'|'move', type, id, sx, sy, moved }
  let armed = null;      // тип, выбранный тапом по плитке
  let flash = null;      // { text, cls, html } — сообщение в статусе
  let invalid = new Map(); // id → issues для сохранённых элементов

  // ---------- геометрия ----------
  function interior() {
    const x0 = state.walls.left ? T : 0;
    const x1 = state.W - (state.walls.right ? T : 0);
    const y0 = (state.walls.bottom && state.plinth ? C.plinth : 0) + (state.walls.bottom ? T : 0);
    const y1 = state.H - (state.walls.top ? T : 0);
    return { x0, x1, y0, y1 };
  }
  function bandOf(e) {
    switch (e.type) {
      case 'shelf': return { x0: e.x0, x1: e.x1, b0: e.y, b1: e.y + T };
      case 'stand': return { x0: e.x, x1: e.x + T, b0: e.y0, b1: e.y1 };
      case 'rod': return { x0: e.x0, x1: e.x1, b0: e.y - 15, b1: e.y + 15 };
      case 'panto': return { x0: e.x0, x1: e.x1, b0: e.y - R.panto.h, b1: e.y };
      default: return { x0: e.x0, x1: e.x1, b0: e.y, b1: e.y + e.h };
    }
  }
  const ovX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1;
  const ovY = (a, b) => Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0) > 0.5;
  const near = (a, b) => Math.abs(a - b) < 1;
  const snap = (v, s = 10) => Math.round(v / s) * s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mm = v => Math.round(v);

  // Свободная ячейка вокруг точки: ограничена стойками по бокам и полками сверху/снизу.
  function cellAt(px, py, ignore, list = state.items) {
    const I = interior();
    let l = I.x0, r = I.x1, b = I.y0, t = I.y1;
    for (const e of list) {
      if (e.id === ignore || e.type !== 'stand') continue;
      if (py < e.y0 - 0.5 || py > e.y1 + 0.5) continue;
      if (e.x + T <= px + 0.5) l = Math.max(l, e.x + T);
      else if (e.x >= px - 0.5) r = Math.min(r, e.x);
    }
    for (const e of list) {
      if (e.id === ignore || e.type !== 'shelf') continue;
      if (px < e.x0 - 0.5 || px > e.x1 + 0.5) continue;
      if (e.y + T <= py + 0.5) b = Math.max(b, e.y + T);
      else if (e.y >= py - 0.5) t = Math.min(t, e.y);
    }
    return { l, r, b, t };
  }
  function cellOf(e, list) {
    const bd = bandOf(e);
    return cellAt((bd.x0 + bd.x1) / 2, (bd.b0 + bd.b1) / 2, e.id, list);
  }
  // Ближайшие препятствия снизу и сверху в той же колонке.
  function neighbors(bd, list, c) {
    let below = c.b, above = c.t;
    for (const o of list) {
      const ob = bandOf(o);
      if (!ovX(bd, ob)) continue;
      if (ob.b1 <= bd.b0 + 0.5) below = Math.max(below, ob.b1);
      else if (ob.b0 >= bd.b1 - 0.5) above = Math.min(above, ob.b0);
    }
    return { below, above };
  }

  function doorLayout() {
    const I = interior();
    const n = state.doors, ov = C.doorOverlap;
    const Wo = I.x1 - I.x0;
    const dw = (Wo + (n - 1) * ov) / n;
    const doors = [], joints = [];
    for (let i = 0; i < n; i++) doors.push({ x0: I.x0 + i * (dw - ov), x1: I.x0 + i * (dw - ov) + dw });
    for (let i = 1; i < n; i++) {
      const s = I.x0 + i * (dw - ov);
      joints.push({ x0: s - C.junctionMargin, x1: s + ov + C.junctionMargin, mid: s + ov / 2 });
    }
    return { dw, doors, joints };
  }
  function doorRange() {
    const I = interior(); const Wo = I.x1 - I.x0, ov = C.doorOverlap;
    const ok = [];
    for (let n = 1; n <= 8; n++) {
      const dw = (Wo + (n - 1) * ov) / n;
      if (dw >= C.limits.doorWidth[0] && dw <= C.limits.doorWidth[1]) ok.push(n);
    }
    return ok;
  }

  // ---------- размещение ----------
  function candidate(type, px, py, ignore) {
    const I = interior();
    px = clamp(px, I.x0 + 1, I.x1 - 1);
    py = clamp(py, I.y0 + 1, I.y1 - 1);
    const c = cellAt(px, py, ignore);
    let e;
    switch (type) {
      case 'shelf':
        e = { type, x0: c.l, x1: c.r, y: clamp(snap(py - T / 2), c.b, c.t - T) }; break;
      case 'stand':
        e = { type, x: clamp(snap(px - T / 2), c.l, c.r - T), y0: c.b, y1: c.t }; break;
      case 'rod': {
        let y = snap(py);
        if (c.t - y < 160) y = c.t - R.rod.topGap;
        e = { type, x0: c.l, x1: c.r, y: clamp(y, c.b + 20, c.t - 20) }; break;
      }
      case 'drawer': {
        const h = R.drawer.h;
        // высота стопки ящиков в этой секции: новый ящик встаёт на неё
        let top = c.b;
        for (let moved = true; moved;) {
          moved = false;
          for (const o of state.items) {
            if (o.id !== ignore && o.type === 'drawer' && near(o.y, top) && near(o.x0, c.l) && near(o.x1, c.r)) { top = o.y + o.h; moved = true; }
          }
        }
        const k = clamp(Math.round((py - c.b - h / 2) / h), 0, Math.round((top - c.b) / h));
        e = { type, x0: c.l, x1: c.r, h, y: Math.min(c.b + k * h, Math.max(c.b, c.t - h)) }; break;
      }
      case 'shoe': {
        const h = R.shoe.h;
        let y = snap(py - h / 2);
        if (y - c.b < 80) y = c.b;
        e = { type, x0: c.l, x1: c.r, h, y: clamp(y, c.b, Math.max(c.b, c.t - h)) }; break;
      }
      case 'panto':
        e = { type, x0: c.l, x1: c.r, y: c.t }; break;
    }
    return e;
  }

  function validate(e, ignore, list = state.items) {
    if (!e || !Object.hasOwn(TYPES, e.type)) return ['Неизвестный элемент'];
    const fields = e.type === 'stand' ? ['x','y0','y1'] : ['x0','x1','y',...(['drawer','shoe'].includes(e.type) ? ['h'] : [])];
    if (fields.some(k => typeof e[k] !== 'number' || !Number.isFinite(e[k]))) return ['Некорректные координаты элемента'];
    if (['drawer','shoe'].includes(e.type) && e.h !== R[e.type].h) return ['Неверная высота элемента'];
    const I = interior();
    const others = list.filter(o => o.id !== ignore && o !== e);
    const c = cellOf(e, others);
    const bd = bandOf(e);
    const w = mm(bd.x1 - bd.x0);
    const out = [];
    const add = s => { if (!out.includes(s)) out.push(s); };
    const depth = state.D - C.doorZone;
    if (R[e.type].minDepth && depth < R[e.type].minDepth) add(`Полезная глубина ${depth} мм, нужно от ${R[e.type].minDepth} мм. Увеличьте глубину корпуса`);
    if (isNaN(w) || bd.x1 <= bd.x0 || bd.b1 <= bd.b0) add('Некорректные размеры элемента');
    if (e.type !== 'stand' && (!near(e.x0, c.l) || !near(e.x1, c.r))) add('Нет боковой опоры на всю ширину. Разместите элемент заново в секции');
    if (e.type === 'stand' && (!near(e.y0, c.b) || !near(e.y1, c.t))) add('Стойка должна опираться на дно и верх своей секции');
    if (e.type === 'panto' && !near(e.y, c.t)) add('Пантограф должен крепиться к верху секции');

    if (bd.x0 < I.x0 - 0.5 || bd.x1 > I.x1 + 0.5 || bd.b0 < I.y0 - 0.5 || bd.b1 > I.y1 + 0.5) {
      add('Элемент выходит за габариты шкафа'); return out;
    }
    for (const o of others) {
      const ob = bandOf(o);
      if (ovX(bd, ob) && ovY(bd, ob)) {
        add(e.type === 'stand'
          ? `Стойка разрежет элемент «${TYPES[o.type].name}». Сначала уберите его`
          : `Пересекается с элементом «${TYPES[o.type].name}»`);
      }
    }
    const isHz = e.type !== 'stand';
    const nb = isHz ? neighbors(bd, others, c) : null;

    if (e.type === 'shelf') {
      if (w > R.shelf.maxSpan) add(`Полка ${w} мм длиннее ${R.shelf.maxSpan} мм и прогнётся. Поставьте стойку`);
      const gb = mm(e.y - c.b), ga = mm(c.t - e.y - T);
      if (gb < R.shelf.minGap) add(`Снизу до полки или дна ${gb} мм, нужно от ${R.shelf.minGap}`);
      if (ga < R.shelf.minGap) add(`Сверху до полки или потолка ${ga} мм, нужно от ${R.shelf.minGap}`);
    }
    if (e.type === 'stand') {
      const lw = mm(e.x - c.l), rw = mm(c.r - e.x - T);
      if (lw < R.stand.minCell) add(`Секция слева выйдет ${lw} мм, минимум ${R.stand.minCell}`);
      if (rw < R.stand.minCell) add(`Секция справа выйдет ${rw} мм, минимум ${R.stand.minCell}`);
      if (e.y1 - e.y0 < 200) add('Слишком мало места по высоте для стойки');
    }
    if (e.type === 'rod' || e.type === 'panto') {
      const r = e.type === 'rod' ? R.rod : R.panto;
      const maxW = e.type === 'rod' ? R.rod.maxSpan : R.panto.maxWidth;
      if (w < r.minWidth) add(`Секция ${w} мм, для элемента нужно от ${r.minWidth}`);
      if (w > maxW) add(`Секция ${w} мм, максимум ${maxW}. Штанга провиснет — поставьте стойку`);
      const hang = mm((e.type === 'rod' ? e.y : bd.b0) - nb.below);
      const need = e.type === 'rod' ? R.rod.minHang : R.panto.minHang;
      if (hang < need) add(`Под ${e.type === 'rod' ? 'штангой' : 'пантографом'} ${hang} мм, для одежды нужно от ${need}`);
      if (e.type === 'rod' && nb.above - e.y < R.rod.minTopGap) add('Штанга вплотную к полке, вешалку не повесить');
      if (e.type === 'panto' && e.y < R.panto.minMount) add(`Пантограф крепится вверху: не ниже ${R.panto.minMount} мм от пола, сейчас ${mm(e.y)}`);
    }
    if (e.type === 'drawer' || e.type === 'shoe') {
      const r = R[e.type];
      if (w < r.minWidth) add(`Секция ${w} мм, нужно от ${r.minWidth}`);
      if (w > r.maxWidth) add(`Секция ${w} мм, максимум ${r.maxWidth}. Поставьте стойку`);
      // ponytail: conservative closed-door joint zones; replace with opening kinematics after technologist review.
      for (const j of doorLayout().joints) {
        if (bd.x0 < j.x1 && bd.x1 > j.x0) {
          add(`Зона стыка дверей (${mm(j.mid)} мм от края) запрещена упрощёнными правилами демо. Поставьте стойку так, чтобы ${e.type === 'drawer' ? 'ящик' : 'полка'} был за одной дверью`);
        }
      }
    }
    if (e.type === 'drawer') {
      const onBase = near(e.y, c.b) || others.some(o => o.type === 'drawer' && near(o.y + o.h, e.y) && near(o.x0, e.x0) && near(o.x1, e.x1));
      if (!onBase) add('Ящик должен стоять на дно секции или на другой ящик');
      if (e.y + e.h - I.y0 > R.drawer.maxTop) add(`Верх ящика ${mm(e.y + e.h - I.y0)} мм от дна, максимум ${R.drawer.maxTop}`);
    }
    if (e.type === 'shoe') {
      if (e.y - I.y0 > R.shoe.maxBottom) add(`Выкатная полка ставится в нижней части шкафа, не выше ${R.shoe.maxBottom} мм от дна`);
      const d = mm(nb.above - bd.b1);
      if (nb.above < I.y1 - 0.5 && d < R.shoe.clearAbove) add(`Над выкатной полкой ${d} мм, другие элементы — не ближе ${R.shoe.clearAbove}`);
    }
    // Обратные правила: новый элемент мешает уже стоящим.
    for (const o of others) {
      const ob = bandOf(o);
      if (!ovX(bd, ob)) continue;
      if (o.type === 'shoe' && ob.b1 <= bd.b0 + 0.5) {
        const d = mm(bd.b0 - ob.b1);
        if (d < R.shoe.clearAbove) add(`Над выкатной полкой останется ${d} мм, нужно от ${R.shoe.clearAbove}`);
      }
      if ((o.type === 'rod' || o.type === 'panto') && ob.b0 >= bd.b1 - 0.5) {
        const rest = others.filter(x => x !== o).concat([e]);
        const n2 = neighbors(ob, rest, cellOf(o, rest));
        if (near(n2.below, bd.b1)) {
          const need = o.type === 'rod' ? R.rod.minHang : R.panto.minHang;
          const hang = mm((o.type === 'rod' ? o.y : ob.b0) - bd.b1);
          if (hang < need) add(`Под ${o.type === 'rod' ? 'штангой' : 'пантографом'} останется ${hang} мм, для одежды нужно от ${need}`);
        }
      }
    }
    return out;
  }

  function dependents(E) {
    const res = [];
    for (const o of state.items) {
      if (o === E) continue;
      const ob = bandOf(o);
      if (E.type === 'stand' && o.type !== 'stand') {
        if ((near(ob.x0, E.x + T) || near(ob.x1, E.x)) && ob.b0 >= E.y0 - 0.5 && ob.b1 <= E.y1 + 0.5) res.push(o);
      }
      if (E.type === 'shelf') {
        if (o.type === 'stand' && o.x >= E.x0 - 0.5 && o.x + T <= E.x1 + 0.5 && (near(o.y0, E.y + T) || near(o.y1, E.y))) res.push(o);
        if ((o.type === 'drawer' || o.type === 'shoe') && near(o.y, E.y + T) && ovX(ob, bandOf(E))) res.push(o);
        if (o.type === 'panto' && near(o.y, E.y) && ovX(ob, bandOf(E))) res.push(o);
      }
      if (E.type === 'drawer' && o.type === 'drawer' && near(o.y, E.y + E.h) && near(o.x0, E.x0)) res.push(o);
    }
    return res;
  }
  function cascade(E, acc = new Set()) {
    if (acc.has(E)) return acc;
    acc.add(E);
    for (const d of dependents(E)) cascade(d, acc);
    return acc;
  }

  function revalidateAll() {
    invalid = new Map();
    for (const e of state.items) {
      const iss = validate(e, e.id);
      if (iss.length) invalid.set(e.id, iss);
    }
  }

  function assemblyIssues(list = state.items) {
    return [...new Set(list.flatMap(e => validate(e, e.id, list).map(s => `${TYPES[e.type].name}: ${s}`)))];
  }
  function resultIssues(e, ignore) {
    const list = state.items.filter(o => o.id !== ignore).concat([{ ...e, id: ignore || state.nextId }]);
    if (list.length > C.maxItems) return [`Максимум ${C.maxItems} элементов`];
    return assemblyIssues(list);
  }
  function place(type, px, py) {
    const e = candidate(type, px, py, null);
    if (!e || resultIssues(e, null).length) return false;
    e.id = state.nextId++;
    state.items.push(e);
    return true;
  }

  // ---------- фасад: дерево равных делений ----------
  let selectedDoor = 0, selectedInsert = '';
  function resizeDoorDesigns(n) {
    state.doorDesigns = Array.from({length:n}, (_, i) => state.doorDesigns[i] || {material:'ldsp'});
    state.doors = n;
    selectedDoor = Math.min(selectedDoor, n - 1); selectedInsert = '';
  }
  function designLayout(tree, w, h, x = 0, y = 0, path = '', result = {leaves:[],dividers:[]}) {
    if (Object.hasOwn(tree, 'material')) result.leaves.push({x,y,w,h,path,material:tree.material});
    else {
      const horizontal = tree.axis === 'horizontal';
      const cw = horizontal ? w : w / 2, ch = horizontal ? h / 2 : h;
      result.dividers.push(horizontal ? {x1:x,y1:y+ch,x2:x+w,y2:y+ch,length:w} : {x1:x+cw,y1:y,x2:x+cw,y2:y+h,length:h});
      designLayout(tree.children[0],cw,ch,x,y,path+'0',result);
      designLayout(tree.children[1],cw,ch,x+(horizontal?0:cw),y+(horizontal?ch:0),path+'1',result);
    }
    return result;
  }
  function insertAt(door, path) {
    if (!Number.isInteger(door) || door < 0 || door >= state.doors || typeof path !== 'string' || !/^[01]{0,3}$/.test(path)) return null;
    let node = state.doorDesigns[door];
    for (const digit of path) { if (!node.children) return null; node = node.children[Number(digit)]; }
    return node;
  }
  function setInsertMaterial(door, path, material) {
    const node = insertAt(door,path);
    if (!node || !Object.hasOwn(node,'material') || typeof material !== 'string' || !Object.hasOwn(C.materials,material) || !C.materials[material].available) return false;
    node.material = material; return true;
  }
  function splitInsert(door, path, axis) {
    const node = insertAt(door,path);
    if (!node || !Object.hasOwn(node,'material') || !['horizontal','vertical'].includes(axis) || designLayout(state.doorDesigns[door],1,1).leaves.length >= 4) return false;
    const material = node.material; delete node.material;
    node.axis = axis; node.children = [{material},{material}]; return true;
  }
  function resetDoorDesign(door) {
    if (!insertAt(door,'')) return false;
    state.doorDesigns[door] = {material:'ldsp'}; return true;
  }
  function applyDesignToAll(door) {
    if (!insertAt(door,'')) return false;
    const source = state.doorDesigns[door];
    state.doorDesigns = Array.from({length:state.doors}, () => clone(source)); return true;
  }

  // ---------- цена ----------
  function price() {
    const I = interior();
    const lines = [];
    const inD = state.D - C.doorZone;
    let area = 0, edge = 0, fix = 0;
    const sides = (state.walls.left ? 1 : 0) + (state.walls.right ? 1 : 0);
    area += sides * state.H * state.D; edge += sides * state.H;
    const tb = (state.walls.top ? 1 : 0) + (state.walls.bottom ? 1 : 0);
    area += tb * (I.x1 - I.x0) * state.D; edge += tb * (I.x1 - I.x0);
    if (state.walls.bottom && state.plinth) { area += (I.x1 - I.x0) * C.plinth; edge += I.x1 - I.x0; }
    if (sides + tb > 0) fix += P.bodyFix;
    const cnt = { shelf: 0, stand: 0, rod: 0, drawer: 0, shoe: 0, panto: 0 };
    let rodLen = 0;
    for (const e of state.items) {
      cnt[e.type]++;
      if (e.type === 'shelf') { area += (e.x1 - e.x0) * inD; edge += e.x1 - e.x0; fix += P.shelfPins; }
      if (e.type === 'stand') { area += (e.y1 - e.y0) * inD; edge += e.y1 - e.y0; fix += P.standFix; }
      if (e.type === 'rod') rodLen += e.x1 - e.x0;
    }
    const m2 = area / 1e6;
    const ldsp = m2 * P.ldsp * (1 + P.waste / 100);
    lines.push([`ЛДСП ${m2.toFixed(2)} м² (+${P.waste}% на отход)`, ldsp]);
    lines.push([`Кромка ${(edge / 1000).toFixed(1)} пог. м`, edge / 1000 * P.edge]);
    if (state.kind === 'case') lines.push(['Задняя стенка ХДФ', state.W * state.H / 1e6 * P.hdf]);
    if (fix) lines.push(['Крепёж корпуса и полок', fix]);
    if (cnt.rod) lines.push([`Штанги ${cnt.rod} шт, ${(rodLen / 1000).toFixed(1)} м`, rodLen / 1000 * P.rodPerM + cnt.rod * 2 * P.rodFlange]);
    if (cnt.drawer) lines.push([`Ящики ${cnt.drawer} шт`, cnt.drawer * (P.drawer + P.drawerSlides)]);
    if (cnt.shoe) lines.push([`Выкатные полки ${cnt.shoe} шт`, cnt.shoe * P.shoe]);
    if (cnt.panto) lines.push([`Пантографы ${cnt.panto} шт`, cnt.panto * P.panto]);
    lines.forEach(l => { l[1] = Math.round(l[1]); });
    const mat = lines.reduce((s, l) => s + l[1], 0);
    lines.push([`Работа цеха ${P.workPercent}%`, Math.round(mat * P.workPercent / 100)]);
    const body = lines.reduce((s, l) => s + l[1], 0);

    const dl = doorLayout();
    const dh = state.H - C.doorHeightGap;
    const dArea = state.doors * dl.dw * dh / 1e6;
    let fillCost = 0, dividerLength = 0;
    const materialAreas = {};
    for (let i = 0; i < state.doors; i++) {
      const layout = designLayout(state.doorDesigns[i] || {material:'ldsp'},dl.dw,dh);
      for (const leaf of layout.leaves) {
        const area = leaf.w * leaf.h / 1e6;
        materialAreas[leaf.material] = (materialAreas[leaf.material] || 0) + area;
        fillCost += area * C.materials[leaf.material].rate;
      }
      dividerLength += layout.dividers.reduce((sum,d) => sum+d.length/1000,0);
    }
    const dLines = [
      ...Object.entries(materialAreas).map(([material,area]) => [`${C.materials[material].name}: ${area.toFixed(2)} м²`, area * C.materials[material].rate]),
      ...(dividerLength ? [[`Разделители (демо): ${dividerLength.toFixed(2)} пог. м`, dividerLength * P.doorDividerPerM]] : []),
      [`Профиль и ролики, ${state.doors} шт`, state.doors * (P.doorProfile + P.doorRollers + C.profiles[state.profile].extra)],
      [`Рельсы верх и низ ${(state.W / 1000).toFixed(2)} м`, 2 * state.W / 1000 * P.railPerM]
    ];
    dLines.forEach(l => { l[1] = Math.round(l[1]); });
    const doors = dLines.reduce((s, l) => s + l[1], 0);
    return { body, doors, lines, dLines, fillCost, dividerLength, dArea };
  }
  const rub = v => Math.round(v).toLocaleString('ru-RU') + ' ₽';

  // Actual app rules exposed for dependency-free Node vm checks.
  window.KONSTRUKTOR_TEST = {
    getState: snapshot, project, decodeProject,
    designLayout, setInsertMaterial, splitInsert, resetDoorDesign, applyDesignToAll, resizeDoorDesigns,
    withState(s, fn) { const old = snapshot(); try { restore(s); return fn(); } finally { restore(old); } },
    interior, bandOf, cellAt, candidate, validate, assemblyIssues, resultIssues, dependents, cascade, doorLayout, doorRange, price
  };
  if (window.KONSTRUKTOR_HEADLESS) return;

  // ---------- отрисовка ----------
  const svg = document.getElementById('cab');
  const Y = y => state.H - y;
  let fs = 40;

  function dimH(x0, x1, ys, label, cls = 'dim') {
    const t = fs * 0.28;
    return `<g class="${cls}"><line x1="${x0}" y1="${ys}" x2="${x1}" y2="${ys}"/>
      <line x1="${x0 - t}" y1="${ys + t}" x2="${x0 + t}" y2="${ys - t}"/><line x1="${x1 - t}" y1="${ys + t}" x2="${x1 + t}" y2="${ys - t}"/>
      <text x="${(x0 + x1) / 2}" y="${ys - fs * 0.35}" text-anchor="middle">${label}</text></g>`;
  }
  function dimV(xs, y0, y1, label, cls = 'dim') {
    const t = fs * 0.28, my = (y0 + y1) / 2;
    return `<g class="${cls}"><line x1="${xs}" y1="${y0}" x2="${xs}" y2="${y1}"/>
      <line x1="${xs - t}" y1="${y0 + t}" x2="${xs + t}" y2="${y0 - t}"/><line x1="${xs - t}" y1="${y1 + t}" x2="${xs + t}" y2="${y1 - t}"/>
      <text x="${xs - fs * 0.35}" y="${my}" text-anchor="middle" transform="rotate(-90 ${xs - fs * 0.35} ${my})">${label}</text></g>`;
  }

  function drawItem(e, extra = '') {
    const bd = bandOf(e);
    const x = bd.x0, w = bd.x1 - bd.x0;
    let s = '';
    switch (e.type) {
      case 'shelf': s = `<rect x="${x}" y="${Y(e.y + T)}" width="${w}" height="${T}" class="wood"/>`; break;
      case 'stand': s = `<rect x="${e.x}" y="${Y(e.y1)}" width="${T}" height="${e.y1 - e.y0}" class="wood"/>`; break;
      case 'rod': s = `<rect x="${x}" y="${Y(e.y) - 14}" width="12" height="28" class="flange"/><rect x="${x + w - 12}" y="${Y(e.y) - 14}" width="12" height="28" class="flange"/>
        <line x1="${x + 8}" y1="${Y(e.y)}" x2="${x + w - 8}" y2="${Y(e.y)}" class="rod"/>`; break;
      case 'drawer': {
        const hw = Math.min(160, w * 0.3);
        s = `<rect x="${x + 4}" y="${Y(e.y + e.h) + 3}" width="${w - 8}" height="${e.h - 6}" rx="4" class="front"/>
          <line x1="${x + w / 2 - hw / 2}" y1="${Y(e.y + e.h / 2)}" x2="${x + w / 2 + hw / 2}" y2="${Y(e.y + e.h / 2)}" class="handle"/>`; break;
      }
      case 'shoe': {
        const y0 = Y(e.y), y1 = Y(e.y + e.h);
        s = `<rect x="${x + 10}" y="${y1}" width="${w - 20}" height="${e.h}" class="wire"/>
          <path d="M${x + 10} ${y0 - 20} L${x + w - 10} ${y1 + 60} M${x + 10} ${y0 - 120} L${x + w - 10} ${y1 + 10}" class="wire"/>`; break;
      }
      case 'panto': {
        const top = Y(e.y), bot = Y(e.y - R.panto.h);
        s = `<rect x="${x}" y="${top}" width="${w}" height="20" class="flange"/>
          <path d="M${x + 30} ${top + 20} L${x + 60} ${bot} M${x + w - 30} ${top + 20} L${x + w - 60} ${bot}" class="wire"/>
          <line x1="${x + 50}" y1="${bot}" x2="${x + w - 50}" y2="${bot}" class="rod"/>`; break;
      }
    }
    return `<g ${extra}>${s}</g>`;
  }

  function outline(e, cls) {
    const bd = bandOf(e), p = 6;
    return `<rect x="${bd.x0 - p}" y="${Y(bd.b1) - p}" width="${bd.x1 - bd.x0 + 2 * p}" height="${bd.b1 - bd.b0 + 2 * p}" rx="6" class="${cls}"/>`;
  }

  // Размеры вокруг элемента: свободное место сверху/снизу или ширины секций.
  function elementDims(e, ignore) {
    const others = state.items.filter(o => o.id !== ignore && o !== e);
    const c = cellOf(e, others);
    const bd = bandOf(e);
    let s = '';
    if (e.type === 'stand') {
      const ym = Y((e.y0 + e.y1) / 2);
      if (e.x - c.l > 40) s += dimH(c.l, e.x, ym, mm(e.x - c.l), 'dim live');
      if (c.r - e.x - T > 40) s += dimH(e.x + T, c.r, ym, mm(c.r - e.x - T), 'dim live');
    } else {
      const nb = neighbors(bd, others, c);
      const xs = bd.x1 - Math.min(90, (bd.x1 - bd.x0) * 0.15);
      if (bd.b0 - nb.below > 30) s += dimV(xs, Y(bd.b0), Y(nb.below), mm(bd.b0 - nb.below), 'dim live');
      if (nb.above - bd.b1 > 30) s += dimV(xs, Y(nb.above), Y(bd.b1), mm(nb.above - bd.b1), 'dim live');
      s += dimH(bd.x0, bd.x1, Y(bd.b1) - fs * 0.3, mm(bd.x1 - bd.x0), 'dim live');
    }
    return s;
  }

  function render() {
    const I = interior();
    const W = state.W, H = state.H;
    const padL = 260, padR = 140, padT = 200, padB = 260;
    fs = clamp((W + padL + padR) / 46, 34, 80);
    svg.setAttribute('viewBox', `${-padL} ${-padT} ${W + padL + padR} ${H + padT + padB}`);
    const dl = doorLayout();
    let s = `<style>
      .wood{fill:#D9C3A0;stroke:#8E7556;stroke-width:1;vector-effect:non-scaling-stroke}
      .body{fill:#CDB48E;stroke:#8E7556;stroke-width:1;vector-effect:non-scaling-stroke}
      .inside{fill:#F7F3EB;stroke:#8E7556;stroke-width:1;vector-effect:non-scaling-stroke}
      .opening{fill:none;stroke:#1D1A1B;stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
      .front{fill:#E3D0B1;stroke:#8E7556;stroke-width:1;vector-effect:non-scaling-stroke}
      .handle{stroke:#4C4648;stroke-width:3;stroke-linecap:round;vector-effect:non-scaling-stroke}
      .rod{stroke:#8A8D91;stroke-width:5;stroke-linecap:round;vector-effect:non-scaling-stroke}
      .flange{fill:#4C4648}
      .wire{fill:none;stroke:#8A8D91;stroke-width:2;vector-effect:non-scaling-stroke}
      .dim line{stroke:#1D1A1B;stroke-width:1;vector-effect:non-scaling-stroke}
      .dim text{font-size:${fs}px;fill:#1D1A1B}
      .dim.live line{stroke:#5E1A28}.dim.live text{fill:#5E1A28;font-weight:600}
      .dim.door text{fill:#4C4648;font-size:${fs * 0.85}px}
      .joint{stroke:#5E1A28;stroke-width:1;stroke-dasharray:3 5;opacity:.55;vector-effect:non-scaling-stroke}
      .jzone{fill:#5E1A28;opacity:.07}
      .sel{fill:none;stroke:#5E1A28;stroke-width:2;vector-effect:non-scaling-stroke}
      .ok{fill:rgba(47,107,69,.14);stroke:#2F6B45;stroke-width:2;vector-effect:non-scaling-stroke}
      .bad{fill:rgba(179,38,30,.18);stroke:#B3261E;stroke-width:2;vector-effect:non-scaling-stroke}
      .floor{stroke:#4C4648;stroke-width:2;vector-effect:non-scaling-stroke}
      .jlabel{font-size:${fs * 0.7}px;fill:#5E1A28;opacity:.8}
      .ghost{opacity:.85}
    </style>`;
    // пол
    s += `<line x1="${-padL}" y1="${H}" x2="${W + padR}" y2="${H}" class="floor"/>`;
    // проём и корпус
    s += `<rect x="0" y="0" width="${W}" height="${H}" class="opening"/>`;
    s += `<rect x="${I.x0}" y="${Y(I.y1)}" width="${I.x1 - I.x0}" height="${I.y1 - I.y0}" class="inside"/>`;
    if (state.walls.left) s += `<rect x="0" y="0" width="${T}" height="${H}" class="body"/>`;
    if (state.walls.right) s += `<rect x="${W - T}" y="0" width="${T}" height="${H}" class="body"/>`;
    if (state.walls.top) s += `<rect x="${I.x0}" y="0" width="${I.x1 - I.x0}" height="${T}" class="body"/>`;
    if (state.walls.bottom) s += `<rect x="${I.x0}" y="${Y(I.y0)}" width="${I.x1 - I.x0}" height="${T}" class="body"/>`;
    if (state.walls.bottom && state.plinth) s += `<rect x="${I.x0 + 20}" y="${Y(C.plinth)}" width="${I.x1 - I.x0 - 40}" height="${C.plinth}" class="body"/>`;
    // стыки дверей
    for (const j of dl.joints) {
      s += `<rect x="${j.x0}" y="${Y(I.y1)}" width="${j.x1 - j.x0}" height="${I.y1 - I.y0}" class="jzone"/>`;
      s += `<line x1="${j.mid}" y1="${Y(I.y1)}" x2="${j.mid}" y2="${Y(I.y0)}" class="joint"/>`;
    }
    // элементы
    for (const e of state.items) {
      const moving = drag && drag.kind === 'move' && drag.id === e.id && ghost;
      s += drawItem(e, `data-id="${e.id}"${moving ? ' opacity=".25"' : ''}`);
      if (invalid.has(e.id)) s += outline(e, 'bad');
    }
    const sel = state.items.find(e => e.id === state.sel);
    if (sel && !ghost) { s += outline(sel, 'sel'); s += elementDims(sel, sel.id); }
    // призрак при перетаскивании
    if (ghost) {
      const ig = drag && drag.kind === 'move' ? drag.id : null;
      s += `<g class="ghost" pointer-events="none">${drawItem(ghost.cand)}${outline(ghost.cand, ghost.issues.length ? 'bad' : 'ok')}${elementDims(ghost.cand, ig)}</g>`;
    }
    // размеры
    s += dimH(0, W, -fs * 1.6, W);
    s += dimV(-fs * 2.2, 0, H, H);
    if (I.y1 - I.y0 !== H) s += dimV(-fs * 0.9, Y(I.y1), Y(I.y0), mm(I.y1 - I.y0));
    const dy = H + fs * 2.4;
    for (const d of dl.doors) s += dimH(d.x0, d.x1, dy + (dl.doors.indexOf(d) % 2) * fs * 1.3, mm(d.x1 - d.x0), 'dim door');
    svg.innerHTML = s;
    renderSide();
    renderStatus();
    renderSteps();
  }

  function renderSteps() {
    document.querySelector('.layout').dataset.currentStep = step;
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = !el.dataset.only.split(' ').includes(String(step)); });
    $('palette').hidden = step !== 2;
    document.querySelectorAll('[data-step]').forEach(b => {
      const active = +b.dataset.step === step;
      b.parentElement.className = active ? 'now' : +b.dataset.step < step ? 'done' : '';
      if (active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('back').disabled = step === 1; $('next').hidden = step === 4;
    $('next').textContent = ['','К наполнению','К выбору дверей','К итогу'][step] || '';
    $('undo').disabled = !history.length;
    selectedDoor = Math.min(selectedDoor,state.doors-1);
    const dl = doorLayout(), p = price(), dh = state.H-C.doorHeightGap;
    const layouts = state.doorDesigns.map(tree => designLayout(tree,dl.dw,dh));
    const leaves = layouts[selectedDoor].leaves;
    if (!leaves.some(l => l.path === selectedInsert)) selectedInsert = leaves[0].path;
    const selected = leaves.find(l => l.path === selectedInsert);
    $('doorMaterial').value = selected.material; $('doorProfile').value = state.profile;
    $('doorChoices').innerHTML = dl.doors.map((_,i) => `<button type="button" data-door="${i}" aria-pressed="${i===selectedDoor}">Дверь ${i+1}</button>`).join('');
    $('insertChoices').innerHTML = leaves.map((l,i) => `<button type="button" data-insert="${l.path}" aria-pressed="${l.path===selectedInsert}">Вставка ${i+1}</button>`).join('');
    $('doorSelection').textContent = `Дверь ${selectedDoor+1}, вставка ${leaves.indexOf(selected)+1} из ${leaves.length}: ${C.materials[selected.material].name}, ${mm(selected.w)} × ${mm(selected.h)} мм.`;
    $('splitHorizontal').disabled = $('splitVertical').disabled = leaves.length >= 4;
    $('facade').setAttribute('viewBox', `-100 -160 ${state.W + 200} ${state.H + 400}`);
    $('facade').innerHTML = dl.doors.map((d,i) => {
      const layout = layouts[i], color = C.profiles[state.profile].color;
      return `<g>${layout.leaves.map((l,j) => `<g data-door="${i}" data-insert="${l.path}"><rect x="${d.x0+l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="${C.materials[l.material].color}"/><text x="${d.x0+l.x+l.w/2}" y="${l.y+l.h/2}" text-anchor="middle" font-size="38" fill="${l.material==='walnut'?'#fff':'#1D1A1B'}" pointer-events="none">${i+1}.${j+1} · ${C.materials[l.material].name}</text></g>`).join('')}
        ${layout.dividers.map(line => `<line x1="${d.x0+line.x1}" y1="${line.y1}" x2="${d.x0+line.x2}" y2="${line.y2}" stroke="${color}" stroke-width="12" pointer-events="none"/>`).join('')}
        <rect x="${d.x0}" y="0" width="${dl.dw}" height="${dh}" fill="none" stroke="${color}" stroke-width="14" pointer-events="none"/>
        ${step===3 && i===selectedDoor ? `<rect x="${d.x0+selected.x+14}" y="${selected.y+14}" width="${selected.w-28}" height="${selected.h-28}" fill="none" stroke="#5E1A28" stroke-width="8" stroke-dasharray="24 12" pointer-events="none"/>` : ''}
        <text x="${(d.x0+d.x1)/2}" y="${dh+65}" text-anchor="middle" font-size="40">Дверь ${i+1} · ${mm(dl.dw)} мм</text></g>`;
    }).join('') + `<text x="${state.W/2}" y="-60" text-anchor="middle" font-size="50">${state.W} × ${state.H} мм</text><text x="${state.W/2}" y="${state.H+110}" text-anchor="middle" font-size="44">Высота створки ${dh} мм</text>`;
    const counts = Object.keys(TYPES).map(t => { const n = state.items.filter(e => e.type === t).length; return n ? `${TYPES[t].name}: ${n}` : ''; }).filter(Boolean);
    $('summaryText').textContent = `${state.kind === 'case' ? 'Корпусный' : 'Встроенный'} шкаф ${state.W} × ${state.H} × ${state.D} мм. Стенки: ${Object.entries(state.walls).filter(([,v]) => v).map(([k]) => ({left:'левая',right:'правая',top:'верх',bottom:'дно'})[k]).join(', ') || 'нет'}. Цоколь: ${state.plinth ? 'да' : 'нет'}. ${counts.join('; ') || 'Без наполнения'}. Двери: ${state.doors}; ${layouts.map((layout,i) => `дверь ${i+1}: ${layout.leaves.map((l,j) => `вставка ${j+1} — ${C.materials[l.material].name} (${mm(l.w)} × ${mm(l.h)} мм)`).join(', ')}`).join('; ')}. Разделители: ${p.dividerLength.toFixed(2)} пог. м. Профиль ${C.profiles[state.profile].name}. Корпус ${rub(p.body)}, двери ${rub(p.doors)}, всего ${rub(p.body+p.doors)}.`;
  }
  function go(n) {
    const badInput = [...document.querySelectorAll('.size input[type=number]')].find(el => !el.checkValidity() || el.value.trim() === '');
    const issues = assemblyIssues();
    if (n > step && (badInput || issues.length)) { say(badInput ? 'Введите корректные размеры, мм.' : issues.join('. '), 'bad'); if (badInput) badInput.reportValidity(); return; }
    step = n; armed = null; drag = null; ghost = null; state.sel = null; flash = null; render();
  }

  // ---------- боковая панель ----------
  const $ = id => document.getElementById(id);
  function renderSide() {
    const p = price();
    $('pBody').textContent = rub(p.body);
    $('pDoors').textContent = rub(p.doors);
    $('pTotal').textContent = rub(p.body + p.doors);
    $('lines').innerHTML =
      p.lines.map(l => `<li><span>${l[0]}</span><b>${rub(l[1])}</b></li>`).join('') +
      `<li class="sub"><span>Шкаф</span><b>${rub(p.body)}</b></li>` +
      p.dLines.map(l => `<li><span>${l[0]}</span><b>${rub(l[1])}</b></li>`).join('') +
      `<li class="sub"><span>Двери</span><b>${rub(p.doors)}</b></li>`;
    $('dCount').textContent = state.doors;
    $('inW').value = state.W; $('inH').value = state.H; $('inD').value = state.D;
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-checked', b.dataset.kind === state.kind));
    $('wLeft').checked = state.walls.left; $('wRight').checked = state.walls.right;
    $('wTop').checked = state.walls.top; $('wBottom').checked = state.walls.bottom;
    $('plinth').checked = state.plinth; $('plinth').disabled = !state.walls.bottom;
    $('next').setAttribute('aria-disabled', invalid.size ? 'true' : 'false');

    const info = $('info');
    const sel = state.items.find(e => e.id === state.sel);
    const showType = (drag && drag.type) || armed;
    if (sel) {
      const bd = bandOf(sel);
      const iss = invalid.get(sel.id);
      info.innerHTML = `<h3>${TYPES[sel.type].name}</h3>
        <p class="dims">${sel.type === 'stand' ? `высота ${mm(sel.y1 - sel.y0)} мм` : `ширина ${mm(bd.x1 - bd.x0)} мм, ${mm(bd.b0 - interior().y0)} мм от дна`}</p>
        <p>${TYPES[sel.type].desc}</p>
        ${iss ? `<p style="color:var(--bad)">${iss.join('. ')}</p>` : ''}
        <button type="button" class="del" id="del">Удалить элемент</button>`;
      $('del').onclick = () => removeItem(sel);
    } else if (showType) {
      info.innerHTML = `<h3>${TYPES[showType].name}</h3><p>${TYPES[showType].desc}</p>`;
    } else {
      info.innerHTML = `<h3>Как собирать</h3><p>Перетащите элемент сверху на схему. Зелёная рамка — сюда можно, красная — нельзя, причина появится под схемой. На телефоне нажмите на элемент, потом на место в шкафу.</p><p>Нажмите на поставленный элемент, чтобы увидеть размеры, передвинуть или удалить.</p>`;
    }
    document.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-pressed', t.dataset.type === armed));
  }

  function renderStatus() {
    const st = $('status');
    st.className = 'status';
    if (ghost) {
      if (ghost.issues.length) { st.classList.add('bad'); st.textContent = 'Сюда нельзя: ' + ghost.issues.join('. '); }
      else { st.classList.add('ok'); st.textContent = `Сюда можно: ${TYPES[ghost.cand.type].name.toLowerCase()} ${mm(bandOf(ghost.cand).x1 - bandOf(ghost.cand).x0)} мм. Отпустите, чтобы поставить`; }
      return;
    }
    if (flash) {
      if (flash.cls) st.classList.add(flash.cls);
      st.innerHTML = flash.html || '';
      if (!flash.html) st.textContent = flash.text;
      return;
    }
    if (invalid.size) {
      st.classList.add('bad');
      st.textContent = `Элементов с нарушениями: ${invalid.size}. Они обведены красным, исправьте или удалите их.`;
      return;
    }
    if (armed) { st.textContent = `Нажмите на место в шкафу, куда поставить ${TYPES[armed].acc}. Esc — отмена.`; return; }
    st.textContent = state.items.length
      ? `Элементов: ${state.items.length}. Цена пересчитывается после каждого действия.`
      : 'Шкаф пустой. Перетащите сверху полку, стойку или штангу.';
  }

  function say(text, cls) { flash = { text, cls }; renderStatus(); }

  // ---------- действия ----------
  function removeItem(E, force) {
    const set = cascade(E);
    if (set.size > 1 && !force) {
      const names = [...set].filter(x => x !== E).map(x => TYPES[x.type].name.toLowerCase());
      flash = { cls: 'bad', html: `На этот элемент опираются: ${names.join(', ')}. <button type="button" id="delAll">Удалить вместе (${set.size})</button>` };
      renderStatus();
      $('delAll').onclick = () => removeItem(E, true);
      return;
    }
    remember();
    state.items = state.items.filter(x => !set.has(x));
    persist();
    state.sel = null;
    revalidateAll();
    flash = { text: `Удалено элементов: ${set.size}.` };
    render();
  }

  function applyResize(mut) {
    const beforeState = snapshot();
    const old = interior();
    mut();
    if (!state.walls.bottom) state.plinth = false;
    const nw = interior();
    const map = (v, a, b) => near(v, a) ? b : v;
    for (const e of state.items) {
      if ('x0' in e) { e.x0 = map(e.x0, old.x0, nw.x0); e.x1 = map(e.x1, old.x1, nw.x1); }
      if (e.type === 'stand') { e.y0 = map(e.y0, old.y0, nw.y0); e.y1 = map(e.y1, old.y1, nw.y1); }
      if (e.type === 'drawer' || e.type === 'shoe') e.y = map(e.y, old.y0, nw.y0);
      if (e.type === 'panto') e.y = map(e.y, old.y1, nw.y1);
    }
    // Keep every item; reject whole resize when resultant assembly cannot be retained.
    const range = doorRange();
    let msg = '';
    if (range.length && !range.includes(state.doors)) {
      const n = range.reduce((a, b) => Math.abs(b - state.doors) < Math.abs(a - state.doors) ? b : a);
      msg = `Число дверей изменено на ${n}: при этой ширине дверь должна быть ${C.limits.doorWidth[0]}–${C.limits.doorWidth[1]} мм. `;
      state.doors = n;
    }
    const issues = assemblyIssues();
    if (!range.length || issues.length) {
      restore(beforeState); revalidateAll(); render();
      say('Изменение отклонено, сборка сохранена. ' + (issues.join('. ') || 'Для этой ширины нет допустимых дверей.'), 'bad'); return;
    }
    resizeDoorDesigns(state.doors);
    history.push(beforeState); if (history.length > 40) history.shift();
    persist(); revalidateAll();
    flash = msg ? { text: msg.trim() } : null;
    render();
  }

  function setNum(key, input) {
    const lim = C.limits[{ W: 'width', H: 'height', D: 'depth' }[key]];
    const v = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(v) || !Number.isInteger(v) || v < lim[0] || v > lim[1]) {
      input.setCustomValidity(`Введите целое число от ${lim[0]} до ${lim[1]} мм`);
      say(input.validationMessage, 'bad'); return;
    }
    input.setCustomValidity('');
    applyResize(() => { state[key] = v; });
  }

  function loadSample() {
    if (state.items.length && !confirm('Заменить текущее наполнение примером? Изменение можно отменить.')) return;
    remember();
    state.items = []; state.sel = null;
    const I = interior();
    const dl = doorLayout();
    const W = I.x1 - I.x0;
    // стойки сразу за левым и перед правым стыком, чтобы ящики были за одной дверью
    const js = dl.joints;
    const sx1 = js.length ? js[0].x0 - T / 2 - 2 : I.x0 + W * 0.33;
    const sx2 = js.length > 1 ? js[js.length - 1].x1 + T / 2 + 2 : I.x0 + W * 0.66;
    const yb = I.y0, yt = I.y1;
    place('stand', sx1, (yb + yt) / 2);
    if (sx2 - sx1 > 400) place('stand', sx2, (yb + yt) / 2);
    const lx = (I.x0 + sx1) / 2, rx = (sx2 + I.x1) / 2, mx = (sx1 + sx2) / 2;
    // левая секция: ящики, штанга, две полки сверху
    place('drawer', lx, yb + 50); place('drawer', lx, yb + 230); place('drawer', lx, yb + 410);
    place('shelf', lx, yt - 520); place('shelf', lx, yt - 260);
    place('rod', lx, yt - 520 - 90);
    // середина: полка и длинная штанга
    place('shelf', mx, yt - 420);
    place('rod', mx, yt - 500);
    // правая: обувь и полки
    place('shoe', rx, yb + 50);
    for (let y = yb + 820; y < yt - 200; y += 340) place('shelf', rx, y);
    revalidateAll();
    persist();
    flash = { text: `Пример собран: ${state.items.length} элементов. Попробуйте перетащить ящик за стык дверей или полку вплотную к другой.` };
    render();
  }

  // ---------- ввод ----------
  function toMM(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: state.H - p.y };
  }
  function overSvg(ev) {
    const r = svg.getBoundingClientRect();
    if (!(ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom)) return false;
    const p = toMM(ev), I = interior();
    return p.x >= I.x0 && p.x <= I.x1 && p.y >= I.y0 && p.y <= I.y1;
  }
  function updateGhost(ev) {
    if (!overSvg(ev)) { ghost = null; return; }
    const p = toMM(ev);
    const ig = drag && drag.kind === 'move' ? drag.id : null;
    const type = drag ? drag.type : armed;
    const cand = candidate(type, p.x, p.y, ig);
    ghost = { cand, issues: resultIssues(cand, ig) };
  }

  const pal = $('palette');
  pal.innerHTML = Object.keys(TYPES).map(k =>
    `<button type="button" class="tile" data-type="${k}" aria-pressed="false" title="${TYPES[k].desc}">
      <svg viewBox="0 0 64 40" aria-hidden="true">${ICONS[k]}</svg>${TYPES[k].name}</button>`).join('');

  pal.addEventListener('pointerdown', ev => {
    const tile = ev.target.closest('.tile');
    if (!tile) return;
    drag = { kind: 'new', type: tile.dataset.type, sx: ev.clientX, sy: ev.clientY, moved: false, tile };
    flash = null;
  });
  pal.addEventListener('click', ev => {
    // клавиатура: Enter/пробел на плитке — режим «нажми на место»
    const tile = ev.target.closest('.tile');
    if (tile && ev.detail === 0) { armed = armed === tile.dataset.type ? null : tile.dataset.type; state.sel = null; render(); }
  });
  pal.addEventListener('mouseover', ev => {
    const tile = ev.target.closest('.tile');
    if (tile && !drag && !state.sel && !armed) { $('info').innerHTML = `<h3>${TYPES[tile.dataset.type].name}</h3><p>${TYPES[tile.dataset.type].desc}</p>`; }
  });

  svg.addEventListener('pointerdown', ev => {
    if (step !== 2 || !overSvg(ev)) return;
    flash = null;
    const g = ev.target.closest('[data-id]');
    if (armed) { // режим тапа: ставим по точке
      updateGhostFor(armed, ev);
      if (ghost && !ghost.issues.length) {
        remember();
        ghost.cand.id = state.nextId++; state.items.push(ghost.cand); state.sel = null;
        persist();
        revalidateAll(); flash = { text: `${TYPES[armed].name} поставлена. Можно ставить ещё или нажмите Esc.`, cls: 'ok' };
      } else if (ghost) { flash = { text: 'Сюда нельзя: ' + ghost.issues.join('. '), cls: 'bad' }; }
      ghost = null; render(); return;
    }
    if (g) {
      const id = +g.dataset.id;
      state.sel = id;
      const e = state.items.find(x => x.id === id);
      drag = { kind: 'move', id, type: e.type, sx: ev.clientX, sy: ev.clientY, moved: false };
      svg.setPointerCapture(ev.pointerId);
    } else state.sel = null;
    render();
  });
  function updateGhostFor(type, ev) {
    const p = toMM(ev);
    const cand = candidate(type, p.x, p.y, null);
    ghost = { cand, issues: resultIssues(cand, null) };
  }
  svg.addEventListener('pointermove', ev => {
    if (armed && !drag && ev.pointerType === 'mouse') { updateGhost(ev); render(); }
  });
  svg.addEventListener('pointerleave', () => { if (armed && !drag) { ghost = null; render(); } });

  window.addEventListener('pointermove', ev => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.kind === 'move') {
        const e = state.items.find(x => x.id === drag.id);
        const deps = cascade(e); deps.delete(e);
        if (deps.size) {
          say(`Нельзя двигать: на ${TYPES[e.type].name.toLowerCase()} опираются ${[...deps].map(x => TYPES[x.type].name.toLowerCase()).join(', ')}.`, 'bad');
          drag = null; return;
        }
      }
      armed = null;
    }
    updateGhost(ev);
    render();
  });
  window.addEventListener('pointerup', ev => {
    if (!drag) return;
    if (drag.moved) updateGhost(ev);
    const d = drag; drag = null;
    if (!d.moved) {
      if (d.kind === 'new') { armed = armed === d.type ? null : d.type; state.sel = null; }
      ghost = null; render(); return;
    }
    if (ghost && !ghost.issues.length) {
      remember();
      if (d.kind === 'new') { ghost.cand.id = state.nextId++; state.items.push(ghost.cand); state.sel = ghost.cand.id; flash = null; }
      else {
        const i = state.items.findIndex(x => x.id === d.id);
        ghost.cand.id = d.id; state.items[i] = ghost.cand; state.sel = d.id;
      }
      revalidateAll(); persist();
    } else if (ghost) {
      flash = { text: 'Не поставлено. ' + ghost.issues.join('. '), cls: 'bad' };
    }
    ghost = null;
    render();
  });
  window.addEventListener('pointercancel', () => { drag = null; ghost = null; render(); });

  window.addEventListener('keydown', ev => {
    if (ev.target.matches('input, select, textarea, button')) { if (ev.key !== 'Escape') return; }
    if (ev.key === 'Escape') { armed = null; drag = null; ghost = null; state.sel = null; flash = null; render(); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.sel) {
      const e = state.items.find(x => x.id === state.sel); if (e) { ev.preventDefault(); removeItem(e); }
    }
  });

  ['W', 'H', 'D'].forEach(k => {
    const inp = $('in' + k);
    const limits = C.limits[{W:'width',H:'height',D:'depth'}[k]];
    inp.min = limits[0]; inp.max = limits[1]; inp.step = 1; inp.required = true;
    inp.addEventListener('input', () => { inp.setCustomValidity(''); });
    inp.addEventListener('change', () => setNum(k, inp));
  });
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind;
    applyResize(() => {
      state.kind = kind;
      state.walls = kind === 'case'
        ? { left: true, right: true, top: true, bottom: true }
        : { left: false, right: false, top: false, bottom: true };
    });
  }));
  [['wLeft', 'left'], ['wRight', 'right'], ['wTop', 'top'], ['wBottom', 'bottom']].forEach(([id, k]) => {
    $(id).addEventListener('change', ev => applyResize(() => { state.walls[k] = ev.target.checked; }));
  });
  $('plinth').addEventListener('change', ev => applyResize(() => { state.plinth = ev.target.checked; }));
  function stepDoors(dir) {
    const range = doorRange();
    const n = state.doors + dir;
    if (!range.includes(n)) {
      say(`При ширине проёма ${mm(interior().x1 - interior().x0)} мм дверей может быть от ${range[0]} до ${range[range.length - 1]}: одна дверь ${C.limits.doorWidth[0]}–${C.limits.doorWidth[1]} мм.`, 'bad');
      return;
    }
    const old = state.doors; state.doors = n;
    const issues = assemblyIssues(); state.doors = old;
    if (issues.length) { say('Число дверей не изменено. ' + issues.join('. '), 'bad'); return; }
    remember(); resizeDoorDesigns(n); persist(); revalidateAll(); flash = null; render();
  }
  $('dMinus').onclick = () => stepDoors(-1);
  $('dPlus').onclick = () => stepDoors(1);
  $('clear').onclick = () => { if (!state.items.length || !confirm('Удалить всё наполнение? Изменение можно отменить.')) return; remember(); state.items = []; state.sel = null; invalid = new Map(); persist(); flash = { text: 'Шкаф очищен.' }; render(); };
  $('sample').onclick = loadSample;
  $('next').onclick = () => go(Math.min(4, step + 1));
  $('back').onclick = () => go(Math.max(1, step - 1));
  document.querySelectorAll('[data-step], [data-go]').forEach(b => { b.onclick = () => go(+(b.dataset.step || b.dataset.go)); });
  $('undo').onclick = () => { if (!history.length) return; restore(history.pop()); armed = drag = ghost = null; revalidateAll(); persist(); flash = {text:'Последнее изменение отменено.'}; render(); };
  $('placeNumeric').onclick = () => {
    const x = Number($('placeX').value), y = Number($('placeY').value), I = interior();
    if (!armed) { say('Сначала выберите элемент сверху.', 'bad'); return; }
    if (!$('placeX').value.trim() || !$('placeY').value.trim() || !Number.isFinite(x) || !Number.isFinite(y) || x < I.x0 || x > I.x1 || y < I.y0 || y > I.y1) { say('Укажите X и Y внутри шкафа, мм.', 'bad'); return; }
    const e = candidate(armed, x, y), issues = resultIssues(e, null);
    if (issues.length) { say(issues.join('. '), 'bad'); return; }
    remember(); e.id = state.nextId++; state.items.push(e); revalidateAll(); persist(); flash = {text:'Элемент добавлен.',cls:'ok'}; render();
  };
  [['doorMaterial','material',C.materials],['doorProfile','profile',C.profiles]].forEach(([id,key,catalog]) => {
    $(id).innerHTML = Object.entries(catalog).map(([k,v]) => `<option value="${k}" ${v.available ? '' : 'disabled'}>${v.name} · ${key === 'material' ? rub(v.rate)+'/м²' : '+'+rub(v.extra)+'/створка'}</option>`).join('');
    $(id).onchange = () => { const v = $(id).value; if (!Object.hasOwn(catalog,v) || !catalog[v].available) return; remember(); if (key === 'material') setInsertMaterial(selectedDoor,selectedInsert,v); else state.profile = v; persist(); render(); };
  });
  function editDoor(action) { remember(); if (!action()) { history.pop(); return; } persist(); flash = null; render(); }
  $('doorChoices').onclick = ev => {
    const button = ev.target.closest('[data-door]'); if (!button) return;
    selectedDoor = Number(button.dataset.door); selectedInsert = ''; render();
    $('doorChoices').querySelector(`[data-door="${selectedDoor}"]`).focus();
  };
  $('insertChoices').onclick = ev => {
    const button = ev.target.closest('[data-insert]'); if (!button) return;
    selectedInsert = button.dataset.insert; render();
    $('insertChoices').querySelector(`[data-insert="${selectedInsert}"]`).focus();
  };
  $('facade').onclick = ev => {
    if (step !== 3) return;
    const insert = ev.target.closest('[data-insert]'); if (!insert) return;
    selectedDoor = Number(insert.dataset.door); selectedInsert = insert.dataset.insert; render();
  };
  for (const axis of ['horizontal','vertical']) $('split'+(axis==='horizontal'?'Horizontal':'Vertical')).onclick = () => editDoor(() => splitInsert(selectedDoor,selectedInsert,axis));
  $('resetDoor').onclick = () => editDoor(() => { selectedInsert=''; return resetDoorDesign(selectedDoor); });
  $('applyDoors').onclick = () => editDoor(() => applyDesignToAll(selectedDoor));
  $('print').onclick = () => { if (assemblyIssues().length) return; step = 4; state.sel = null; ghost = null; render(); window.print(); };
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(project(),null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'DEM-project.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  $('import').onchange = async () => {
    const file = $('import').files[0]; if (!file) return;
    try {
      if (file.size > C.maxImportBytes) throw Error('Файл слишком большой');
      const s = decodeProject(await file.text());
      if (!confirm('Заменить текущий проект импортированным? Изменение можно отменить.')) return;
      remember(); restore(s); blockedStorage = false; persist(); revalidateAll(); step = 1; flash = {text:'Проект открыт.'}; render();
    } catch (e) { say('Проект не открыт: ' + e.message, 'bad'); }
    finally { $('import').value = ''; }
  };

  function decodeProject(raw) {
    if (typeof raw !== 'string' || raw.length > C.maxImportBytes) throw Error('Неверный размер файла');
    const data = JSON.parse(raw), obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const keys = (v, allowed) => { if (!obj(v) || Object.keys(v).some(k => !allowed.includes(k)) || allowed.some(k => !Object.hasOwn(v,k))) throw Error('Неверная структура проекта'); };
    keys(data,['version','project']);
    if (![1,C.formatVersion].includes(data.version)) throw Error('Неизвестная версия проекта. Сохранённые данные не изменены');
    const s = data.project;
    keys(s,['W','H','D','kind','walls','plinth','doors','material','profile','items','nextId',...(data.version === 1 ? [] : ['doorDesigns'])]);
    for (const [k,range] of [['W',C.limits.width],['H',C.limits.height],['D',C.limits.depth]]) {
      if (!Number.isInteger(s[k]) || s[k] < range[0] || s[k] > range[1]) throw Error('Размеры вне допустимого диапазона');
    }
    if (!['built','case'].includes(s.kind) || typeof s.plinth !== 'boolean') throw Error('Неверный тип корпуса');
    keys(s.walls,['left','right','top','bottom']);
    if (Object.values(s.walls).some(v => typeof v !== 'boolean') || (s.plinth && !s.walls.bottom)) throw Error('Неверные стенки или цоколь');
    if (typeof s.material !== 'string' || typeof s.profile !== 'string' || !Object.hasOwn(C.materials,s.material) || !C.materials[s.material].available || !Object.hasOwn(C.profiles,s.profile) || !C.profiles[s.profile].available) throw Error('Неизвестный или недоступный материал');
    if (!Number.isInteger(s.doors) || s.doors < 1 || s.doors > 8 || !Array.isArray(s.items) || s.items.length > C.maxItems) throw Error('Неверное число дверей или элементов');
    if (data.version === 1) s.doorDesigns = Array.from({length:s.doors}, () => ({material:s.material}));
    if (!Array.isArray(s.doorDesigns) || s.doorDesigns.length !== s.doors) throw Error('Неверное число дизайнов дверей');
    for (const tree of s.doorDesigns) {
      let leaves = 0, nodes = 0;
      const check = (node,depth) => {
        if (++nodes > 7 || depth > 3 || !obj(node)) throw Error('Слишком сложное или неверное деление двери');
        if (Object.hasOwn(node,'material')) {
          keys(node,['material']);
          if (++leaves > 4 || typeof node.material !== 'string' || !Object.hasOwn(C.materials,node.material) || !C.materials[node.material].available) throw Error('Неверный материал вставки');
        } else {
          keys(node,['axis','children']);
          if (!['horizontal','vertical'].includes(node.axis) || !Array.isArray(node.children) || node.children.length !== 2) throw Error('Неверное деление двери');
          node.children.forEach(child => check(child,depth+1));
        }
      };
      check(tree,0);
    }
    const ids = new Set();
    for (const e of s.items) {
      if (!obj(e) || typeof e.type !== 'string' || !Object.hasOwn(TYPES,e.type)) throw Error('Неизвестный элемент');
      const fields = e.type === 'stand' ? ['x','y0','y1'] : ['x0','x1','y',...(['drawer','shoe'].includes(e.type) ? ['h'] : [])];
      keys(e,['id','type',...fields]);
      if (!Number.isSafeInteger(e.id) || e.id < 1 || ids.has(e.id)) throw Error('Повторный или неверный ID'); ids.add(e.id);
      if (fields.some(k => typeof e[k] !== 'number' || !Number.isFinite(e[k]) || Math.abs(e[k]) > 10000)) throw Error('Неверная геометрия');
      if (e.h !== undefined && e.h !== R[e.type].h) throw Error('Неверная высота элемента');
    }
    if (!Number.isSafeInteger(s.nextId) || s.nextId <= Math.max(0,...ids) || s.nextId >= Number.MAX_SAFE_INTEGER) throw Error('Неверный счётчик ID');
    const old = snapshot();
    try { restore({...s,sel:null}); if (!doorRange().includes(s.doors)) throw Error('Недопустимая ширина дверей'); const issues = assemblyIssues(); if (issues.length) throw Error(issues.join('. ')); }
    finally { restore(old); }
    return {...clone(s),sel:null};
  }
  try {
    const raw = localStorage.getItem(C.storageKey);
    if (raw) { restore(decodeProject(raw)); $('storageStatus').textContent = 'Проект восстановлен из браузера.'; }
  } catch (e) { blockedStorage = true; $('storageStatus').textContent = 'Автосохранение недоступно или не распознано: ' + e.message + '. Данные не перезаписаны; используйте JSON.'; }
  revalidateAll();
  render();
})();
