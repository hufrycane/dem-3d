/*
  Конструктор шкафа DEM — правила и цены.
  ВСЕ ЦИФРЫ УСЛОВНЫЕ (заглушки для прототипа). Заменить по данным технолога.
  Размеры в миллиметрах, цены в рублях.
*/
window.KONSTRUKTOR_CONFIG = {
  limits: {
    width: [800, 4000],
    height: [1500, 2800],
    depth: [350, 900],
    doorWidth: [500, 1100]      // допустимая ширина одной двери купе
  },
  formatVersion: 2,
  maxItems: 200,
  maxImportBytes: 200000,
  storageKey: 'dem-konstruktor-project',
  doorHeightGap: 40,
  materials: {
    ldsp: { name: 'Светлый дуб', rate: 2600, color: '#D9C3A0', available: true },
    walnut: { name: 'Орех', rate: 2900, color: '#79533C', available: true },
    white: { name: 'Белый', rate: 2600, color: '#F4F3EF', available: true },
    mirror: { name: 'Зеркало', rate: 3900, color: '#C7D8DB', available: true }
  },
  profiles: {
    silver: { name: 'Серебро', color: '#8A8D91', extra: 0, available: true },
    black: { name: 'Чёрный', color: '#282627', extra: 450, available: true }
  },
  panel: 16,                    // толщина ЛДСП корпуса и наполнения
  plinth: 70,                   // высота цоколя
  doorZone: 100,                // глубина под двери и рельсы (полки на столько мельче)
  doorOverlap: 30,              // перехлёст соседних дверей купе
  junctionMargin: 25,           // запас от стыка дверей, куда нельзя ящики

  rules: {
    shelf:  { minGap: 150, maxSpan: 1100 },
    stand:  { minCell: 280 },
    rod:    { minDepth: 450, topGap: 70, minTopGap: 45, minHang: 900, minWidth: 400, maxSpan: 1200 },
    drawer: { minDepth: 400, h: 180, maxTop: 1100, minWidth: 300, maxWidth: 1000 },
    shoe:   { minDepth: 400, h: 250, maxBottom: 150, clearAbove: 500, minWidth: 400, maxWidth: 900 },
    panto:  { minDepth: 450, h: 120, minMount: 1750, minHang: 1000, minWidth: 450, maxWidth: 1150 }
  },

  prices: {
    ldsp: 1450,         // ЛДСП 16 мм, ₽/м²
    waste: 15,          // запас на отход, %
    edge: 45,           // кромка, ₽/пог. м
    hdf: 380,           // задняя стенка ХДФ, ₽/м²
    shelfPins: 48,      // полкодержатели на одну полку
    standFix: 60,       // крепёж одной стойки
    bodyFix: 450,       // крепёж корпуса (если есть стенки)
    rodPerM: 520,       // штанга, ₽/пог. м
    rodFlange: 70,      // фланец, шт (2 на штангу)
    drawer: 1900,       // короб ящика
    drawerSlides: 1300, // направляющие на ящик
    shoe: 5200,         // выкатная полка для обуви
    panto: 7400,        // пантограф
    workPercent: 25,    // работа цеха, % от материалов корпуса

    doorDividerPerM: 650, // демо-разделитель, ₽/пог. м фактической длины
    doorFill: 2600,     // наполнение двери (ЛДСП), ₽/м²
    doorProfile: 1900,  // профиль на одну дверь
    doorRollers: 650,   // ролики на одну дверь
    railPerM: 950       // рельсы (верх + низ), ₽/пог. м каждой
  }
};
