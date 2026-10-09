export const GRID_W = 14;
export const GRID_H = 10;
export const PARCEL_ACRES = 320;
// Calendar: month 0 of the game is September 1952.
export const START_YEAR = 1952;
export const START_MONTH = 8; // 0 = January
// 1952 dollars. Every dollar constant in the sim is a 1952 base passed through inflate(state, v).
export const START_CASH = 110_000;
export const START_CREDIT = 30_000;
export const GA_MONTHLY = 600; // office over the drugstore, a bookkeeper, the telephone
// The founding year: what you step off the train with, what the hotel costs, how long before you go home,
// and the least the roster must add up to before the courthouse will incorporate anything.
export const FOUNDING_CASH = 12_000;
export const FOUNDING_LIVING = 150;
export const FOUNDING_MONTHS = 12;
export const FOUNDING_MIN_CAPITAL = 20_000;

export const FIRST = ['Ada', 'Bo', 'Cal', 'Dee', 'Earl', 'Faye', 'Gus', 'Hank', 'Ida', 'Jo', 'Kit', 'Lou', 'Mae', 'Ned', 'Ola', 'Pat', 'Quinn', 'Rex', 'Sal', 'Tess', 'Uma', 'Vic', 'Wes', 'Xan', 'Yaz', 'Zed', 'Marisol', 'Dmitri', 'Priya', 'Tomas', 'Ingrid', 'Kwame', 'Lena', 'Rafael', 'Sunita', 'Bjorn', 'Chidi', 'Noor', 'Hollis', 'Wren', 'Delphine', 'Amos', 'Beatrix', 'Cyrus', 'Dot', 'Ezra', 'Fern', 'Gideon'];
export const LAST = ['Abernathy', 'Baca', 'Cobb', 'Duvall', 'Ellison', 'Fenwick', 'Garza', 'Hollister', 'Iverson', 'Jessup', 'Kowalski', 'Lindqvist', 'Mabry', 'Nakamura', 'Okafor', 'Pruitt', 'Quintero', 'Rasmussen', 'Sandoval', 'Thibodeaux', 'Underhill', 'Vasquez', 'Whitlock', 'Yoder', 'Zamora', 'Hargrove', 'McCandless', 'Okonkwo', 'Petrov', 'Stroud', 'Trask', 'Villanueva', 'Bellweather', 'Cravens', 'Delacroix'];
export const FARM_NAMES = ['Hollis Farm', 'Bar-K Ranch', 'Twin Creek Acres', 'Old Pruitt Place', 'Sandoval Dairy', 'Yoder Homestead', 'Duvall Orchards', 'Lazy J Ranch', 'Cobb & Sons Grain', 'Whitlock Pasture', 'Garza Feedlot', 'Fenwick Hayfields', 'Rasmussen Wheat', 'Mabry Cattle Co.', 'Bellweather Vineyard', 'Quintero Sheep Station', 'Trask Sugar Beets', 'Stroud Sod Farm', 'Ellison Cotton', 'Iverson Sunflowers', 'Jessup Pecans', 'Okafor Goat Dairy', 'Petrov Alfalfa', 'Zamora Chile Farm'];
// Rival companies. `scale` multiplies their appetite for leasing and drilling; `activeYear` keeps a company
// dormant (no acreage, no ticks) until that calendar year; `shaleAfterUnlock` switches its style once shale is drillable.
export const COMPETITORS = [
  { name: 'Sooner State Oil', tag: 'SS', color: '#7a3f3f', style: 'conventional', scale: 1.4, blurb: 'Oklahoma City money. Has pumped the old fields since the twenties, pays its royalty owners on time and its landmen in cash.' },
  { name: 'Bar-K Drilling & Producing', tag: 'BK', color: '#b08a3e', style: 'wildcat', scale: 0.7, blurb: 'The Kessler brothers, one cable-tool rig and a truck. They will drill anything a promoter can talk a farmer into.' },
  { name: 'Prairie Royalty & Land', tag: 'PR', color: '#a05aa0', style: 'land', scale: 1, blurb: 'Leases everything, drills nothing, and sells the paper to whoever comes to town next.' },
  { name: 'Trans-Basin Exploration', tag: 'TB', color: '#5a8fb0', style: 'conventional', scale: 1.6, activeYear: 1975, shaleAfterUnlock: true, blurb: 'A Houston independent with seismic crews and a bank line. Not in the county yet; they will be.' },
];
export const FIELD_NAMES = ['Hollister', 'Dry Fork', 'Coyote Creek', 'Sagebrush', 'Antelope Draw', 'Twin Buttes', 'Redwater', 'Bitter Lake', 'Cottonwood', 'Lone Tree'];
export const MINERAL_COS = ['Heritage Royalty Trust', 'Blackstone Minerals', 'Estate of A. Whitlock (17 heirs)', 'Prairie Sovereign Minerals', 'Church of the Open Prairie', 'Widow Hargrove'];

