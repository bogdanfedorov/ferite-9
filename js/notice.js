var onNotice = null;

function setNoticeHook(fn) {
  onNotice = fn;
}

function notice(sound, text) {
  if (onNotice) onNotice(sound, text);
}
