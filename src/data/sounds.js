// Two kinds of entries:
//  - kind 'free':   original CC0 chiptunes hosted in this repo (public/sounds/),
//                   playable in-page and downloadable directly.
//  - kind 'iconic': famous copyrighted game sounds. We don't re-host them; the
//                   download button opens a public source where users can get them.

const search = {
  myinstants: (q) => `https://www.myinstants.com/en/search/?name=${encodeURIComponent(q)}`,
  soundsResource: (q) => `https://www.sounds-resource.com/search/?q=${encodeURIComponent(q)}`,
  archive: (q) => `https://archive.org/search?query=${encodeURIComponent(q)}`,
}

export const CATEGORIES = ['Ringtone', 'Notification', 'Alarm', 'Message']

const free = (id, title, category, vibe, duration) => ({
  id,
  kind: 'free',
  title,
  game: 'Original chiptune',
  category,
  vibe,
  duration,
  src: `${import.meta.env.BASE_URL}sounds/${id}.mp3`,
  source: { name: 'This site · CC0', url: `${import.meta.env.BASE_URL}sounds/${id}.mp3` },
})

const iconic = (id, title, game, year, category, vibe, query, sourceName = 'myinstants') => ({
  id,
  kind: 'iconic',
  title,
  game,
  year,
  category,
  vibe,
  source: {
    name: { myinstants: 'MyInstants', soundsResource: 'The Sounds Resource', archive: 'Internet Archive' }[sourceName],
    url: search[sourceName](query),
  },
})

export const SOUNDS = [
  free('coin-chime', 'Coin Chime', 'Notification', 'Bright two-note pickup, repeated three times', 2.3),
  free('level-up', 'Level Up', 'Message', 'Fast rising arpeggio with a bass hit', 1.4),
  free('power-up', 'Power Up', 'Notification', 'Climbing thin-pulse sweep', 1.3),
  free('extra-life', 'Extra Life', 'Message', 'Bouncy six-note jingle, played twice', 2.7),
  free('quest-complete', 'Quest Complete', 'Message', 'Warm two-voice resolve', 1.9),
  free('victory-fanfare', 'Victory Fanfare', 'Ringtone', 'Triumphant brass-like fanfare', 2.6),
  free('boss-alert', 'Boss Alert', 'Alarm', 'Harsh saw-wave triple warning', 2.8),
  free('low-hp-alarm', 'Low HP Alarm', 'Alarm', 'Insistent beeping you can’t ignore', 4.0),
  free('save-point', 'Save Point', 'Notification', 'Soft shimmering triangle chord', 2.2),
  free('treasure-chest', 'Treasure Chest', 'Message', 'Scale run into a sparkling high note', 1.8),
  free('menu-select', 'Menu Select', 'Notification', 'Tiny double blip, very subtle', 0.5),
  free('pixel-phone', 'Pixel Phone', 'Ringtone', 'Classic trill ring, 8-bit style', 6.1),
  free('dungeon-theme', 'Dungeon Theme', 'Ringtone', 'Moody minor melody over a bass line', 7.3),
  free('space-blaster', 'Space Blaster', 'Notification', 'Laser zaps, four quick shots', 0.9),

  iconic('mario-coin', 'Coin', 'Super Mario Bros.', 1985, 'Notification', 'The most recognisable pickup sound ever', 'mario coin'),
  iconic('mario-1up', '1-Up', 'Super Mario Bros.', 1985, 'Message', 'Cheerful extra-life jingle', 'mario 1up'),
  iconic('mario-powerup', 'Power-Up', 'Super Mario Bros.', 1985, 'Notification', 'Mushroom growth sound', 'mario power up'),
  iconic('zelda-secret', 'Secret Discovered', 'The Legend of Zelda', 1986, 'Message', 'Puzzle-solved chime', 'zelda secret'),
  iconic('zelda-item', 'Item Get', 'The Legend of Zelda: Ocarina of Time', 1998, 'Notification', 'Holding the item above your head', 'zelda item get'),
  iconic('zelda-hey-listen', 'Hey! Listen!', 'The Legend of Zelda: Ocarina of Time', 1998, 'Message', 'Navi demanding your attention', 'hey listen navi'),
  iconic('sonic-ring', 'Ring Collect', 'Sonic the Hedgehog', 1991, 'Notification', 'Crisp ring pickup', 'sonic ring'),
  iconic('pokemon-heal', 'Pokémon Center Heal', 'Pokémon Red & Blue', 1996, 'Message', 'Short healing jingle', 'pokemon center heal'),
  iconic('pokemon-levelup', 'Level Up', 'Pokémon Red & Blue', 1996, 'Notification', 'Your Pokémon grew to a new level', 'pokemon level up'),
  iconic('mgs-alert', 'Alert “!”', 'Metal Gear Solid', 1998, 'Alarm', 'The guard has spotted you', 'metal gear alert'),
  iconic('ff-victory', 'Victory Fanfare', 'Final Fantasy VII', 1997, 'Ringtone', 'Battle won, time to celebrate', 'final fantasy victory'),
  iconic('pacman-start', 'Game Start', 'Pac-Man', 1980, 'Ringtone', 'Iconic arcade opening tune', 'pacman intro'),
  iconic('tetris-theme', 'Theme A', 'Tetris (Game Boy)', 1989, 'Ringtone', 'Korobeiniki on the Game Boy', 'tetris theme'),
  iconic('halo-theme', 'Main Theme Chant', 'Halo: Combat Evolved', 2001, 'Ringtone', 'Monks chanting, epic intro', 'halo theme'),
  iconic('minecraft-levelup', 'XP Level Up', 'Minecraft', 2011, 'Notification', 'Satisfying orb ding', 'minecraft level up'),
  iconic('minecraft-villager', 'Villager “Hmm”', 'Minecraft', 2011, 'Message', 'The villager grunt', 'minecraft villager'),
  iconic('among-us-meeting', 'Emergency Meeting', 'Among Us', 2018, 'Alarm', 'Someone pressed the button', 'among us emergency meeting'),
  iconic('animal-crossing-ring', 'Phone Ring', 'Animal Crossing: New Horizons', 2020, 'Ringtone', 'Cosy NookPhone vibe', 'animal crossing', 'soundsResource'),
  iconic('sf2-hadouken', 'Hadouken!', 'Street Fighter II', 1991, 'Message', 'Fireball shout', 'hadouken'),
  iconic('mk-finish', 'Finish Him!', 'Mortal Kombat', 1992, 'Alarm', 'Dramatic announcer call', 'finish him'),
  iconic('portal-still-alive', 'Still Alive', 'Portal', 2007, 'Ringtone', 'GLaDOS end-credits song', 'portal still alive', 'archive'),
  iconic('stardew-coin', 'Purchase', 'Stardew Valley', 2016, 'Notification', 'Cash register coin clink', 'stardew valley', 'soundsResource'),
]
