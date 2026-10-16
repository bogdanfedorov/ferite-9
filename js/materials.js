var MT = { VOID: 0, POWDER: 1, LIQUID: 2, GAS: 3, SOLID: 4, STRUCTURE: 5 };
var MT_NAMES = ['void', 'powder', 'liquid', 'gas', 'solid', 'structure'];

var HEAT_STEP = 24000;
var HEAT_RESPONSE_MAX = 0.9;
var HEAT_COEF_MAX = 0.24;
var AMBIENT_FLOW = 1300;
var CELL_SIZE = 0.02;
var STEFAN = 5.67e-8;
var RAD_VIEW = 1;
var RAD_GAIN = RAD_VIEW * STEFAN * 1e12 * CELL_SIZE;
var RAD_MIN = 200;
var EMISSIVITY = 0.9;
var RELAX_MIN = 0.0002;
var RELAX_MAX = 0.06;
var LATENT_STEP = 5;
var NEAR_HOT = 0.78;
var FLOW_REACH_BASE = 5;
var FLOW_REACH_DECADE = 0.8;
var FLOW_VISC_REF = 0.001;
var FLOW_REACH_MIN = 1;
var FLOW_REACH_MAX = 6;
var LOOK = { PLAIN: 0, FLAME: 1, PULSE: 2 };

var MATS = [];
var MAT = {};
var MAT_COUNT = 0;
var VOID_ID = 0;
var EDGE_ID = 0;

var STATE, DENS, HARD, RELAX, EMITS, HEAT_COEF, RAD_COEF;
var HOT_T, HOT_INTO, COLD_T, COLD_INTO, LATENT;
var BREAK_INTO, LIFE_BASE, LIFE_RND, EXPIRE_INTO, EXPIRE_P;
var BURN_EVERY, BURN_INTO, FLOW_REACH, SHIMMER, CARGO;
var OPEN, MOVABLE, BLOCKING, RIGID, ISVOID, FLUID, MOLTEN, POROUS;
var GRIPS, GLOW, FIXED, MINEABLE, REACTIVE;
var REACT_INTO, REACT_T, REACT_GIVES, REACT_GIVES_T;

function camelName(name) {
  return name.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
}

function matId(name) {
  var id = MAT[name];
  if (id === undefined) throw new Error('unknown material: ' + name);
  return id;
}

function matLabel(id) { return t(MATS[id].labelKey); }

function heatResponse(rec) {
  var s = HEAT_STEP / (rec.density * rec.heatCapacity);
  return s > HEAT_RESPONSE_MAX ? HEAT_RESPONSE_MAX : s;
}

function ambientRelax(rec) {
  var r = AMBIENT_FLOW / (rec.density * rec.heatCapacity);
  if (r > RELAX_MAX) return RELAX_MAX;
  if (r < RELAX_MIN) return RELAX_MIN;
  return r;
}

function latentPasses(rec) {
  if (!rec.latentHeat) return 0;
  return Math.round(rec.latentHeat * 1000 / (rec.heatCapacity * LATENT_STEP));
}

function flowReach(rec) {
  if (rec.state !== 'liquid') return 0;
  var v = rec.viscosity || FLOW_VISC_REF;
  var r = Math.round(FLOW_REACH_BASE - FLOW_REACH_DECADE * Math.log(v / FLOW_VISC_REF) / Math.LN10);
  if (r < FLOW_REACH_MIN) return FLOW_REACH_MIN;
  if (r > FLOW_REACH_MAX) return FLOW_REACH_MAX;
  return r;
}

function pairConductivity(a, b) {
  var ka = a.thermalConductivity, kb = b.thermalConductivity;
  if (ka <= 0 || kb <= 0) return 0;
  return 2 * ka * kb / (ka + kb);
}

function transitionUp(rec) {
  return rec.melt || rec.boil || rec.ignite || null;
}

function transitionDown(rec) {
  return rec.freeze || rec.condense || null;
}

function allocMaterialTables(n) {
  STATE = new Uint8Array(n);
  DENS = new Float32Array(n);
  HARD = new Int16Array(n);
  RELAX = new Float32Array(n);
  EMITS = new Float32Array(n);
  HEAT_COEF = new Float32Array(n * n);
  RAD_COEF = new Float32Array(n * n);

  HOT_T = new Float32Array(n);
  HOT_INTO = new Uint8Array(n);
  COLD_T = new Float32Array(n);
  COLD_INTO = new Uint8Array(n);
  LATENT = new Uint16Array(n);

  BREAK_INTO = new Uint8Array(n);
  LIFE_BASE = new Uint16Array(n);
  LIFE_RND = new Uint16Array(n);
  EXPIRE_INTO = new Uint8Array(n);
  EXPIRE_P = new Float32Array(n);
  BURN_EVERY = new Uint8Array(n);
  BURN_INTO = new Uint8Array(n);
  FLOW_REACH = new Uint8Array(n);
  SHIMMER = new Uint8Array(n);
  CARGO = new Array(n);

  OPEN = new Uint8Array(n);
  MOVABLE = new Uint8Array(n);
  BLOCKING = new Uint8Array(n);
  RIGID = new Uint8Array(n);
  ISVOID = new Uint8Array(n);
  FLUID = new Uint8Array(n);
  MOLTEN = new Uint8Array(n);
  POROUS = new Uint8Array(n);
  GRIPS = new Uint8Array(n);
  GLOW = new Uint8Array(n);
  FIXED = new Uint8Array(n);
  MINEABLE = new Uint8Array(n);
  REACTIVE = new Uint8Array(n);

  REACT_INTO = new Uint8Array(n * n);
  REACT_T = new Float32Array(n * n);
  REACT_GIVES = new Uint8Array(n * n);
  REACT_GIVES_T = new Float32Array(n * n);
}

