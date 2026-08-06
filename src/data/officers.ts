export type Officer = {
  id: string;
  name: string;
  shortName: string;
  group: string;
  rarity: 'Epic' | 'Rare' | 'Uncommon';
  className: 'Command' | 'Science' | 'Engineering';
  level: number;
  rank: number;
  power: number;
  attack: number;
  defense: number;
  health: number;
  ability: string;
  captain: string;
  color: string;
};

export const officers: Officer[] = [
  { id: 'kirk', name: 'James T. Kirk', shortName: 'JK', group: 'Enterprise Crew', rarity: 'Epic', className: 'Command', level: 50, rank: 5, power: 68420, attack: 8200, defense: 7160, health: 8840, ability: 'Inspirational', captain: 'Leader', color: '#e7a53f' },
  { id: 'spock', name: 'Spock', shortName: 'SP', group: 'Enterprise Crew', rarity: 'Rare', className: 'Science', level: 45, rank: 4, power: 57280, attack: 6380, defense: 8210, health: 7550, ability: 'Illogical', captain: 'Logical', color: '#68b9d8' },
  { id: 'uhura', name: 'Nyota Uhura', shortName: 'NU', group: 'Enterprise Crew', rarity: 'Rare', className: 'Engineering', level: 40, rank: 4, power: 49310, attack: 5840, defense: 6410, health: 7260, ability: 'Target That Signal', captain: 'Open Hailing Frequencies', color: '#d56d74' },
  { id: 'pike', name: 'Christopher Pike', shortName: 'CP', group: 'Discovery', rarity: 'Epic', className: 'Command', level: 50, rank: 5, power: 71150, attack: 8620, defense: 7420, health: 9050, ability: 'Teaching Moments', captain: 'Fight on Sight', color: '#d1a648' },
  { id: 'moreau', name: 'Moreau', shortName: 'MO', group: 'Shakedown Cruise', rarity: 'Rare', className: 'Science', level: 45, rank: 4, power: 55920, attack: 6020, defense: 8430, health: 7680, ability: 'No Fear', captain: 'The One Who Knocks', color: '#8ba6d7' },
  { id: 'chen', name: 'Chen', shortName: 'CH', group: 'Another Time', rarity: 'Uncommon', className: 'Science', level: 40, rank: 4, power: 41860, attack: 4990, defense: 7160, health: 6210, ability: 'Energy Absorber', captain: 'Quick Thinking', color: '#76b897' },
  { id: 'tlaan', name: "T'Laan", shortName: 'TL', group: 'Another Time', rarity: 'Uncommon', className: 'Science', level: 35, rank: 3, power: 37640, attack: 4410, defense: 6690, health: 5740, ability: 'Objective Defense', captain: 'Thorough Scans', color: '#79a7bd' },
  { id: 'gorkon', name: 'Gorkon', shortName: 'GO', group: 'Klingon Patriots', rarity: 'Epic', className: 'Command', level: 45, rank: 4, power: 62470, attack: 8420, defense: 6890, health: 7710, ability: 'Quick Victory', captain: 'Create a Distraction', color: '#bf765d' },
  { id: 'khan', name: 'Khan', shortName: 'KH', group: 'Augments', rarity: 'Epic', className: 'Command', level: 45, rank: 4, power: 60110, attack: 8010, defense: 6620, health: 7490, ability: 'Savage Tenacity', captain: 'Ruthless Mastermind', color: '#c38364' },
  { id: 'nero', name: 'Nero', shortName: 'NE', group: "Nero's Crew", rarity: 'Epic', className: 'Engineering', level: 40, rank: 4, power: 58420, attack: 7580, defense: 7120, health: 8010, ability: 'See the Flaws', captain: 'Joy in Vengeance', color: '#a86c6c' },
  { id: 'georgiou', name: 'Philippa Georgiou', shortName: 'PG', group: 'Discovery', rarity: 'Epic', className: 'Command', level: 40, rank: 4, power: 59380, attack: 7820, defense: 7010, health: 7960, ability: 'Never Fire First', captain: 'Deception', color: '#8d72b9' },
  { id: 'marcus', name: 'Carol Marcus', shortName: 'CM', group: 'Auxiliary Controls', rarity: 'Rare', className: 'Science', level: 35, rank: 3, power: 44860, attack: 5230, defense: 7280, health: 6480, ability: 'Applied Science', captain: 'Experimentalist', color: '#73a4bd' }
];
