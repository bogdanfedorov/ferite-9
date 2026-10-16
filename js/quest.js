var QUEST = {
  at: 0,
  road: [
    {
      id: 'quota',
      deliver: [
        { key: 'iron', need: 10, label: 'mat.iron', event: 'first_iron' },
        { key: 'glass', need: 8, label: 'mat.glass', event: 'first_glass' }
      ]
    }
  ]
};

function questStage() {
  return QUEST.road[QUEST.at];
}

function questDeliver() {
  return questStage().deliver;
}

function questDone() {
  const d = questDeliver();
  for (let i = 0; i < d.length; i++) if ((cargo[d[i].key] || 0) < d[i].need) return false;
  return true;
}

function resetQuest() {
  QUEST.at = 0;
}
