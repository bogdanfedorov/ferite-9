var onNotice = null;

function setNoticeHook(fn) {
  onNotice = fn;
}

function notice(sound, text) {
  if (onNotice) onNotice(sound, text);
}

var onFault = null;

function setFaultHook(fn) {
  onFault = fn;
}

function fault(what, err) {
  if (onFault) onFault(what, err);
}
