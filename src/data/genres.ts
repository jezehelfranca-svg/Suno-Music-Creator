import { GenreCategory, GenreItem } from '../types';

export const BASE_GENRES: string[] = [
  "Ambient", "Ambient House / Chill-Out", "New Age", "Cool & West Coast Jazz",
  "Smooth Jazz", "Nordic Jazz", "Country / Folk Blues", "Boogie Woogie / Piano Blues",
  "Vaudeville / Classic Blues", "Neo / Nu Soul", "Memphis / Deep / Southern Soul",
  "Philly Soul", "American & British Folk Revival", "Singer/Songwriter", "Indie Folk & Freakfolk",
  "Dream Pop & Shoegaze", "Indie Pop", "Jangle Pop / Indie Rock", "Soft Rock / Adult Contemporary",
  "Heartland Rock & A.O.R.", "Post-Britpop", "Trip Hop", "Broken Beats", "Ambient Breaks & Illbient",
  "Traditional Gospel", "(Negro) Spirituals & Worksongs", "Modern Gospel",
  "Progressive, Art- & Symphonic Rock", "Minimalism", "Third Stream & Modal Jazz",
  "Bolero", "Bossa Nova", "Trova & Feeling", "Dark Ambient / Dark Industrial",
  "Darkwave & Coldwave", "Gothic Rock & Deathrock", "Progressive & Outlaw",
  "Americana / Alternative", "Classic Country / Hillbilly",
  "ROCKABILLY & ROCK 'N' ROLL", "SKIFFLE (REVIVAL)", "SURF ROCK", "GARAGE ROCK",
  "(MERSEY)BEAT / BRITISH INVASION", "FOLK ROCK", "PSY / ACID ROCK & PSYCHEDELIA",
  "HARD ROCK", "SOUTHERN ROCK", "PUB ROCK & PROTO PUNK", "PUNK ROCK", "NO WAVE",
  "POST-PUNK", "NEW WAVE", "SYNTHPOP & NEW ROMANTICS", "GLAM / GLITTER / SHOCK ROCK",
  "HORROR PUNK & PSYCHOBILLY", "ANARCHO-PUNK, CRUST, & D-BEAT", "ORIGINAL HARDCORE (PUNK)",
  "CROSSOVER THRASH", "GRINDCORE", "MATH ROCK & MATHCORE", "POST-HARDCORE, EMO & SCREAMO",
  "GRUNGE", "NOISE ROCK", "RAP ROCK / FUNK METAL", "POST-ROCK", "POST-GRUNGE",
  "SKATE PUNK & POP PUNK", "ALTERNATIVE ROCK / INDIE II", "SYNTHCORE & CRUNKCORE",
  "METALCORE / NWOAHM", "EMO ROCK", "GARAGE & POST-PUNK REVIVAL / NU RAWK",
  "INDIETRONICA & CHILLWAVE", "NEW / NU / POST-PROG", "DANCE-PUNK & NU RAVE",
  "BRILL BUILDING POP & CROONERS", "(EARLY) POP ROCK & POWER POP", "BUBBLEGUM & TEENYBOP",
  "BRITPOP", "DANCE POP", "HI-NRG / EURODISCO", "ELECTROCLASH", "DISCO POP / POST-DISCO",
  "ASIAN POP", "SCHLAGER", "ELECTROPOP", "NWOBHM", "CLASSIC METAL", "THRASH METAL",
  "GLAM / HAIR / POP METAL", "DOOM METAL", "PROGRESSIVE METAL", "EXTREME METAL",
  "DEATH METAL", "BLACK METAL", "POWER METAL", "SYMPHONIC & GOTHIC METAL",
  "NU METAL & RAP METAL", "STONER & SLUDGE METAL", "(AVANT-GARDE) INDUSTRIAL",
  "KRAUTROCK", "NOISE MUSIC", "INDUSTRIAL ROCK / METAL",
  "MINIMAL WAVE / SYNTH & INDUSTRIAL (REVIVAL)", "ELECTRONIC BODY MUSIC (EBM)",
  "FUTUREPOP", "ELECTRO-INDUSTRIAL / AGGREPPO", "WESTERN SWING", "BLUEGRASS",
  "HONKY TONK / HARDCORE", "BAKERSFIELD", "NASHVILLE / COUNTRYPOLITAN", "URBAN COUNTRY",
  "CONTEMPORARY / NEOTRADITIONIONAL", "COUNTRY POP & ROCK", "RHYTHM 'N' BLUES", "DOO WOP",
  "EARLY FUNK & P-FUNK", "CHICAGO & DETROIT SOUL (MOTOWN)", "GO-GO", "DISCO",
  "BOOGIE / ELECTROFUNK", "NEW JACK SWING / SWINGBEAT", "DEEP FUNK & NU FUNK",
  "URBAN SOUL / POP (NU R&B I)", "NU DISCO & FUNKTRONNICA", "RAGTIME & STRIDE",
  "CHICAGO / CITY / URBAN BLUES", "JUMP BLUES", "(ELECTRIC) TEXAS BLUES", "WEST COAST BLUES",
  "LOUISIANA / SWAMP BLUES", "HILL COUNTRY & TRANCE BLUES", "BRITISH BLUES & BLUES ROCK",
  "SOUL BLUES (SOUTHERN SOUL II)", "TEXAS BLUES ROCK & MODERN ELECTRIC", "RELIPOP & -ROCK / CCM",
  "NEW ORLEANS & DIXIELAND JAZZ", "CHICAGO JAZZ", "SWING / BIG BAND", "BEBOP", "HARD BOP",
  "SOUL JAZZ / JAZZ-FUNK", "FREE JAZZ / AVANT-GARDE", "FUSION / JAZZ ROCK",
  "ACID JAZZ / JAZZDANCE", "ELECTRO SWING", "NU JAZZ / ELECTRO JAZZ",
  "NEW ORLEANS & DIXIELAND REVIVALS", "OLD SKOOL RAP PIONEERS",
  "GOLDEN AGE RAP (& HARDCORE RAP)", "(WEST COAST) GANGSTA RAP", "MIAMI BASS & BOUNCE",
  "JAZZ RAP / NATIVE TONGUE", "EAST COAST GANGSTA RAP", "TRAP & DRILL",
  "(DIRTY) SOUTH RAP, CRUNK & SNAP", "PROGRESSIVE / NU SKOOL RAP", "GLITCH HOP & WONKY",
  "URBAN BREAKS (NU R & B II)", "MENTO", "SKA", "(ROOTS) REGGAE", "ROCKSTEADY", "DUB", "RAGGA",
  "SKA PUNK & SKACORE", "LOVERS ROCK & UK REGGAE", "DANCEHALL", "REGGAE FUSION & BHANGRAMUFFIN",
  "REGGAETÓN & LATIN RAP", "CLASSIC & ACID TRANCE", "GOA TRANCE & PSYTRANCE",
  "PROGRESSIVE TRANCE", "EUROTRANCE & VOCAL", "IBIZA & DREAM TRANCE / HOUSE",
  "UPLIFTING / EPIC TRANCE", "HARDTRANCE", "NEO-TRANCE", "TECH TRANCE",
  "CHICAGO HOUSE & GARAGE HOUSE", "ACID HOUSE", "HIP HOUSE & EURODANCE", "DEEP HOUSE",
  "PROGRESSIVE HOUSE", "FRENCH & FUNKY HOUSE", "MICROHOUSE / MINIMAL HOUSE",
  "GHETTO HOUSE, GHETTPOTECH & JUKE", "ELECTRO HOUSE & DUTCH HOUSE", "FIDGET HOUSE & COMPLEXTRO",
  "NRG, HARD NRG & (UK) HARD HOUSE", "MOOMBAHTON", "DETROIT TECHNO", "MINIMAL TECHNO",
  "(FREE-)TEK(K)NO", "INDUSTRIAL TECHNO & SCHRANZ", "TECH HOUSE", "AMBIENT TECHNO & IDM",
  "HARDTECHNO", "HARDCORE TECHNO / RAVE", "NEW BEAT", "NU STYLE / MAINSTREAM BREAKBEAT HARDCORE",
  "GABBER", "HARDSTYLE", "HAPPY HARDCORE & BOUNCY TECHNO", "DIGITAL HARDCORE & BREAKCORE",
  "TRANCECORE & ACIDCORE", "SPEED- & TERRORCORE", "OLD SKOOL JUNGLE & DRUM 'N' BASS",
  "INTELLIGENT & JAZZSTEP", "JUMP UP", "DARKCORE & DARKSTEP", "HARDSTEP & TECHSTEP",
  "NEUROFUNK", "POST-DUBSTEP", "DUBSTEP", "LIQUID FUNK", "FUTURE BASS & FUTURE GARAGE",
  "BREAKBEAT HARDCORE (RAVE II)", "FREESTYLE & BREAKDANCE", "FLORIDA BREAKS", "NU SKOOL BREAKS",
  "CHEMICAL BREAKS & BIG BEAT", "UK GARAGE (2-STEP & SPEED)", "ELECTRO", "BREAKBEAT GARAGE & GRIME",
  "BASSLINE & UK FUNKY", "EDM TRAP / TRAPSTEP", "SYNTH / ELECTRONICA", "MUSIQUE CONCRÈTE",
  "BIT MUSIC (CHIPTUNE)", "MUZAK / ELEVATOR MUSIC", "LOUNGE / SPACE AGE POP",
  "DIGITAL MINIMALISM / LOWERCASE", "SYNTHWAVE & VAPORWAVE", "GLITCH / CLICKS 'N' CUTS",
  "CONTRADANZA", "PUNTO & GUAJIRA", "HABANERA", "SON", "DANZÓN", "RUMBA",
  "MAMBO & CHACHACHA", "CUBOP", "CANCION", "NUEVA TROVA", "SALSA", "TIMBA", "BAILE-FUNK",
  "BOMBA, PLENA & MERENGUE", "BOOGALOO", "CALYPSO", "CHACÓN", "CUMBIA", "HUAYNO & CHICA",
  "MILONGA", "SAMBA", "SOCA & PUNTA", "TANGO", "TROPICALIA", "ZOUK", "TEXMEX & CONJUNTO",
  "NORTEC", "TECNOBREGA & -RUMBA", "CHICANO ROCK", "CHALGA", "BALKAN BEAT / POP", "BHANGRA",
  "INDIAN RAGA", "HIGHLIFE", "AFROBEAT", "WORLDBEAT", "ARABIAN POP", "POP RAÏ", "CAJUN"
].sort();

