var SOUNDS = {
  pickDrill: { freq: 420, dur: 0.05, wave: 'square', vol: 0.025 },
  pickTool: { freq: 620, dur: 0.05, wave: 'square', vol: 0.025 },
  pickShape: { freq: 500, dur: 0.05, wave: 'square', vol: 0.02 },
  drill: { freq: 170, dur: 0.03, wave: 'square', vol: 0.013 },
  grab: { freq: 640, dur: 0.05, wave: 'triangle', vol: 0.025 },
  drop: { freq: 300, dur: 0.05, wave: 'square', vol: 0.02 },
  ignite: { freq: 320, dur: 0.14, wave: 'sawtooth', vol: 0.035 },
  fizzle: { freq: 150, dur: 0.14, wave: 'sawtooth', vol: 0.035 },
  built: { freq: 560, dur: 0.07, wave: 'triangle', vol: 0.03 },
  removed: { freq: 220, dur: 0.08, wave: 'square', vol: 0.025 },
  denied: { freq: 150, dur: 0.12, wave: 'sawtooth', vol: 0.03 },
  roomReset: { freq: 560, dur: 0.06, wave: 'triangle', vol: 0.03 },
  unlock: { freq: 680, dur: 0.16, wave: 'triangle', vol: 0.04 },
  death: { freq: 120, dur: 0.35, wave: 'sawtooth', vol: 0.05 },
  reboot: { freq: 300, dur: 0.12, wave: 'triangle', vol: 0.03 },
  start: { freq: 330, dur: 0.12, wave: 'triangle', vol: 0.04 },
  room: { freq: 440, dur: 0.12, wave: 'triangle', vol: 0.04 },
  launch: { freq: 660, dur: 0.5, wave: 'triangle', vol: 0.05 },
  sale: { freq: 880, dur: 0.18, wave: 'triangle', vol: 0.045 },
  soundOn: { freq: 520, dur: 0.07, wave: 'triangle', vol: 0.03 },
  volume: { freq: 520, dur: 0.05, wave: 'triangle', vol: 0.03 },
  grabSize: { freq: 600, dur: 0.05, wave: 'triangle', vol: 0.025 }
};

var audio = null;

function beep(freq, dur, wave, vol) {
  if (settings.muted || settings.volume === 0) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.value = (vol * settings.volume) / 100;
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch (e) {
    return;
  }
}

function play(name) {
  const s = SOUNDS[name];
  beep(s.freq, s.dur, s.wave, s.vol);
}