function checkMaterial(rec) {
  if (!rec.name) throw new Error('material without a name');
  if (MT_NAMES.indexOf(rec.state) < 0) throw new Error(rec.name + ': unknown state ' + rec.state);
  if (!(rec.density > 0)) throw new Error(rec.name + ': density must be positive');
  if (!(rec.heatCapacity > 0)) throw new Error(rec.name + ': heatCapacity must be positive');
  if (!(rec.thermalConductivity > 0)) {
    throw new Error(rec.name + ': thermalConductivity must be positive');
  }
}

function fillMaterialCell(rec) {
  var id = rec.id;
  var state = MT_NAMES.indexOf(rec.state);

  STATE[id] = state;
  DENS[id] = rec.density;
  HARD[id] = rec.hardness === undefined ? 0 : rec.hardness;
  RELAX[id] = ambientRelax(rec);
  EMITS[id] = rec.emits || 0;
  LATENT[id] = latentPasses(rec);
  FLOW_REACH[id] = flowReach(rec);
  SHIMMER[id] = rec.look === 'flame' ? LOOK.FLAME
    : (rec.look === 'pulse' ? LOOK.PULSE : LOOK.PLAIN);
  CARGO[id] = rec.cargo || '';

  var hot = transitionUp(rec);
  HOT_T[id] = hot ? hot.at : 0;
  HOT_INTO[id] = hot ? matId(hot.into) : 0;
  var cold = transitionDown(rec);
  COLD_T[id] = cold ? cold.at : 0;
  COLD_INTO[id] = cold ? matId(cold.into) : 0;

  BREAK_INTO[id] = rec.breaksInto ? matId(rec.breaksInto) : 0;

  var life = rec.life === undefined ? 0 : rec.life;
  LIFE_BASE[id] = typeof life === 'number' ? life : life[0];
  LIFE_RND[id] = typeof life === 'number' ? 0 : life[1];

  EXPIRE_INTO[id] = rec.expire ? matId(rec.expire.into) : 0;
  EXPIRE_P[id] = rec.expire && rec.expire.chance !== undefined ? rec.expire.chance : 1;
  BURN_EVERY[id] = rec.burn ? rec.burn.every : 0;
  BURN_INTO[id] = rec.burn ? matId(rec.burn.into) : 0;

  ISVOID[id] = state === MT.VOID ? 1 : 0;
  FLUID[id] = state === MT.LIQUID || state === MT.GAS ? 1 : 0;
  OPEN[id] = state === MT.VOID || state === MT.GAS ? 1 : 0;
  MOVABLE[id] = state === MT.POWDER || state === MT.LIQUID ? 1 : 0;
  RIGID[id] = state === MT.SOLID || state === MT.STRUCTURE ? 1 : 0;
  BLOCKING[id] = RIGID[id] || state === MT.POWDER ? 1 : 0;
  MOLTEN[id] = state === MT.LIQUID && COLD_INTO[id] ? 1 : 0;
  MINEABLE[id] = state === MT.SOLID && HARD[id] > 0 ? 1 : 0;
  FIXED[id] = state === MT.STRUCTURE || HARD[id] < 0 ? 1 : 0;
  POROUS[id] = rec.porous ? 1 : 0;
  GRIPS[id] = rec.grips ? 1 : 0;
  GLOW[id] = rec.glow ? 1 : 0;
}

function fillReactions(rec) {
  if (!rec.reacts) return;
  for (var k = 0; k < rec.reacts.length; k++) {
    var r = rec.reacts[k];
    var p = rec.id * MAT_COUNT + matId(r.with);
    REACT_INTO[p] = matId(r.into);
    REACT_T[p] = r.at || 0;
    REACT_GIVES[p] = r.gives ? matId(r.gives) : 0;
    REACT_GIVES_T[p] = r.givesAt || 0;
    REACTIVE[rec.id] = 1;
  }
}

function emissivityOf(rec) {
  if (OPEN[rec.id]) return 0;
  return rec.emissivity === undefined ? EMISSIVITY : rec.emissivity;
}

function fillHeatCoefficients() {
  for (var a = 0; a < MAT_COUNT; a++) {
    var response = heatResponse(MATS[a]);
    var radiates = 0.25 * RAD_GAIN * response * emissivityOf(MATS[a]);
    for (var b = 0; b < MAT_COUNT; b++) {
      var c = response * pairConductivity(MATS[a], MATS[b]);
      HEAT_COEF[a * MAT_COUNT + b] = c > HEAT_COEF_MAX ? HEAT_COEF_MAX : c;
      RAD_COEF[a * MAT_COUNT + b] = OPEN[b] ? radiates : 0;
    }
  }
}

function buildMaterials(list) {
  MATS = [];
  MAT = {};
  MAT_COUNT = list.length;
  if (MAT_COUNT > 255) throw new Error('too many materials for a Uint8 grid');
  allocMaterialTables(MAT_COUNT);

  var i, rec;
  for (i = 0; i < list.length; i++) {
    rec = list[i];
    checkMaterial(rec);
    if (MAT[rec.name] !== undefined) throw new Error('duplicate material: ' + rec.name);
    rec.id = i;
    rec.labelKey = 'mat.' + camelName(rec.name);
    MATS[i] = rec;
    MAT[rec.name] = i;
    if (rec.isVoid) VOID_ID = i;
    if (rec.isEdge) EDGE_ID = i;
  }
  for (i = 0; i < list.length; i++) fillMaterialCell(MATS[i]);
  for (i = 0; i < list.length; i++) fillReactions(MATS[i]);
  fillHeatCoefficients();
}

buildMaterials(MATERIAL_DATA);