export const COINED_GENRES: string[] = [
  "Alternative Dance Rock",
  "Alternative Grunge",
  "Astral Jazz",
  "Chillstep Ambient Dub",
  "ChillwaveFi",
  "City Pop Fusion",
  "City Pop Noir",
  "ClassicalWave",
  "Cosmic Disco",
  "Cyber Funk",
  "Cyber Soul",
  "Disco Funk Trance Rhodes",
  "Dream Pop Trap",
  "Electro Swing Fusion",
  "Electro Swing Metal",
  "Emo Metal Baroque",
  "Experimental K-Pop",
  "Funk Celtic",
  "Funk Trance",
  "Future Bass Techno",
  "Future City Pop",
  "Future Garage K-Pop EDM",
  "Future Garage Techno",
  "Future Garage Vaporwave",
  "Future Jazz Fusion",
  "Future R&B",
  "Futuristic Blues",
  "Galactic Reggae",
  "Ghibli Jazz",
  "Glitch Hop IDM",
  "Goth Emo Metal",
  "Groovy Bass Metal",
  "Heavy Metal Synth Pop Death Metal",
  "Heavy Metal Synth Pop New Wave",
  "Hitech Psytrance",
  "Indie Electronica",
  "Instrumental Guitar Virtuoso",
  "J-Metal Idol Fusion",
  "Jazz Fusion Laidback",
  "Kawaii EDM Math Rock Metal",
  "Kawaii Metal",
  "Kawaii Metal Math Rock",
  "Kawaii Rock EDM Metal",
  "Latin Trap Crossover",
  "Lofi Hip Hop Acoustic",
  "Lofi Hip Hop Classical",
  "Mall Vaporwave Retrowave",
  "Math Rock Ambient",
  "Math Rock Blues Fusion",
  "Math Rock Double Bass Melody",
  "Math Rock Funk Fusion",
  "Math Rock Goth Rock",
  "Math Rock Piano Virtuoso",
  "Math Rock Reggae Fusion",
  "Math Rock Rhodes Virtuoso",
  "Math Rock Vaporwave",
  "Mellow Blues Funk",
  "Mellow Funk",
  "Mellow Laidback Jazz",
  "Mellow Slow Vaporwave Metal",
  "Melodic EDM Trance Metal",
  "Metalcore Rap Industrial Metal",
  "Neo-City Pop",
  "Neo-Soultronica",
  "Neo-Tokyo",
  "Neo-Tokyo Lo-Fi",
  "Neon Noir",
  "New Wave Synth Pop",
  "Nu Disco House",
  "Post-Punk Wave",
  "Progressive Rock Funk Trance",
  "Psychedelic 70s Trance",
  "Psychedelic Rock Gypsy Jazz",
  "Psychedelic Trip Hop",
  "Punk Waltz",
  "R&B Metal Fusion",
  "Rap Funk Metal Trance",
  "Rap Funk Trance",
  "Retro Rockets",
  "Retrowave Synth Pop",
  "Rural Pop",
  "Slow Sensual Blues Guitar",
  "Slow Sensual Math Rock Blues",
  "Solar Swing",
  "Space Jazz",
  "Surf Rock Jazz Folk Rock",
  "Synth Groove Metal",
  "Time Traveler's Swing",
  "Trance Flamenco",
  "Vaporsoul",
  "Vaporwave City Pop",
  "Vaporwave EDM",
  "Vaporwave K-Pop",
  "Vaporwave Metal",
  "Vaporwave Ska Pop",
  "Vaporwave Synth Funk",
  "Vaporwave Synth Punk",
  "Voyager Vibes"
].sort();

