var PIECES = {};
var PIECE_IDS = [];

function regPiece(spec) {
  PIECES[spec.id] = spec;
  PIECE_IDS.push(spec.id);
  if (spec.sounds) addSounds(spec.sounds);
  return spec;
}

function regTool(spec) {
  spec.kind = 'tool';
  return regPiece(spec);
}

function eachPiece(hook, arg) {
  for (let k = 0; k < PIECE_IDS.length; k++) {
    const piece = PIECES[PIECE_IDS[k]];
    if (piece[hook]) piece[hook](arg);
  }
}

function resetPieces() {
  eachPiece('reset');
}

function tickPieces(frame) {
  eachPiece('tick', frame);
}

function drawPieces() {
  eachPiece('drawWorld');
}

function pieceCost(id) {
  return PIECES[id].cost || 0;
}
