var GOODS = [
  { key: 'gravel', base: 4, half: 3 },
  { key: 'sand', base: 5, half: 3 },
  { key: 'coal', base: 10, half: 6 },
  { key: 'ferrite', base: 14, half: 6 },
  { key: 'iron', base: 44, half: 12, event: 'first_iron' },
  { key: 'glass', base: 64, half: 16, event: 'first_glass' }
];

var PRICE_FLOOR = 0.15;
var START_MONEY = 25;
var ROOM_MONEY = 9999;
var DRONE_FEE = 10;
var DRONE_TRIP = 300;
var FRAMES_PER_MINUTE = 3600;

function indexGoods() {
  const out = {};
  for (let i = 0; i < GOODS.length; i++) out[GOODS[i].key] = GOODS[i];
  return out;
}

var GOOD_OF = indexGoods();

var market = { money: 0, sold: {}, sales: 0, drone: 0, age: 0 };

function resetMarket(rich) {
  market.money = rich ? ROOM_MONEY : START_MONEY;
  market.sold = {};
  market.sales = 0;
  market.drone = 0;
  market.age = 0;
  for (let i = 0; i < GOODS.length; i++) market.sold[GOODS[i].key] = 0;
}

function priceOf(good) {
  const minutes = market.age / FRAMES_PER_MINUTE;
  const decay = Math.max(PRICE_FLOOR, 0.5 ** (minutes / good.half));
  return Math.max(1, Math.round(good.base * decay));
}

function sweepPad(take) {
  const counts = {};
  const pad = padLocal();
  if (!pad) return counts;
  for (let y = pad.y; y < pad.y + pad.h; y++) {
    for (let x = pad.x; x < pad.x + pad.w; x++) {
      if (!inBounds(x, y)) continue;
      const group = CARGO[mat[y * W + x]];
      if (!GOOD_OF[group]) continue;
      counts[group] = (counts[group] || 0) + 1;
      if (!take) continue;
      setCell(x, y, VOID_ID);
      markEdited(x, y);
    }
  }
  return counts;
}

function payoutOf(counts) {
  let sum = 0;
  for (const key in counts) sum += counts[key] * priceOf(GOOD_OF[key]);
  return sum;
}

function deliverPad() {
  const counts = sweepPad(true);
  const sum = payoutOf(counts);
  for (const key in counts) market.sold[key] += counts[key];
  market.money += sum;
  if (sum > 0) market.sales++;
  if (sum > 0) notice('sale', tf('msg.droneSold', { sum: sum }));
  else notice('denied', t('msg.droneEmpty'));
}

function callDrone() {
  if (market.drone > 0) return;
  if (!cargoPad) {
    notice('denied', t('msg.noPad'));
    return;
  }
  if (!padInWindow()) {
    notice('denied', t('msg.padFar'));
    return;
  }
  if (market.money < DRONE_FEE) {
    notice('denied', tf('msg.cantAfford', { cost: DRONE_FEE }));
    return;
  }
  market.money -= DRONE_FEE;
  market.drone = DRONE_TRIP;
  notice('launch', t('msg.droneOn'));
}

function abortDrone() {
  market.money += DRONE_FEE;
  market.drone = 0;
  notice('denied', t('msg.droneAbort'));
}

function tickMarket() {
  market.age++;
  if (market.drone <= 0) return;
  market.drone--;
  if (market.drone !== DRONE_TRIP >> 1) return;
  if (padInWindow()) deliverPad();
  else abortDrone();
}