export const COINED_SET = new Set(COINED_GENRES.map(g => g.toLowerCase()));

export function isCoinedGenre(genre: string): boolean {
  return COINED_SET.has(genre.trim().toLowerCase());
}

export const ALL_GENRES: string[] = [...BASE_GENRES, ...COINED_GENRES].sort((a, b) => 
  a.localeCompare(b, undefined, { sensitivity: 'base' })
);

export function categorizeGenre(genre: string): GenreCategory {
  const g = genre.toLowerCase();
  if (isCoinedGenre(genre)) return 'Coined Fusion';

  if (
    g.includes('metal') || g.includes('rock') || g.includes('punk') ||
    g.includes('grunge') || g.includes('screamo') || g.includes('thrash') ||
    g.includes('hardcore') || g.includes('nwobhm')
  ) {
    return 'Rock & Metal';
  }

  if (
    g.includes('trance') || g.includes('house') || g.includes('techno') ||
    g.includes('electro') || g.includes('ambient') || g.includes('synth') ||
    g.includes('dubstep') || g.includes('dnb') || g.includes('drum \'n\' bass') ||
    g.includes('jungle') || g.includes('edm') || g.includes('wave') ||
    g.includes('idm') || g.includes('glitch') || g.includes('breakbeat') ||
    g.includes('ebm') || g.includes('chiptune') || g.includes('industrial')
  ) {
    return 'Electronic & Dance';
  }

  if (
    g.includes('rap') || g.includes('hip') || g.includes('trap') ||
    g.includes('drill') || g.includes('grime') || g.includes('bounce') ||
    g.includes('crunk') || g.includes('urban') || g.includes('r&b') || g.includes('soul')
  ) {
    return 'Hip-Hop & Urban';
  }

  if (
    g.includes('jazz') || g.includes('blues') || g.includes('swing') ||
    g.includes('bebop') || g.includes('bop') || g.includes('ragtime') ||
    g.includes('boogie')
  ) {
    return 'Jazz & Blues';
  }

  if (
    g.includes('pop') || g.includes('disco') || g.includes('schlager') ||
    g.includes('crooner') || g.includes('teenybop') || g.includes('brill') ||
    g.includes('gospel') || g.includes('ccm')
  ) {
    return 'Pop & Vocal';
  }

  return 'World & Traditional';
}

export const GENRE_ITEMS: GenreItem[] = ALL_GENRES.map(name => ({
  name,
  isCoined: isCoinedGenre(name),
  category: categorizeGenre(name)
}));

export const CATEGORIES: GenreCategory[] = [
  'All',
  'Rock & Metal',
  'Electronic & Dance',
  'Hip-Hop & Urban',
  'Jazz & Blues',
  'Pop & Vocal',
  'World & Traditional',
  'Coined Fusion'
];
