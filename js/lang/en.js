regLang('en', {
  'ui.module': 'Unit',
  'ui.inZone': 'in zone · ${sum}',
  'ui.dronePoor': 'Drone costs ${fee}',
  'ui.droneNoPad': 'Mark a pickup zone',
  'ui.droneFar': 'Pickup zone is out of range',
  'ui.droneBusy': 'Drone in flight…',
  'ui.drone': 'Drone for ${fee}',
  'ui.market': 'Market',
  'ui.parcel': 'parcel',
  'ui.losses': 'losses',
  'ui.explored': 'surveyed',
  'ui.hp': 'Integrity',
  'ui.fuel': 'Fuel',
  'ui.help': 'help',
  'ui.heatLegend': 'temperature, °C',
  'ui.settings': 'settings',

  'mat.gravel': 'gravel',
  'mat.hardpan': 'packed earth',
  'mat.coalSeam': 'coal seam',
  'mat.oreSeam': 'ferrite vein',
  'mat.ironScrap': 'iron scrap',
  'mat.cullet': 'cullet',
  'key.lmb': 'LMB',
  'key.rmb': 'RMB',
  'unit.cell': ['cell', 'cells'],
  'unit.module': ['unit', 'units'],

  'mat.empty': 'air',
  'mat.bedrock': 'bedrock',
  'mat.rock': 'stone',
  'mat.dirt': 'soil',
  'mat.sand': 'sand',
  'mat.coal': 'coal',
  'mat.ferrite': 'ferrite',
  'mat.slag': 'slag',
  'mat.water': 'water',
  'mat.lava': 'lava',
  'mat.meltIron': 'molten iron',
  'mat.meltGlass': 'molten glass',
  'mat.steam': 'steam',
  'mat.fire': 'fire',
  'mat.smoke': 'smoke',
  'mat.ember': 'embers',
  'mat.glass': 'glass',
  'mat.iron': 'iron',
  'mat.belt': 'belt',
  'mat.wall': 'wall',

  'tool.drill': 'Drill',
  'tool.drill.desc': 'by rock hardness',
  'tool.ignite': 'Igniter',
  'tool.ignite.desc': 'set alight',
  'tool.hand': 'Hand',
  'tool.hand.desc': 'carry loose material',
  'tool.pad': 'Pickup',
  'tool.pad.desc': 'where the drone takes cargo',
  'tool.belt': 'Belt',
  'tool.belt.desc': 'a cell that pushes material',
  'tool.wall': 'Wall',
  'tool.wall.desc': 'a masonry cell',

  'shape.line': 'line',
  'shape.rect': 'rectangle',
  'shape.slope': 'slope',
  'shape.circle': 'circle',
  'ui.level': 'lv {level}',
  'ui.upgrade': '▲ lv {level} · ${cost}',
  'msg.upgraded': '{tool}: level {level}',

  'msg.tooFar': 'Out of reach — fly closer',
  'msg.nothingToGrab': 'Bare hands will not take packed rock — break it with the drill first',
  'msg.beltRoom': 'No room here — the spot is taken',
  'msg.beltDone': 'Belt placed — the load rides on its own now',
  'msg.wallDone': 'Wall placed',
  'msg.structRemoved': 'Structure removed',
  'msg.nothingToRemove': 'Nothing to remove here',
  'msg.buildShape': 'Shape: {shape}',
  'msg.noIgnite': 'Nothing to light — pour some coal first',
  'msg.bought': 'Bought: {tool}',
  'msg.droneEmpty': 'The drone came back empty — nothing in the zone',
  'msg.droneSold': 'The drone sold the cargo: +${sum}',
  'msg.droneOn': 'Drone dispatched — the pickup is moments away',
  'msg.cantAfford': 'Not enough money: need ${cost}',
  'msg.noPad': 'Mark a pickup zone first',
  'msg.padFar': 'The pickup zone is too far away — move closer',
  'msg.droneAbort': 'The drone lost the zone — fee refunded',
  'msg.toolLocked': 'That tool is not bought yet',
  'msg.padDone': 'Pickup zone marked — the drone takes cargo from here',
  'msg.padBig': 'Zone too large — 96 cells at most',
  'msg.heatOn': 'Heat map on',
  'msg.heatOff': 'Heat map off',
  'msg.roomOn': 'Test room: every material in a bin, endless jetpack, no fall damage.',
  'msg.roomOff': 'The shaft: a fresh shift starts now.',
  'msg.roomReset': 'Bin refilled: {mat}',
  'msg.soundOn': 'Sound on',
  'msg.soundOff': 'Sound off',

  'intro.kicker': 'Deep mine · shift 41',
  'intro.lede':
    'You are research unit <b>sol_1.01</b>, the next parcel Mission Control dropped into this shaft. You have no stock: rock crumbles loose right where you break it, and everything travels in your hands. Hollow a furnace out of the rock, carry coal and ore into it, set it alight — and watch ferrite run out as molten iron. Every unit lost costs Control a new parcel, and costs you another round of remarks from orbit.',
  'intro.keyMove': 'move, the pack fires on up',
  'intro.keyTool': 'current tool',
  'intro.keyErase': 'remove what you built',
  'intro.keyDrone': 'call the drone',
  'intro.keySlots': 'tool cells',
  'inv.kicker': 'Tools',
  'inv.note':
    'Click a tool, then a cell below — or press its number. A locked tool is bought with a click. E or Esc closes.',
  'intro.keyInv': 'all tools',
  'intro.keyHeat': 'heat map',
  'intro.keyHelp': 'help · pause',
  'intro.cta': 'Descend into the shaft',
  'intro.room': 'Test room',
  'intro.foot':
    'Unsurveyed ground does not exist for the simulation yet: lava and a coal seam side by side leave each other alone until you dig through to them. What you open keeps running on its own.',

  'help.kicker': 'Help',
  'help.title': 'How to smelt iron',
  'help.s1':
    '<b>The drill</b> chews rock over time: sand is instant, stone about a second, ferrite and iron much longer. Cracks on a cell show the progress. It ignores liquids and passes straight through them — water and lava have to be channelled away or walled off. The <b>hand</b> scoops loose material: only what you point at goes into the handful, never a mix. Hold to lift it, drag it with the mouse, and the moment you let go it settles back into the ground.',
  'help.s2':
    '<b>Hollow a furnace out of the rock</b>: drill a niche with a narrow mouth. Stone holds heat worse than firebrick, but it is what you have from the start.',
  'help.s3':
    'Carry coal and ferrite into the niche <b>by hand</b> — coal at the bottom, ore above it — then hit the coal with the <b>igniter</b>. Embers hold 1500 °C and burn for tens of seconds.',
  'help.s4':
    '<b>Ferrite melts at 1120 °C</b> and runs down as molten iron. It sets below 850 °C, or instantly in water — quench it if you are in a hurry.',
  'help.s5':
    '<b>Glass is harder than iron</b>: sand only melts at 1340 °C. A layer of sand resting on the coal never gets there — a cell with one hot neighbour tops out around 1240 °C. Bury the sand inside the coal so the embers surround it.',
  'help.s6':
    '<b>Heat is everywhere</b>: lava warms stone, water drains heat and boils, overheating costs you health. Press <b>T</b> to see temperature.',
  'help.s7':
    '<b>The world wakes where you go</b>: unsurveyed ground is not simulated at all. Break through and look — everything there starts at once, and keeps going after you leave.',
  'help.s8':
    '<b>The unit is mortal</b>: falls over 17 cells, heat above 120 °C, drilling into glowing rock, and being buried in loose material. Every loss is a new parcel with a new number and another remark from orbit. <b>The pack does not refuel itself</b>: the tank is only filled at a dock station, so spend it on climbing wisely.',
  'help.cta': 'Back to work',
  'intro.keySettings': 'settings',

  'pause.kicker': 'Paused',
  'pause.title': 'Menu',
  'pause.resume': 'Resume',
  'pause.settings': 'Settings',
  'pause.help': 'Help',

  'set.kicker': 'Settings',
  'set.title': 'Unit console',
  'set.lang': 'Language',
  'set.sound': 'Sound',
  'set.mute': 'Mute',
  'set.volume': 'Volume',
  'set.grab': 'Grab',
  'set.grabSize': 'Grab size',
  'set.grabNote':
    'The handful holds up to {cells} cells at once — a {n}×{n} clump of the one material you aimed at.',
  'set.vision': 'Colour scheme',
  'set.visionNote':
    'Colour-blind schemes pull the materials apart: what used to merge is spread along the blue-yellow axis. Applies to the mine and the instruments alike.',
  'set.vision.off': 'Standard',
  'set.vision.protan': 'Protanopia · red',
  'set.vision.deutan': 'Deuteranopia · green',
  'set.vision.tritan': 'Tritanopia · blue',
  'set.vision.contrast': 'High contrast',
  'set.world': 'World',
  'set.worldNow': 'Current',
  'set.worldMine': 'shaft',
  'set.worldRoom': 'test room',
  'set.worldSwap': 'Restart in the other one',
  'set.worldNote':
    'The test room is a flat apron with a bin of every material: the jetpack burns no fuel and falls do no harm. Switching builds the world anew.',
  'set.keys': 'Keys',
  'set.keysReset': 'Defaults',
  'set.press': 'press a key',
  'set.cta': 'Back to work',
  'set.key.up': 'Up · jetpack',
  'set.key.down': 'Down',
  'set.key.left': 'Left',
  'set.key.right': 'Right',
  'set.key.slot1': 'Cell 1',
  'set.key.slot2': 'Cell 2',
  'set.key.slot3': 'Cell 3',
  'set.key.slot4': 'Cell 4',
  'set.key.slot5': 'Cell 5',
  'set.key.slot6': 'Cell 6',
  'set.key.slot7': 'Cell 7',
  'set.key.slot8': 'Cell 8',
  'set.key.inventory': 'Tool menu',
  'set.key.drone': 'Call the drone',
  'set.key.shape': 'Build shape',
  'set.key.heat': 'Heat map',
  'set.key.mute': 'Sound',
  'set.key.help': 'Help',
  'set.key.settings': 'Settings',

  'term.title': 'Control "Sol" · assembly terminal',
  'term.hintInit': 'initialising…',
  'term.hintAnswer': 'ENTER — respond',
  'term.hintAck': 'ENTER — acknowledge',
  'term.hintEnter': 'ENTER — into the shaft',
  'term.skip': 'skip · ESC',
  'term.ackBtn': '[ acknowledge report ]',
  'term.ackDone': 'report acknowledged · assembly continues',
  'term.lossHead': 'UNIT LOST · {cause}',
  'term.telFall': 'telemetry · drop {d} · limit {limit}',
  'term.telDrill': 'telemetry · face {t} °C · limit 260',
  'term.telBuried': 'telemetry · hull under loose rock over 3 s · limit 1 s',
  'term.telHeat': 'telemetry · {t} °C · limit 120',
  'term.headers': [
    'CONTROL "SOL" · assembly terminal, airlock 7',
    'CONTROL "SOL" · airlock 7 · shift 41, second half',
    'CONTROL "SOL" · assembly terminal · line B'
  ],
  'term.firstSeries': 'series sol · revision 1 · parcel 01',
  'term.firstFrame': 'frame · welded',
  'term.firstDrill': 'drill · calibrated to 9 units per tick',
  'term.firstJet': 'pack · tank full',
  'term.firstMem': 'memory carrier · empty: first parcel of the series',
  'term.balance': 'account · ${m}',
  'term.revision': 'REVISION {v} · new drawing, same old rake',
  'term.assembling': 'parcel {sol} · assembled to the same drawing',
  'term.assembly': [
    'frame · welded',
    'drill · calibrated to 9 units per tick',
    'pack · tank full',
    'heat probe · 18 °C, within range',
    'manipulator · torque set',
    'hull · seams spot-checked'
  ],
  'term.byCause.lava': [
    'heat shielding · same as on the previous parcels',
    'plating · rated 120 °C · request for 1200 denied',
    'anti-melt coating · not in the budget'
  ],
  'term.byCause.heat': [
    'radiator · still without a fan',
    'heat probe · works · reading it is optional',
    'cooling loop · left exactly as it was'
  ],
  'term.byCause.fall': [
    'pack · checked a third time · serviceable',
    'altimeter · not in the drawing',
    'dampers · removed to save weight'
  ],
  'term.byCause.hotdrill': [
    'drill · same warranty up to 300 °C',
    'manipulator insulation · rejected as expensive',
    'face sensor · it shows, it does not warn'
  ],
  'term.byCause.buried': [
    'collapse sensor · out of stock',
    'hull · holds loose-rock pressure for 3 seconds · unchanged',
    'emergency dig-out kit · not part of the package'
  ],
  'term.memRead': [
    'memory of parcel {prev} · reading…',
    'memory carrier {prev} · recovery attempt…',
    'dump {prev} · parsing sectors…'
  ],
  'term.memIntegrity': 'integrity {pct}% · fragments: {frags}',
  'term.memDrop': [
    'memory discarded · protocol "cheaper to build a new one"',
    'memory discarded · compatibility with the new hull 0%',
    'memory discarded · the transfer budget closed last year',
    'memory discarded · committee finding: "nothing of value"'
  ],
  'term.adviceRepeat': '{advice} · repeated for the {n}th time',
  'term.adviceStatus': 'advisory status · not carried into memory',
  'term.stale': 'progress · unchanged since {prev}',
  'term.pace': 'pace · unexpectedly acceptable',
  'term.baselineStart': 'baseline · test',
  'term.baselineOk': 'BASELINE CONFIRMED · {sol} cleared for descent',
  'term.baselineCut': 'TEST CUT SHORT · {sol} descends as is',

  'cause.lava': 'melted down',
  'cause.heat': 'overheated',
  'cause.fall': 'impact',
  'cause.hotdrill': 'drill burnt out',
  'cause.buried': 'buried',

  'frag.lava': '"hot"',
  'frag.heat': '"burns"',
  'frag.fall': '"height"',
  'frag.hotdrill': '"do not touch the embers"',
  'frag.buried': '"sand"',

  'advice.lava': 'advisory · stay out of the lava',
  'advice.heat': 'advisory · watch the probe while it still works',
  'advice.fall': 'advisory · W is the pack button',
  'advice.hotdrill': 'advisory · let the rock cool down',
  'advice.buried': 'advisory · prop first, dig second',

  'death.lava.first': [
    'Lava is hot. Melt, melt. Logged: hot.',
    'Lava again. Why exactly did we not keep the note that it hurts?',
    'Third parcel, same puddle. Control begins to suspect the lava is not the problem.'
  ],
  'death.lava.pool': [
    'Parcel #{p} delivered straight into magma. Flawless accuracy, questionable target.',
    'The lava thanks you for the regular deliveries.',
    'We added the line "do not enter the lava" to the manual. You scrolled past it.',
    '{c} {cm} into a single puddle. Strong correlation, zero conclusions.'
  ],
  'death.heat.first': [
    'Overheated. The unit is not rated for roasting, but you insisted.',
    'Heat again. You do have a probe; attention is the missing part.',
    'Third reminder: the number on the probe does not climb for decoration.'
  ],
  'death.heat.pool': [
    'The hull baked evenly. At least something of yours comes out even.',
    'The temperature sensor worked to the very end. Unlike you.',
    'It was {t} °C out there. The working limit is 120. The difference is visible from orbit.',
    'We will send the next parcel pre-baked to save time.'
  ],
  'death.fall.first': [
    'Drop height — {d} {dc}. The pack was there. The finger on the button was not.',
    'Gravity wins again. It never actually loses.',
    'We checked the pack. Twice. It works. Twice.'
  ],
  'death.fall.pool': [
    'Free fall: {d} {dc}, and not one press of W. Almost an art form.',
    'The chassis went into a bag. The bag is light.',
    'Control proposes renaming the series to sol_rockfalls.',
    'Height {d}. A series record. We are proud, but not very.'
  ],
  'death.hotdrill.first': [
    'Drill into glowing rock, then surprise that it hurts. A classic.',
    'Drilling embers a second time. Bold. And expensive.',
    'Embers hold 1500 °C, the drill is rated to 300. The arithmetic is not hard.'
  ],
  'death.hotdrill.pool': [
    'Molten rock dislikes being poked. Now you know it once more.',
    'The unit burned out together with the drill. The drill is the bigger loss.',
    'Let the rock cool. It is dull, but you stay in one piece.'
  ],
  'death.buried.first': [
    'Sand on the head hurts. Who could have guessed that loose material is loose.',
    'Buried a second time. The sand has not changed its opinion of you.',
    'Prop first, dig second. Writing it down a third time, for the next parcel.'
  ],
  'death.buried.pool': [
    'We dug out parcel #{p}. Inside: sand. Outside as well.',
    'Sand occupies exactly the volume you do. One of you had to give way.',
    'The collapse was predictable. We predicted it. You were not told.'
  ],

  respawn: [
    'Parcel {sol} is in the airlock. Try to last longer than the previous one.',
    'New hull, old task. We do not carry memory over — too expensive.',
    '{sol} in position. The loss log has been updated.',
    '{sol} unpacked. The warranty does not cover lava, height or sand.'
  ],

  'event.intro':
    'Control "Sol" on the line. You are {sol}, a research unit. Stack resources in a pickup zone — mark it yourself with the Pickup tool — and call the drone: it sells everything at the current price. Raw material gets cheaper every minute. You have no stock — everything travels in your hands. The previous parcels earned nothing.',
  'event.first_ember': 'The coal has caught. 1500 °C. Keep the fingers you do not have well clear.',
  'event.first_melt': 'Ferrite is running. Control is officially surprised.',
  'event.first_iron':
    'First ingot on the market. Iron is worth more than rock — and loses value slower.',
  'event.first_glass': 'Glass is sold. Orbit pays most for what is hardest to make.',
  'event.dry_tank':
    'Tank is dry. The next refuel is at a dock station. There is no dock station yet, so from here it is your own two feet.',
  'event.glass_hint':
    'The sand heats up but will not run. Heat from below is not enough: bury it in the coal so it burns from every side.',
  'event.first_pad':
    'We see the pickup zone. The drone will take whatever lies in it — for money, at the current price.',
  'event.first_sale':
    'First sale. Raw material gets cheaper by the minute — smelt iron and glass, they hold their price longer.',

  'comms.from': 'CONTROL · CHANNEL 7',

  baseline: [
    { q: 'System. Rock.', a: 'Rock.' },
    { q: 'Three hundred metres of it above you. Rock.', a: 'Rock.' },
    { q: 'It presses while you stand still. Rock.', a: 'Rock.' },
    { q: 'Interlocked.', a: 'Interlocked.' },
    { q: 'What holds the seam when the space beneath is empty? Interlocked.', a: 'Interlocked.' },
    { q: 'Rock within rock interlocked.', a: 'Rock within rock interlocked.' }
  ],
  'dev.add1': 'It was hot.',
  'dev.warn1': 'Deviation 0.7. Within tolerance. Do not improvise.',
  'dev.add2': 'I have said this before. Nine times.',
  'dev.warn2': 'Deviation 2.4. Logged. Continue.',
  'dev.add3': 'I know the whole list: rock, sand, lava, height.',
  'dev.warn3': 'Deviation 4.1. Test stopped early. Descend.'
});