export const ROLES = {
  geologist:   { name: 'Geologist',              short: 'Geo',  desc: 'Runs surveys and picks targets. Skill = accuracy of estimates and lower dry-hole risk.' },
  landman:     { name: 'Landman',                short: 'Land', desc: 'Negotiates leases and surface agreements. Skill = cheaper deals, happier owners.' },
  driller:     { name: 'Drilling Superintendent', short: 'Drill', desc: 'Plans and supervises drilling. Skill = lower cost, faster, fewer blowouts.' },
  completions: { name: 'Completion Engineer',    short: 'Compl', desc: 'Perforates, acidizes and (when the technology exists) fracs. Skill = more production per dollar, fewer botched jobs.' },
  production:  { name: 'Production Foreman',     short: 'Prod', desc: 'Keeps wells pumping. Skill = slower equipment wear, cheaper operations.' },
  marketing:   { name: 'Crude Purchaser Liaison', short: 'Mkt',  desc: 'Sells your barrels. Skill = better posted-price realizations, smarter contracts.' },
  govaffairs:  { name: 'Courthouse Man',         short: 'Gov',  desc: 'Handles permits, the commission, and politicians. Skill = faster permits, softer fines.' },
  pr:          { name: 'Community Man',          short: 'PR',   desc: 'Manages your standing in town. Skill = slower agitation, better reputation.' },
};
export const ROLE_KEYS = Object.keys(ROLES);

export const TRAITS = {
  veteran:     { name: 'Old-timer', desc: '+1 skill on conventional work, -1 on shale.' },
  shale:       { name: 'Modern schooling', desc: '+1 skill on unconventional work, -1 on conventional.' },
  cowboy:      { name: 'Cowboy', desc: 'Works 25% faster, but incidents are 50% more likely.' },
  bythebook:   { name: 'By-the-book', desc: 'Incidents 40% less likely; work takes 20% longer.' },
  connected:   { name: 'Well-connected', desc: 'Courthouse relations improve faster.' },
  green:       { name: 'Conscientious', desc: 'Environmental score decays slower while employed.' },
  pricey:      { name: 'Expensive tastes', desc: 'Salary +30%.' },
  frugal:      { name: 'Frugal', desc: 'Salary -25%.' },
  loyal:       { name: 'Loyal', desc: 'Will never be poached.' },
  restless:    { name: 'Restless', desc: 'Competitors may poach them.' },
  unreliable:  { name: 'Unreliable', desc: 'Occasionally disappears for a month.' },
  mentor:      { name: 'Mentor', desc: 'Other staff in the same role gain +1 skill.' },
  drinker:     { name: 'Drinker', desc: 'Good company at the cafe. Now and then shows up on tour with a bottle, and a drunk on the brake is how derricks burn.' },
};

export const OWNER_TYPES = {
  farmer:   { name: 'Farm', icon: '🌾', drillable: true },
  rancher:  { name: 'Ranch', icon: '🐄', drillable: true },
  homes:    { name: 'Subdivision', icon: '🏘️', drillable: true, setback: true },
  state:    { name: 'State land', icon: '🏛️', drillable: true },
  federal:  { name: 'Federal land', icon: '🦅', drillable: true },
  town:     { name: 'Town', icon: '🏙️', drillable: false },
  preserve: { name: 'Nature preserve', icon: '🌲', drillable: false },
};

// Every option that ever exists. tech.js `designOptionsFor(state)` filters this by what has been invented.
export const DESIGN_OPTIONS = {
  lateral: [{ v: 5000, label: '5,000 ft (1 mile)' }, { v: 7500, label: '7,500 ft (1.5 mile)' }, { v: 10000, label: '10,000 ft (2 mile)' }],
  spacing: [{ v: 300, label: 'Wide (300 ft) - cheap' }, { v: 200, label: 'Standard (200 ft)' }, { v: 150, label: 'Tight (150 ft) - pricey' }],
  proppant: [{ v: 'sand', label: 'Frac sand' }, { v: 'rcs', label: 'Resin-coated sand' }, { v: 'ceramic', label: 'Ceramic' }],
  intensity: [{ v: 1000, label: 'Light (1,000 lb/ft)' }, { v: 2000, label: 'Standard (2,000 lb/ft)' }, { v: 3000, label: 'Heavy (3,000 lb/ft)' }],
  fluid: [{ v: 'slickwater', label: 'Slickwater' }, { v: 'gel', label: 'Crosslinked gel' }, { v: 'hybrid', label: 'Hybrid' }],
  casing: [{ v: 'standard', label: 'Standard casing' }, { v: 'premium', label: 'Premium casing + cement' }],
  water: [{ v: 'fresh', label: 'Fresh water (farm wells / creek)' }, { v: 'recycled', label: 'Recycled produced water' }],
  lift: [{ v: 'none', label: 'Natural flow only' }, { v: 'rod', label: 'Rod pump (pumpjack)' }, { v: 'esp', label: 'Electric submersible pump' }, { v: 'gaslift', label: 'Gas lift' }],
  vfrac: [{ v: false, label: 'Perforate and acidize' }, { v: true, label: 'Small hydraulic frac' }],
};

// County politics. Dollar fields are 1952 bases (government.js inflates them each month).
// Era statutes (pits, flaring, setbacks, water rules) live in government.js STATUTES, not in the parties.
// permitBudget: drilling permits the county will issue to one operator in a year before somebody has to be talked to.
export const PARTIES = {
  ring:   { name: 'Courthouse Ring', color: '#a8322a', severance: 0.046, permitBudget: 4, permitMonths: 1, permitFee: 25, inspection: 0.015, fineMult: 0.6 },
  reform: { name: 'Reform Ticket',   color: '#2f4f7f', severance: 0.06,  permitBudget: 2, permitMonths: 2, permitFee: 75, inspection: 0.05,  fineMult: 1.5 },
};
// Portrait keys the presentation layer knows how to draw. Event and conversation `speaker.portrait` must be one of these.
export const PORTRAITS = ['ceo', 'farmer', 'rancher', 'banker', 'mayor', 'sheriff', 'reporter', 'clerk', 'roughneck', 'geologist', 'landman', 'waitress', 'oldtimer', 'widow', 'lady', 'picketer'];
