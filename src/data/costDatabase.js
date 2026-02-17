// src/data/costDatabase.js
// Comprehensive Construction Cost Database with RSMeans-style rates
// Supports USD, INR, AED with location-based adjustments

/**
 * AISC Steel Weight Table - Weight per linear foot for common W-shapes
 * Source: AISC Steel Construction Manual, 16th Edition
 */
export const STEEL_WEIGHT_TABLE = {
    // W-shapes (depth x weight per foot)
    'W44x335': 335, 'W44x290': 290, 'W44x262': 262, 'W44x230': 230,
    'W40x503': 503, 'W40x431': 431, 'W40x397': 397, 'W40x362': 362,
    'W40x324': 324, 'W40x297': 297, 'W40x277': 277, 'W40x249': 249,
    'W40x215': 215, 'W40x199': 199, 'W40x183': 183, 'W40x167': 167,
    'W40x149': 149, 'W40x392': 392, 'W40x331': 331, 'W40x278': 278,
    'W40x264': 264, 'W40x235': 235, 'W40x211': 211,
    'W36x800': 800, 'W36x650': 650, 'W36x527': 527, 'W36x439': 439,
    'W36x395': 395, 'W36x361': 361, 'W36x330': 330, 'W36x302': 302,
    'W36x282': 282, 'W36x262': 262, 'W36x247': 247, 'W36x231': 231,
    'W36x256': 256, 'W36x232': 232, 'W36x210': 210, 'W36x194': 194,
    'W36x182': 182, 'W36x170': 170, 'W36x160': 160, 'W36x150': 150,
    'W36x135': 135,
    'W33x387': 387, 'W33x354': 354, 'W33x318': 318, 'W33x291': 291,
    'W33x263': 263, 'W33x241': 241, 'W33x221': 221, 'W33x201': 201,
    'W33x169': 169, 'W33x152': 152, 'W33x141': 141, 'W33x130': 130,
    'W33x118': 118,
    'W30x391': 391, 'W30x357': 357, 'W30x326': 326, 'W30x292': 292,
    'W30x261': 261, 'W30x235': 235, 'W30x211': 211, 'W30x191': 191,
    'W30x173': 173, 'W30x148': 148, 'W30x132': 132, 'W30x124': 124,
    'W30x116': 116, 'W30x108': 108, 'W30x99': 99, 'W30x90': 90,
    'W27x539': 539, 'W27x368': 368, 'W27x307': 307, 'W27x281': 281,
    'W27x258': 258, 'W27x235': 235, 'W27x217': 217, 'W27x194': 194,
    'W27x178': 178, 'W27x161': 161, 'W27x146': 146, 'W27x129': 129,
    'W27x114': 114, 'W27x102': 102, 'W27x94': 94, 'W27x84': 84,
    'W24x370': 370, 'W24x335': 335, 'W24x306': 306, 'W24x279': 279,
    'W24x250': 250, 'W24x229': 229, 'W24x207': 207, 'W24x192': 192,
    'W24x176': 176, 'W24x162': 162, 'W24x146': 146, 'W24x131': 131,
    'W24x117': 117, 'W24x104': 104, 'W24x103': 103, 'W24x94': 94,
    'W24x84': 84, 'W24x76': 76, 'W24x68': 68, 'W24x62': 62,
    'W24x55': 55,
    'W21x201': 201, 'W21x182': 182, 'W21x166': 166, 'W21x147': 147,
    'W21x132': 132, 'W21x122': 122, 'W21x111': 111, 'W21x101': 101,
    'W21x93': 93, 'W21x83': 83, 'W21x73': 73, 'W21x68': 68,
    'W21x62': 62, 'W21x57': 57, 'W21x50': 50, 'W21x48': 48,
    'W21x44': 44,
    'W18x311': 311, 'W18x283': 283, 'W18x258': 258, 'W18x234': 234,
    'W18x211': 211, 'W18x192': 192, 'W18x175': 175, 'W18x158': 158,
    'W18x143': 143, 'W18x130': 130, 'W18x119': 119, 'W18x106': 106,
    'W18x97': 97, 'W18x86': 86, 'W18x76': 76, 'W18x71': 71,
    'W18x65': 65, 'W18x60': 60, 'W18x55': 55, 'W18x50': 50,
    'W18x46': 46, 'W18x40': 40, 'W18x35': 35,
    'W16x100': 100, 'W16x89': 89, 'W16x77': 77, 'W16x67': 67,
    'W16x57': 57, 'W16x50': 50, 'W16x45': 45, 'W16x40': 40,
    'W16x36': 36, 'W16x31': 31, 'W16x26': 26,
    'W14x730': 730, 'W14x665': 665, 'W14x605': 605, 'W14x550': 550,
    'W14x500': 500, 'W14x455': 455, 'W14x426': 426, 'W14x398': 398,
    'W14x370': 370, 'W14x342': 342, 'W14x311': 311, 'W14x283': 283,
    'W14x257': 257, 'W14x233': 233, 'W14x211': 211, 'W14x193': 193,
    'W14x176': 176, 'W14x159': 159, 'W14x145': 145, 'W14x132': 132,
    'W14x120': 120, 'W14x109': 109, 'W14x99': 99, 'W14x90': 90,
    'W14x82': 82, 'W14x74': 74, 'W14x68': 68, 'W14x61': 61,
    'W14x53': 53, 'W14x48': 48, 'W14x43': 43, 'W14x38': 38,
    'W14x34': 34, 'W14x30': 30, 'W14x26': 26, 'W14x22': 22,
    'W12x336': 336, 'W12x305': 305, 'W12x279': 279, 'W12x252': 252,
    'W12x230': 230, 'W12x210': 210, 'W12x190': 190, 'W12x170': 170,
    'W12x152': 152, 'W12x136': 136, 'W12x120': 120, 'W12x106': 106,
    'W12x96': 96, 'W12x87': 87, 'W12x79': 79, 'W12x72': 72,
    'W12x65': 65, 'W12x58': 58, 'W12x53': 53, 'W12x50': 50,
    'W12x45': 45, 'W12x40': 40, 'W12x35': 35, 'W12x30': 30,
    'W12x26': 26, 'W12x22': 22, 'W12x19': 19, 'W12x16': 16,
    'W12x14': 14,
    'W10x112': 112, 'W10x100': 100, 'W10x88': 88, 'W10x77': 77,
    'W10x68': 68, 'W10x60': 60, 'W10x54': 54, 'W10x49': 49,
    'W10x45': 45, 'W10x39': 39, 'W10x33': 33, 'W10x30': 30,
    'W10x26': 26, 'W10x22': 22, 'W10x19': 19, 'W10x17': 17,
    'W10x15': 15, 'W10x12': 12,
    'W8x67': 67, 'W8x58': 58, 'W8x48': 48, 'W8x40': 40,
    'W8x35': 35, 'W8x31': 31, 'W8x28': 28, 'W8x24': 24,
    'W8x21': 21, 'W8x18': 18, 'W8x15': 15, 'W8x13': 13,
    'W8x10': 10,
    'W6x25': 25, 'W6x20': 20, 'W6x15': 15, 'W6x12': 12, 'W6x9': 9,
    'W5x19': 19, 'W5x16': 16,
    'W4x13': 13
};

/**
 * Indian Steel Section Weights (kg/m)
 */
export const INDIAN_STEEL_WEIGHTS = {
    'ISMB100': 11.5, 'ISMB125': 13.0, 'ISMB150': 14.9, 'ISMB175': 19.3,
    'ISMB200': 25.4, 'ISMB225': 31.2, 'ISMB250': 37.3, 'ISMB300': 44.2,
    'ISMB350': 52.4, 'ISMB400': 61.6, 'ISMB450': 72.4, 'ISMB500': 86.9,
    'ISMB550': 103.7, 'ISMB600': 122.6,
    'ISMC75': 6.8, 'ISMC100': 9.2, 'ISMC125': 12.7, 'ISMC150': 16.0,
    'ISMC175': 19.1, 'ISMC200': 22.1, 'ISMC225': 25.9, 'ISMC250': 30.4,
    'ISMC300': 36.3, 'ISMC350': 42.1, 'ISMC400': 49.4,
    'ISLB150': 14.2, 'ISLB175': 16.7, 'ISLB200': 19.8, 'ISLB225': 23.5,
    'ISLB250': 27.9, 'ISLB300': 33.0, 'ISLB325': 36.7, 'ISLB350': 40.9,
    'ISLB400': 45.7, 'ISLB450': 52.4, 'ISLB500': 58.8, 'ISLB550': 65.3,
    'ISLB600': 72.8,
    'ISWB150': 17.0, 'ISWB175': 21.3, 'ISWB200': 28.4, 'ISWB225': 33.9,
    'ISWB250': 40.9, 'ISWB300': 48.1, 'ISWB350': 56.9, 'ISWB400': 66.7,
    'ISWB450': 79.4, 'ISWB500': 95.2, 'ISWB550': 112.5, 'ISWB600': 133.7
};

/**
 * European Steel Section Weights (kg/m) - EN 10025 / BS EN
 */
export const EUROPEAN_STEEL_WEIGHTS = {
    // HEA (wide flange light)
    'HEA100': 20.4, 'HEA120': 25.3, 'HEA140': 31.4, 'HEA160': 38.8,
    'HEA180': 45.2, 'HEA200': 53.8, 'HEA220': 62.6, 'HEA240': 72.2,
    'HEA260': 82.2, 'HEA280': 92.4, 'HEA300': 106.0, 'HEA320': 117.0,
    'HEA340': 127.0, 'HEA360': 142.0, 'HEA400': 155.0, 'HEA450': 172.0,
    'HEA500': 202.0, 'HEA550': 226.0, 'HEA600': 254.0,
    // HEB (wide flange medium)
    'HEB100': 26.1, 'HEB120': 34.0, 'HEB140': 43.0, 'HEB160': 54.3,
    'HEB180': 65.3, 'HEB200': 78.1, 'HEB220': 91.0, 'HEB240': 106.0,
    'HEB260': 118.0, 'HEB280': 131.0, 'HEB300': 149.0, 'HEB320': 161.0,
    'HEB340': 171.0, 'HEB360': 181.0, 'HEB400': 197.0, 'HEB450': 218.0,
    'HEB500': 239.0, 'HEB550': 263.0, 'HEB600': 285.0,
    // IPE (I-beam European)
    'IPE80': 6.0, 'IPE100': 8.1, 'IPE120': 10.4, 'IPE140': 12.9,
    'IPE160': 15.8, 'IPE180': 18.8, 'IPE200': 22.4, 'IPE220': 26.2,
    'IPE240': 30.7, 'IPE270': 36.1, 'IPE300': 42.2, 'IPE330': 49.1,
    'IPE360': 57.1, 'IPE400': 66.3, 'IPE450': 77.6, 'IPE500': 90.7,
    'IPE550': 106.0, 'IPE600': 122.0,
    // UPN (European channels)
    'UPN80': 8.6, 'UPN100': 10.6, 'UPN120': 13.4, 'UPN140': 16.0,
    'UPN160': 18.8, 'UPN180': 22.0, 'UPN200': 25.3, 'UPN220': 29.4,
    'UPN240': 33.2, 'UPN260': 37.9, 'UPN280': 41.8, 'UPN300': 46.2
};

/**
 * British/Australian Steel Section Weights (kg/m)
 */
export const BRITISH_STEEL_WEIGHTS = {
    // UB (Universal Beams)
    'UB203X133X25': 25.1, 'UB254X146X31': 31.1, 'UB305X165X40': 40.3,
    'UB356X171X51': 51.0, 'UB406X178X60': 60.1, 'UB457X191X67': 67.1,
    'UB457X191X74': 74.3, 'UB457X191X82': 82.1, 'UB533X210X82': 82.2,
    'UB533X210X92': 92.1, 'UB533X210X101': 101.0, 'UB610X229X101': 101.2,
    'UB610X229X113': 113.0, 'UB610X229X125': 125.1, 'UB610X305X149': 149.2,
    'UB686X254X125': 125.2, 'UB686X254X140': 140.1, 'UB686X254X152': 152.4,
    'UB762X267X147': 146.9, 'UB762X267X173': 173.0, 'UB838X292X176': 176.0,
    'UB914X305X201': 200.9, 'UB914X305X224': 224.2, 'UB914X305X253': 253.4,
    // UC (Universal Columns)
    'UC152X152X23': 23.0, 'UC152X152X30': 30.0, 'UC152X152X37': 37.0,
    'UC203X203X46': 46.1, 'UC203X203X52': 52.0, 'UC203X203X60': 60.0,
    'UC203X203X71': 71.0, 'UC203X203X86': 86.1, 'UC254X254X73': 73.1,
    'UC254X254X89': 89.0, 'UC254X254X107': 107.1, 'UC254X254X132': 132.0,
    'UC305X305X97': 96.9, 'UC305X305X118': 117.9, 'UC305X305X137': 136.9,
    'UC305X305X158': 158.1, 'UC305X305X198': 198.1, 'UC305X305X240': 240.0,
    'UC356X368X129': 129.0, 'UC356X368X153': 153.0, 'UC356X368X177': 177.0,
    'UC356X406X235': 235.1, 'UC356X406X287': 287.1, 'UC356X406X340': 339.9,
    // PFC (Parallel Flange Channels)
    'PFC100X50': 10.2, 'PFC125X65': 14.8, 'PFC150X75': 17.9,
    'PFC150X90': 24.0, 'PFC180X75': 20.8, 'PFC200X75': 23.4,
    'PFC200X90': 29.7, 'PFC230X75': 25.7, 'PFC230X90': 32.2,
    'PFC260X75': 27.6, 'PFC260X90': 34.8, 'PFC300X90': 41.4,
    'PFC380X100': 54.0, 'PFC430X100': 64.4
};

/**
 * HSS (Hollow Structural Sections) weights - lb/ft
 */
export const HSS_WEIGHTS = {
    // Square HSS
    'HSS2X2X3/16': 4.32, 'HSS2X2X1/4': 5.41, 'HSS2.5X2.5X3/16': 5.59,
    'HSS2.5X2.5X1/4': 7.10, 'HSS3X3X3/16': 6.87, 'HSS3X3X1/4': 8.81,
    'HSS3X3X5/16': 10.58, 'HSS3X3X3/8': 12.17, 'HSS3.5X3.5X1/4': 10.51,
    'HSS3.5X3.5X5/16': 12.70, 'HSS3.5X3.5X3/8': 14.72,
    'HSS4X4X1/4': 12.21, 'HSS4X4X5/16': 14.83, 'HSS4X4X3/8': 17.27,
    'HSS4X4X1/2': 21.63, 'HSS5X5X1/4': 15.62, 'HSS5X5X5/16': 19.08,
    'HSS5X5X3/8': 22.37, 'HSS5X5X1/2': 28.43,
    'HSS6X6X1/4': 19.02, 'HSS6X6X5/16': 23.34, 'HSS6X6X3/8': 27.48,
    'HSS6X6X1/2': 35.24, 'HSS6X6X5/8': 42.05,
    'HSS7X7X1/4': 22.42, 'HSS7X7X5/16': 27.59, 'HSS7X7X3/8': 32.58,
    'HSS7X7X1/2': 42.05, 'HSS8X8X1/4': 25.82, 'HSS8X8X5/16': 31.84,
    'HSS8X8X3/8': 37.69, 'HSS8X8X1/2': 48.85, 'HSS8X8X5/8': 59.32,
    'HSS10X10X1/4': 32.63, 'HSS10X10X3/8': 47.90, 'HSS10X10X1/2': 62.46,
    'HSS10X10X5/8': 76.33, 'HSS12X12X3/8': 58.10, 'HSS12X12X1/2': 76.07,
    'HSS12X12X5/8': 93.34,
    // Rectangular HSS (common)
    'HSS6X4X1/4': 15.62, 'HSS6X4X3/8': 22.37, 'HSS6X4X1/2': 28.43,
    'HSS8X4X1/4': 19.02, 'HSS8X4X3/8': 27.48, 'HSS8X4X1/2': 35.24,
    'HSS8X6X1/4': 22.42, 'HSS8X6X3/8': 32.58, 'HSS8X6X1/2': 42.05,
    'HSS10X6X1/4': 25.82, 'HSS10X6X3/8': 37.69, 'HSS10X6X1/2': 48.85,
    'HSS12X6X1/4': 29.23, 'HSS12X6X3/8': 42.79, 'HSS12X6X1/2': 55.66,
    'HSS12X8X3/8': 47.90, 'HSS12X8X1/2': 62.46
};

/**
 * PEB Component Weights (kg/sqm of covered area)
 */
export const PEB_COMPONENT_WEIGHTS = {
    primary_frames_light: { weight: 2.5, unit: 'kg/sqm', desc: 'Light duty span <24m' },
    primary_frames_medium: { weight: 3.5, unit: 'kg/sqm', desc: 'Medium duty span 24-36m' },
    primary_frames_heavy: { weight: 5.0, unit: 'kg/sqm', desc: 'Heavy duty span >36m or crane' },
    purlins: { weight: 1.5, unit: 'kg/sqm', desc: 'Z/C purlins' },
    girts: { weight: 1.2, unit: 'kg/sqm', desc: 'Wall girts' },
    bracing: { weight: 0.5, unit: 'kg/sqm', desc: 'Vertical + horizontal bracing' },
    mezzanine: { weight: 25, unit: 'kg/sqm', desc: 'Mezzanine structure (of mezzanine area)' },
    crane_beam: { weight: 15, unit: 'kg/m', desc: 'Crane beam per meter span' }
};

/**
 * Unit Rates by Currency/Region (2025-2026 market rates)
 * All rates are INSTALLED costs (material + labor + equipment)
 */
export const UNIT_RATES = {
    USD: {
        structural_steel: {
            light: { rate: 3800, unit: 'ton', desc: 'Light W-shapes (<50 lb/ft), installed', range: [3000, 4500] },
            medium: { rate: 3000, unit: 'ton', desc: 'Medium W-shapes (50-100 lb/ft), installed', range: [2500, 3500] },
            heavy: { rate: 2600, unit: 'ton', desc: 'Heavy W-shapes (>100 lb/ft), installed', range: [2200, 3000] },
            hss: { rate: 4200, unit: 'ton', desc: 'HSS/Tube steel, installed', range: [3500, 5000] },
            misc_steel: { rate: 5000, unit: 'ton', desc: 'Misc steel (connections, plates, angles)', range: [4000, 6000] },
            joists: { rate: 2200, unit: 'ton', desc: 'Open web steel joists, installed', range: [1800, 2800] },
            deck: { rate: 5.50, unit: 'sf', desc: 'Metal deck (1.5" - 3"), installed', range: [4.00, 7.50] }
        },
        concrete: {
            '3000psi': { rate: 180, unit: 'cy', desc: '3000 PSI concrete, placed & finished', range: [150, 220] },
            '4000psi': { rate: 200, unit: 'cy', desc: '4000 PSI concrete, placed & finished', range: [170, 250] },
            '5000psi': { rate: 230, unit: 'cy', desc: '5000 PSI concrete, placed & finished', range: [190, 280] },
            slab_on_grade: { rate: 8.50, unit: 'sf', desc: '4-6" SOG with WWF, complete', range: [6.50, 12.00] },
            elevated_slab: { rate: 18.00, unit: 'sf', desc: 'Elevated concrete slab, formed & placed', range: [14.00, 24.00] },
            formwork_wall: { rate: 12.00, unit: 'sf', desc: 'Wall formwork (foundation/retaining)', range: [9.00, 16.00] },
            formwork_column: { rate: 15.00, unit: 'sf', desc: 'Column formwork', range: [11.00, 20.00] }
        },
        rebar: {
            grade60: { rate: 1500, unit: 'ton', desc: '#3-#11 Grade 60 rebar, placed', range: [1200, 2000] },
            grade75: { rate: 1800, unit: 'ton', desc: '#6-#11 Grade 75 rebar, placed', range: [1400, 2200] },
            wwf: { rate: 0.80, unit: 'sf', desc: 'Welded wire fabric, placed', range: [0.50, 1.20] }
        },
        masonry: {
            cmu_8: { rate: 14.00, unit: 'sf', desc: '8" CMU wall, grouted & reinforced', range: [11.00, 18.00] },
            cmu_12: { rate: 18.00, unit: 'sf', desc: '12" CMU wall, grouted & reinforced', range: [14.00, 23.00] },
            brick_veneer: { rate: 22.00, unit: 'sf', desc: 'Brick veneer on backup', range: [17.00, 28.00] }
        },
        roofing: {
            standing_seam: { rate: 14.00, unit: 'sf', desc: 'Standing seam metal roof', range: [10.00, 20.00] },
            tpo_single_ply: { rate: 9.00, unit: 'sf', desc: 'TPO single-ply roofing', range: [6.50, 12.00] },
            built_up: { rate: 11.00, unit: 'sf', desc: 'Built-up roofing (4-ply)', range: [8.00, 15.00] },
            insulation: { rate: 3.50, unit: 'sf', desc: 'Rigid insulation (R-20)', range: [2.50, 5.00] }
        },
        sitework: {
            excavation: { rate: 8.00, unit: 'cy', desc: 'Bulk excavation', range: [5.00, 14.00] },
            backfill: { rate: 12.00, unit: 'cy', desc: 'Structural backfill, compacted', range: [8.00, 18.00] },
            grading: { rate: 2.50, unit: 'sf', desc: 'Fine grading', range: [1.50, 4.00] },
            paving_asphalt: { rate: 5.50, unit: 'sf', desc: '3" asphalt paving', range: [4.00, 8.00] },
            paving_concrete: { rate: 9.00, unit: 'sf', desc: '6" concrete paving', range: [7.00, 13.00] }
        },
        mep: {
            hvac: { rate: 22.00, unit: 'sf', desc: 'HVAC (commercial, per building SF)', range: [15.00, 35.00] },
            plumbing: { rate: 12.00, unit: 'sf', desc: 'Plumbing (commercial, per building SF)', range: [8.00, 18.00] },
            electrical: { rate: 18.00, unit: 'sf', desc: 'Electrical (commercial, per building SF)', range: [12.00, 28.00] },
            fire_protection: { rate: 5.00, unit: 'sf', desc: 'Fire sprinkler system', range: [3.50, 7.50] }
        },
        finishes: {
            drywall: { rate: 4.50, unit: 'sf', desc: '5/8" drywall, taped & finished', range: [3.50, 6.00] },
            painting: { rate: 2.50, unit: 'sf', desc: 'Interior paint (2 coats)', range: [1.80, 3.50] },
            flooring_vct: { rate: 5.00, unit: 'sf', desc: 'VCT flooring', range: [3.50, 7.00] },
            flooring_carpet: { rate: 6.00, unit: 'sf', desc: 'Commercial carpet tile', range: [4.00, 9.00] },
            ceiling_act: { rate: 5.50, unit: 'sf', desc: 'Acoustic ceiling tile (2x4)', range: [4.00, 8.00] }
        }
    },
    INR: {
        structural_steel: {
            light: { rate: 75000, unit: 'MT', desc: 'Light sections, fabricated & erected', range: [60000, 90000] },
            medium: { rate: 68000, unit: 'MT', desc: 'Medium sections, fabricated & erected', range: [55000, 82000] },
            heavy: { rate: 62000, unit: 'MT', desc: 'Heavy sections, fabricated & erected', range: [50000, 75000] },
            hss: { rate: 82000, unit: 'MT', desc: 'Hollow sections, fabricated & erected', range: [65000, 95000] },
            misc_steel: { rate: 90000, unit: 'MT', desc: 'Misc steel (connections, plates)', range: [72000, 110000] },
            peb: { rate: 55000, unit: 'MT', desc: 'Pre-engineered building steel', range: [45000, 68000] }
        },
        concrete: {
            M25: { rate: 5500, unit: 'cum', desc: 'M25 concrete, placed & finished', range: [4500, 6800] },
            M30: { rate: 6000, unit: 'cum', desc: 'M30 concrete, placed & finished', range: [5000, 7500] },
            M40: { rate: 7000, unit: 'cum', desc: 'M40 concrete, placed & finished', range: [5800, 8500] },
            M50: { rate: 8500, unit: 'cum', desc: 'M50 concrete, placed & finished', range: [7000, 10000] }
        },
        rebar: {
            Fe500: { rate: 58000, unit: 'MT', desc: 'Fe500 TMT rebar, cut/bent & placed', range: [50000, 68000] },
            Fe500D: { rate: 62000, unit: 'MT', desc: 'Fe500D TMT rebar, cut/bent & placed', range: [54000, 72000] }
        },
        masonry: {
            brick_230: { rate: 850, unit: 'sqm', desc: '230mm brick wall with plaster', range: [650, 1100] },
            aac_200: { rate: 750, unit: 'sqm', desc: '200mm AAC block wall', range: [600, 950] }
        },
        roofing: {
            metal_sheet: { rate: 450, unit: 'sqm', desc: 'Color coated profile sheet', range: [350, 600] },
            sandwich_panel: { rate: 1200, unit: 'sqm', desc: 'Insulated sandwich panel (50mm PUF)', range: [900, 1600] },
            rcc_slab: { rate: 2800, unit: 'sqm', desc: 'RCC roof slab (150mm)', range: [2200, 3500] }
        },
        mep: {
            hvac: { rate: 1200, unit: 'sqm', desc: 'HVAC (commercial)', range: [800, 1800] },
            plumbing: { rate: 600, unit: 'sqm', desc: 'Plumbing', range: [400, 900] },
            electrical: { rate: 900, unit: 'sqm', desc: 'Electrical', range: [600, 1400] },
            fire_protection: { rate: 350, unit: 'sqm', desc: 'Fire protection', range: [250, 500] }
        }
    },
    AED: {
        structural_steel: {
            light: { rate: 12000, unit: 'MT', desc: 'Light sections, fabricated & erected', range: [9500, 14500] },
            medium: { rate: 10500, unit: 'MT', desc: 'Medium sections, fabricated & erected', range: [8500, 13000] },
            heavy: { rate: 9500, unit: 'MT', desc: 'Heavy sections, fabricated & erected', range: [8000, 11500] },
            hss: { rate: 13000, unit: 'MT', desc: 'Hollow sections', range: [10000, 16000] }
        },
        concrete: {
            C30: { rate: 750, unit: 'cum', desc: 'C30 concrete, placed & finished', range: [600, 950] },
            C40: { rate: 850, unit: 'cum', desc: 'C40 concrete, placed & finished', range: [700, 1050] },
            C50: { rate: 1000, unit: 'cum', desc: 'C50 concrete, placed & finished', range: [800, 1200] }
        },
        rebar: {
            grade460: { rate: 4500, unit: 'MT', desc: 'Grade 460 rebar, placed', range: [3500, 5800] },
            grade500: { rate: 5000, unit: 'MT', desc: 'Grade 500 rebar, placed', range: [4000, 6200] }
        }
    },
    GBP: {
        structural_steel: {
            light: { rate: 3200, unit: 'tonne', desc: 'Light sections, installed', range: [2600, 3800] },
            medium: { rate: 2800, unit: 'tonne', desc: 'Medium sections, installed', range: [2200, 3400] },
            heavy: { rate: 2500, unit: 'tonne', desc: 'Heavy sections, installed', range: [2000, 3000] },
            hss: { rate: 3500, unit: 'tonne', desc: 'Hollow sections, installed', range: [2800, 4200] }
        },
        concrete: {
            C30: { rate: 120, unit: 'cum', desc: 'C30 concrete, placed', range: [95, 150] },
            C40: { rate: 140, unit: 'cum', desc: 'C40 concrete, placed', range: [110, 175] },
            C50: { rate: 165, unit: 'cum', desc: 'C50 concrete, placed', range: [130, 200] }
        },
        rebar: {
            B500B: { rate: 1100, unit: 'tonne', desc: 'B500B rebar, placed', range: [850, 1400] }
        },
        roofing: {
            standing_seam: { rate: 55, unit: 'sqm', desc: 'Standing seam metal roof', range: [40, 75] },
            single_ply: { rate: 45, unit: 'sqm', desc: 'Single-ply membrane', range: [32, 60] }
        },
        mep: {
            hvac: { rate: 80, unit: 'sqm', desc: 'HVAC commercial', range: [55, 120] },
            plumbing: { rate: 45, unit: 'sqm', desc: 'Plumbing', range: [30, 65] },
            electrical: { rate: 65, unit: 'sqm', desc: 'Electrical', range: [45, 95] },
            fire_protection: { rate: 25, unit: 'sqm', desc: 'Fire protection', range: [18, 35] }
        }
    },
    EUR: {
        structural_steel: {
            light: { rate: 3600, unit: 'tonne', desc: 'Light sections (IPE/HEA), installed', range: [2900, 4300] },
            medium: { rate: 3200, unit: 'tonne', desc: 'Medium sections (HEB), installed', range: [2600, 3800] },
            heavy: { rate: 2800, unit: 'tonne', desc: 'Heavy sections, installed', range: [2200, 3400] },
            hss: { rate: 3800, unit: 'tonne', desc: 'Hollow sections, installed', range: [3000, 4600] }
        },
        concrete: {
            C30: { rate: 130, unit: 'cum', desc: 'C30 concrete, placed', range: [100, 165] },
            C40: { rate: 155, unit: 'cum', desc: 'C40 concrete, placed', range: [120, 190] },
            C50: { rate: 180, unit: 'cum', desc: 'C50 concrete, placed', range: [140, 220] }
        },
        rebar: {
            B500B: { rate: 1200, unit: 'tonne', desc: 'B500B rebar, placed', range: [950, 1500] }
        },
        roofing: {
            standing_seam: { rate: 60, unit: 'sqm', desc: 'Standing seam metal roof', range: [45, 80] },
            single_ply: { rate: 50, unit: 'sqm', desc: 'Single-ply membrane', range: [35, 65] }
        },
        mep: {
            hvac: { rate: 90, unit: 'sqm', desc: 'HVAC commercial', range: [60, 130] },
            plumbing: { rate: 50, unit: 'sqm', desc: 'Plumbing', range: [35, 70] },
            electrical: { rate: 70, unit: 'sqm', desc: 'Electrical', range: [50, 100] },
            fire_protection: { rate: 28, unit: 'sqm', desc: 'Fire protection', range: [20, 38] }
        }
    },
    SAR: {
        structural_steel: {
            light: { rate: 12500, unit: 'MT', desc: 'Light sections, installed', range: [10000, 15000] },
            medium: { rate: 11000, unit: 'MT', desc: 'Medium sections, installed', range: [9000, 13500] },
            heavy: { rate: 10000, unit: 'MT', desc: 'Heavy sections, installed', range: [8000, 12000] },
            hss: { rate: 13500, unit: 'MT', desc: 'Hollow sections, installed', range: [10500, 16500] }
        },
        concrete: {
            C30: { rate: 800, unit: 'cum', desc: 'C30 concrete, placed', range: [650, 1000] },
            C40: { rate: 950, unit: 'cum', desc: 'C40 concrete, placed', range: [750, 1150] }
        },
        rebar: {
            grade500: { rate: 5500, unit: 'MT', desc: 'Grade 500 rebar, placed', range: [4200, 6800] }
        },
        mep: {
            hvac: { rate: 250, unit: 'sqm', desc: 'HVAC commercial', range: [170, 370] },
            plumbing: { rate: 130, unit: 'sqm', desc: 'Plumbing', range: [85, 190] },
            electrical: { rate: 190, unit: 'sqm', desc: 'Electrical', range: [130, 280] },
            fire_protection: { rate: 70, unit: 'sqm', desc: 'Fire protection', range: [50, 100] }
        }
    },
    CAD: {
        structural_steel: {
            light: { rate: 4200, unit: 'tonne', desc: 'Light sections, installed', range: [3400, 5000] },
            medium: { rate: 3600, unit: 'tonne', desc: 'Medium sections, installed', range: [2900, 4300] },
            heavy: { rate: 3200, unit: 'tonne', desc: 'Heavy sections, installed', range: [2600, 3800] },
            hss: { rate: 4800, unit: 'tonne', desc: 'Hollow sections, installed', range: [3800, 5800] }
        },
        concrete: {
            '3000psi': { rate: 250, unit: 'cy', desc: '3000 PSI concrete, placed', range: [200, 310] },
            '4000psi': { rate: 280, unit: 'cy', desc: '4000 PSI concrete, placed', range: [225, 350] },
            '5000psi': { rate: 320, unit: 'cy', desc: '5000 PSI concrete, placed', range: [260, 400] }
        },
        rebar: {
            grade60: { rate: 1800, unit: 'ton', desc: 'Grade 60 rebar, placed', range: [1400, 2200] }
        },
        mep: {
            hvac: { rate: 30, unit: 'sf', desc: 'HVAC commercial', range: [20, 45] },
            plumbing: { rate: 16, unit: 'sf', desc: 'Plumbing', range: [10, 24] },
            electrical: { rate: 24, unit: 'sf', desc: 'Electrical', range: [16, 36] },
            fire_protection: { rate: 7, unit: 'sf', desc: 'Fire protection', range: [5, 10] }
        }
    },
    AUD: {
        structural_steel: {
            light: { rate: 5200, unit: 'tonne', desc: 'Light sections, installed', range: [4200, 6200] },
            medium: { rate: 4500, unit: 'tonne', desc: 'Medium sections, installed', range: [3600, 5400] },
            heavy: { rate: 4000, unit: 'tonne', desc: 'Heavy sections, installed', range: [3200, 4800] },
            hss: { rate: 5800, unit: 'tonne', desc: 'Hollow sections, installed', range: [4600, 7000] }
        },
        concrete: {
            '32mpa': { rate: 280, unit: 'cum', desc: '32 MPa concrete, placed', range: [220, 350] },
            '40mpa': { rate: 320, unit: 'cum', desc: '40 MPa concrete, placed', range: [250, 400] },
            '50mpa': { rate: 380, unit: 'cum', desc: '50 MPa concrete, placed', range: [300, 470] }
        },
        rebar: {
            D500N: { rate: 2200, unit: 'tonne', desc: 'D500N rebar, placed', range: [1700, 2800] }
        },
        mep: {
            hvac: { rate: 120, unit: 'sqm', desc: 'HVAC commercial', range: [80, 180] },
            plumbing: { rate: 65, unit: 'sqm', desc: 'Plumbing', range: [45, 95] },
            electrical: { rate: 95, unit: 'sqm', desc: 'Electrical', range: [65, 140] },
            fire_protection: { rate: 35, unit: 'sqm', desc: 'Fire protection', range: [25, 50] }
        }
    },
    SGD: {
        structural_steel: {
            light: { rate: 4800, unit: 'tonne', desc: 'Light sections, installed', range: [3800, 5800] },
            medium: { rate: 4200, unit: 'tonne', desc: 'Medium sections, installed', range: [3400, 5000] },
            heavy: { rate: 3800, unit: 'tonne', desc: 'Heavy sections, installed', range: [3000, 4600] }
        },
        concrete: {
            C40: { rate: 200, unit: 'cum', desc: 'Grade 40 concrete, placed', range: [160, 250] },
            C50: { rate: 240, unit: 'cum', desc: 'Grade 50 concrete, placed', range: [190, 300] }
        },
        rebar: {
            grade500: { rate: 1800, unit: 'tonne', desc: 'Grade 500 rebar, placed', range: [1400, 2200] }
        }
    }
};

/**
 * Location Factors - Multiplier applied to base rates
 * Based on RSMeans City Cost Index data
 */
export const LOCATION_FACTORS = {
    // US Cities
    'new york': { factor: 1.32, currency: 'USD', country: 'US' },
    'nyc': { factor: 1.32, currency: 'USD', country: 'US' },
    'manhattan': { factor: 1.38, currency: 'USD', country: 'US' },
    'los angeles': { factor: 1.12, currency: 'USD', country: 'US' },
    'san francisco': { factor: 1.28, currency: 'USD', country: 'US' },
    'chicago': { factor: 1.15, currency: 'USD', country: 'US' },
    'houston': { factor: 0.92, currency: 'USD', country: 'US' },
    'dallas': { factor: 0.90, currency: 'USD', country: 'US' },
    'phoenix': { factor: 0.93, currency: 'USD', country: 'US' },
    'philadelphia': { factor: 1.18, currency: 'USD', country: 'US' },
    'san antonio': { factor: 0.88, currency: 'USD', country: 'US' },
    'san diego': { factor: 1.10, currency: 'USD', country: 'US' },
    'austin': { factor: 0.91, currency: 'USD', country: 'US' },
    'jacksonville': { factor: 0.87, currency: 'USD', country: 'US' },
    'charlotte': { factor: 0.86, currency: 'USD', country: 'US' },
    'seattle': { factor: 1.15, currency: 'USD', country: 'US' },
    'denver': { factor: 1.02, currency: 'USD', country: 'US' },
    'boston': { factor: 1.24, currency: 'USD', country: 'US' },
    'nashville': { factor: 0.92, currency: 'USD', country: 'US' },
    'atlanta': { factor: 0.93, currency: 'USD', country: 'US' },
    'miami': { factor: 0.98, currency: 'USD', country: 'US' },
    'tampa': { factor: 0.91, currency: 'USD', country: 'US' },
    'portland': { factor: 1.08, currency: 'USD', country: 'US' },
    'las vegas': { factor: 1.05, currency: 'USD', country: 'US' },
    'detroit': { factor: 1.05, currency: 'USD', country: 'US' },
    'pittsburgh': { factor: 1.04, currency: 'USD', country: 'US' },
    'washington': { factor: 1.08, currency: 'USD', country: 'US' },
    'dc': { factor: 1.08, currency: 'USD', country: 'US' },
    'minneapolis': { factor: 1.10, currency: 'USD', country: 'US' },
    'cleveland': { factor: 1.02, currency: 'USD', country: 'US' },
    'st louis': { factor: 1.03, currency: 'USD', country: 'US' },
    'kansas city': { factor: 0.98, currency: 'USD', country: 'US' },
    'raleigh': { factor: 0.87, currency: 'USD', country: 'US' },
    'salt lake city': { factor: 0.95, currency: 'USD', country: 'US' },
    'honolulu': { factor: 1.35, currency: 'USD', country: 'US' },
    'anchorage': { factor: 1.28, currency: 'USD', country: 'US' },

    // Indian Cities
    'mumbai': { factor: 1.15, currency: 'INR', country: 'IN' },
    'delhi': { factor: 1.10, currency: 'INR', country: 'IN' },
    'new delhi': { factor: 1.10, currency: 'INR', country: 'IN' },
    'bangalore': { factor: 1.08, currency: 'INR', country: 'IN' },
    'bengaluru': { factor: 1.08, currency: 'INR', country: 'IN' },
    'hyderabad': { factor: 1.00, currency: 'INR', country: 'IN' },
    'chennai': { factor: 1.02, currency: 'INR', country: 'IN' },
    'pune': { factor: 1.05, currency: 'INR', country: 'IN' },
    'kolkata': { factor: 0.95, currency: 'INR', country: 'IN' },
    'ahmedabad': { factor: 0.95, currency: 'INR', country: 'IN' },
    'jaipur': { factor: 0.90, currency: 'INR', country: 'IN' },
    'lucknow': { factor: 0.88, currency: 'INR', country: 'IN' },
    'surat': { factor: 0.92, currency: 'INR', country: 'IN' },
    'chandigarh': { factor: 0.98, currency: 'INR', country: 'IN' },
    'gurgaon': { factor: 1.12, currency: 'INR', country: 'IN' },
    'gurugram': { factor: 1.12, currency: 'INR', country: 'IN' },
    'noida': { factor: 1.08, currency: 'INR', country: 'IN' },
    'indore': { factor: 0.85, currency: 'INR', country: 'IN' },
    'nagpur': { factor: 0.88, currency: 'INR', country: 'IN' },
    'bhopal': { factor: 0.85, currency: 'INR', country: 'IN' },
    'visakhapatnam': { factor: 0.90, currency: 'INR', country: 'IN' },
    'coimbatore': { factor: 0.92, currency: 'INR', country: 'IN' },
    'kochi': { factor: 0.98, currency: 'INR', country: 'IN' },
    'thiruvananthapuram': { factor: 0.95, currency: 'INR', country: 'IN' },

    // UAE/GCC Cities
    'dubai': { factor: 1.10, currency: 'AED', country: 'AE' },
    'abu dhabi': { factor: 1.15, currency: 'AED', country: 'AE' },
    'sharjah': { factor: 0.95, currency: 'AED', country: 'AE' },
    'ajman': { factor: 0.90, currency: 'AED', country: 'AE' },
    'riyadh': { factor: 1.05, currency: 'SAR', country: 'SA' },
    'jeddah': { factor: 1.00, currency: 'SAR', country: 'SA' },
    'dammam': { factor: 0.95, currency: 'SAR', country: 'SA' },
    'doha': { factor: 1.20, currency: 'QAR', country: 'QA' },
    'muscat': { factor: 1.00, currency: 'OMR', country: 'OM' },
    'kuwait city': { factor: 1.10, currency: 'KWD', country: 'KW' },
    'manama': { factor: 1.05, currency: 'BHD', country: 'BH' },

    // UK Cities
    'london': { factor: 1.25, currency: 'GBP', country: 'GB' },
    'manchester': { factor: 0.92, currency: 'GBP', country: 'GB' },
    'birmingham': { factor: 0.90, currency: 'GBP', country: 'GB' },
    'leeds': { factor: 0.88, currency: 'GBP', country: 'GB' },
    'edinburgh': { factor: 0.95, currency: 'GBP', country: 'GB' },
    'glasgow': { factor: 0.90, currency: 'GBP', country: 'GB' },
    'bristol': { factor: 0.95, currency: 'GBP', country: 'GB' },

    // European Cities
    'paris': { factor: 1.20, currency: 'EUR', country: 'FR' },
    'lyon': { factor: 1.00, currency: 'EUR', country: 'FR' },
    'marseille': { factor: 0.95, currency: 'EUR', country: 'FR' },
    'berlin': { factor: 1.05, currency: 'EUR', country: 'DE' },
    'munich': { factor: 1.15, currency: 'EUR', country: 'DE' },
    'frankfurt': { factor: 1.12, currency: 'EUR', country: 'DE' },
    'hamburg': { factor: 1.08, currency: 'EUR', country: 'DE' },
    'amsterdam': { factor: 1.15, currency: 'EUR', country: 'NL' },
    'rotterdam': { factor: 1.05, currency: 'EUR', country: 'NL' },
    'madrid': { factor: 0.95, currency: 'EUR', country: 'ES' },
    'barcelona': { factor: 1.00, currency: 'EUR', country: 'ES' },
    'rome': { factor: 1.05, currency: 'EUR', country: 'IT' },
    'milan': { factor: 1.12, currency: 'EUR', country: 'IT' },
    'dublin': { factor: 1.10, currency: 'EUR', country: 'IE' },
    'brussels': { factor: 1.08, currency: 'EUR', country: 'BE' },
    'vienna': { factor: 1.08, currency: 'EUR', country: 'AT' },
    'zurich': { factor: 1.40, currency: 'CHF', country: 'CH' },
    'stockholm': { factor: 1.15, currency: 'SEK', country: 'SE' },
    'copenhagen': { factor: 1.18, currency: 'DKK', country: 'DK' },
    'oslo': { factor: 1.25, currency: 'NOK', country: 'NO' },
    'helsinki': { factor: 1.12, currency: 'EUR', country: 'FI' },
    'warsaw': { factor: 0.75, currency: 'PLN', country: 'PL' },
    'prague': { factor: 0.80, currency: 'CZK', country: 'CZ' },
    'budapest': { factor: 0.70, currency: 'HUF', country: 'HU' },
    'lisbon': { factor: 0.85, currency: 'EUR', country: 'PT' },
    'athens': { factor: 0.80, currency: 'EUR', country: 'GR' },

    // Canada
    'toronto': { factor: 1.10, currency: 'CAD', country: 'CA' },
    'vancouver': { factor: 1.15, currency: 'CAD', country: 'CA' },
    'calgary': { factor: 1.05, currency: 'CAD', country: 'CA' },
    'edmonton': { factor: 1.02, currency: 'CAD', country: 'CA' },
    'montreal': { factor: 1.00, currency: 'CAD', country: 'CA' },
    'ottawa': { factor: 1.05, currency: 'CAD', country: 'CA' },
    'winnipeg': { factor: 0.95, currency: 'CAD', country: 'CA' },

    // Australia
    'sydney': { factor: 1.15, currency: 'AUD', country: 'AU' },
    'melbourne': { factor: 1.10, currency: 'AUD', country: 'AU' },
    'brisbane': { factor: 1.05, currency: 'AUD', country: 'AU' },
    'perth': { factor: 1.12, currency: 'AUD', country: 'AU' },
    'adelaide': { factor: 1.00, currency: 'AUD', country: 'AU' },
    'canberra': { factor: 1.08, currency: 'AUD', country: 'AU' },

    // Southeast Asia
    'singapore': { factor: 1.20, currency: 'SGD', country: 'SG' },
    'kuala lumpur': { factor: 0.70, currency: 'MYR', country: 'MY' },
    'bangkok': { factor: 0.65, currency: 'THB', country: 'TH' },
    'jakarta': { factor: 0.55, currency: 'IDR', country: 'ID' },
    'ho chi minh': { factor: 0.50, currency: 'VND', country: 'VN' },
    'manila': { factor: 0.55, currency: 'PHP', country: 'PH' },

    // East Asia
    'tokyo': { factor: 1.30, currency: 'JPY', country: 'JP' },
    'osaka': { factor: 1.15, currency: 'JPY', country: 'JP' },
    'seoul': { factor: 1.10, currency: 'KRW', country: 'KR' },
    'hong kong': { factor: 1.35, currency: 'HKD', country: 'HK' },
    'taipei': { factor: 0.90, currency: 'TWD', country: 'TW' },
    'shanghai': { factor: 0.85, currency: 'CNY', country: 'CN' },
    'beijing': { factor: 0.90, currency: 'CNY', country: 'CN' },
    'shenzhen': { factor: 0.85, currency: 'CNY', country: 'CN' },

    // Africa
    'johannesburg': { factor: 0.70, currency: 'ZAR', country: 'ZA' },
    'cape town': { factor: 0.72, currency: 'ZAR', country: 'ZA' },
    'lagos': { factor: 0.60, currency: 'NGN', country: 'NG' },
    'nairobi': { factor: 0.55, currency: 'KES', country: 'KE' },
    'cairo': { factor: 0.50, currency: 'EGP', country: 'EG' },
    'casablanca': { factor: 0.60, currency: 'MAD', country: 'MA' },

    // South America
    'sao paulo': { factor: 0.75, currency: 'BRL', country: 'BR' },
    'rio de janeiro': { factor: 0.78, currency: 'BRL', country: 'BR' },
    'mexico city': { factor: 0.65, currency: 'MXN', country: 'MX' },
    'bogota': { factor: 0.55, currency: 'COP', country: 'CO' },
    'santiago': { factor: 0.70, currency: 'CLP', country: 'CL' },
    'buenos aires': { factor: 0.60, currency: 'ARS', country: 'AR' },
    'lima': { factor: 0.55, currency: 'PEN', country: 'PE' },

    // New Zealand
    'auckland': { factor: 1.10, currency: 'NZD', country: 'NZ' },
    'wellington': { factor: 1.05, currency: 'NZD', country: 'NZ' }
};

/**
 * Benchmark Ranges by Project Type (cost per square foot / square meter)
 * Used for validation: if estimate falls outside range, flag as warning
 */
export const BENCHMARK_RANGES = {
    USD: {
        industrial: { low: 80, mid: 140, high: 200, unit: 'sqft', label: 'Industrial/Warehouse' },
        warehouse: { low: 60, mid: 110, high: 180, unit: 'sqft', label: 'Warehouse' },
        commercial: { low: 150, mid: 250, high: 350, unit: 'sqft', label: 'Commercial Office' },
        retail: { low: 100, mid: 175, high: 280, unit: 'sqft', label: 'Retail' },
        residential_single: { low: 120, mid: 185, high: 250, unit: 'sqft', label: 'Residential (Single Family)' },
        residential_multi: { low: 150, mid: 220, high: 300, unit: 'sqft', label: 'Residential (Multi-Family)' },
        healthcare: { low: 300, mid: 500, high: 700, unit: 'sqft', label: 'Healthcare' },
        educational: { low: 200, mid: 300, high: 400, unit: 'sqft', label: 'Educational' },
        hospitality: { low: 200, mid: 350, high: 500, unit: 'sqft', label: 'Hospitality' },
        peb: { low: 40, mid: 80, high: 120, unit: 'sqft', label: 'Pre-Engineered Building' },
        mixed_use: { low: 150, mid: 250, high: 380, unit: 'sqft', label: 'Mixed-Use' },
        data_center: { low: 400, mid: 700, high: 1200, unit: 'sqft', label: 'Data Center' },
        parking: { low: 40, mid: 65, high: 100, unit: 'sqft', label: 'Parking Structure' }
    },
    INR: {
        industrial: { low: 2000, mid: 3500, high: 5000, unit: 'sqft', label: 'Industrial/Warehouse' },
        warehouse: { low: 1500, mid: 2800, high: 4500, unit: 'sqft', label: 'Warehouse' },
        commercial: { low: 3000, mid: 5500, high: 8000, unit: 'sqft', label: 'Commercial Office' },
        retail: { low: 2500, mid: 4000, high: 6500, unit: 'sqft', label: 'Retail' },
        residential_single: { low: 1500, mid: 3000, high: 4500, unit: 'sqft', label: 'Residential' },
        residential_multi: { low: 2000, mid: 3500, high: 5500, unit: 'sqft', label: 'Residential (Multi-Story)' },
        healthcare: { low: 5000, mid: 10000, high: 15000, unit: 'sqft', label: 'Healthcare' },
        educational: { low: 3000, mid: 5000, high: 7000, unit: 'sqft', label: 'Educational' },
        hospitality: { low: 4000, mid: 7000, high: 10000, unit: 'sqft', label: 'Hospitality' },
        peb: { low: 1200, mid: 2000, high: 3000, unit: 'sqft', label: 'Pre-Engineered Building' },
        mixed_use: { low: 2500, mid: 4500, high: 7000, unit: 'sqft', label: 'Mixed-Use' }
    },
    AED: {
        industrial: { low: 300, mid: 550, high: 800, unit: 'sqft', label: 'Industrial/Warehouse' },
        warehouse: { low: 250, mid: 450, high: 700, unit: 'sqft', label: 'Warehouse' },
        commercial: { low: 600, mid: 1000, high: 1400, unit: 'sqft', label: 'Commercial Office' },
        retail: { low: 400, mid: 700, high: 1100, unit: 'sqft', label: 'Retail' },
        residential_single: { low: 400, mid: 700, high: 1000, unit: 'sqft', label: 'Residential (Villa)' },
        residential_multi: { low: 500, mid: 800, high: 1200, unit: 'sqft', label: 'Residential (Multi-Story)' },
        healthcare: { low: 1000, mid: 1800, high: 2500, unit: 'sqft', label: 'Healthcare' },
        hospitality: { low: 800, mid: 1400, high: 2000, unit: 'sqft', label: 'Hospitality' },
        peb: { low: 150, mid: 300, high: 450, unit: 'sqft', label: 'Pre-Engineered Building' }
    },
    GBP: {
        industrial: { low: 70, mid: 120, high: 180, unit: 'sqft', label: 'Industrial/Warehouse' },
        commercial: { low: 130, mid: 220, high: 320, unit: 'sqft', label: 'Commercial Office' },
        residential: { low: 100, mid: 180, high: 260, unit: 'sqft', label: 'Residential' },
        healthcare: { low: 250, mid: 420, high: 600, unit: 'sqft', label: 'Healthcare' },
        educational: { low: 170, mid: 260, high: 360, unit: 'sqft', label: 'Educational' },
        peb: { low: 35, mid: 65, high: 100, unit: 'sqft', label: 'Pre-Engineered Building' },
        hospitality: { low: 180, mid: 300, high: 450, unit: 'sqft', label: 'Hospitality' }
    },
    EUR: {
        industrial: { low: 80, mid: 135, high: 200, unit: 'sqft', label: 'Industrial/Warehouse' },
        commercial: { low: 140, mid: 240, high: 340, unit: 'sqft', label: 'Commercial Office' },
        residential: { low: 110, mid: 195, high: 280, unit: 'sqft', label: 'Residential' },
        healthcare: { low: 270, mid: 450, high: 650, unit: 'sqft', label: 'Healthcare' },
        educational: { low: 185, mid: 280, high: 390, unit: 'sqft', label: 'Educational' },
        hospitality: { low: 190, mid: 320, high: 480, unit: 'sqft', label: 'Hospitality' },
        peb: { low: 38, mid: 72, high: 110, unit: 'sqft', label: 'Pre-Engineered Building' }
    },
    SAR: {
        industrial: { low: 320, mid: 580, high: 850, unit: 'sqft', label: 'Industrial/Warehouse' },
        commercial: { low: 650, mid: 1100, high: 1500, unit: 'sqft', label: 'Commercial Office' },
        residential: { low: 450, mid: 750, high: 1100, unit: 'sqft', label: 'Residential' },
        healthcare: { low: 1100, mid: 1900, high: 2700, unit: 'sqft', label: 'Healthcare' },
        hospitality: { low: 750, mid: 1300, high: 1900, unit: 'sqft', label: 'Hospitality' },
        peb: { low: 160, mid: 320, high: 480, unit: 'sqft', label: 'Pre-Engineered Building' }
    },
    CAD: {
        industrial: { low: 100, mid: 175, high: 260, unit: 'sqft', label: 'Industrial/Warehouse' },
        commercial: { low: 190, mid: 320, high: 450, unit: 'sqft', label: 'Commercial Office' },
        residential: { low: 150, mid: 240, high: 320, unit: 'sqft', label: 'Residential' },
        healthcare: { low: 380, mid: 640, high: 900, unit: 'sqft', label: 'Healthcare' },
        peb: { low: 50, mid: 100, high: 155, unit: 'sqft', label: 'Pre-Engineered Building' }
    },
    AUD: {
        industrial: { low: 120, mid: 210, high: 310, unit: 'sqft', label: 'Industrial/Warehouse' },
        commercial: { low: 230, mid: 380, high: 530, unit: 'sqft', label: 'Commercial Office' },
        residential: { low: 180, mid: 290, high: 400, unit: 'sqft', label: 'Residential' },
        healthcare: { low: 450, mid: 760, high: 1060, unit: 'sqft', label: 'Healthcare' },
        peb: { low: 60, mid: 120, high: 180, unit: 'sqft', label: 'Pre-Engineered Building' }
    }
};

/**
 * Rebar weight per unit length by bar size
 */
export const REBAR_WEIGHTS = {
    // Imperial (lb/ft)
    '#3': 0.376, '#4': 0.668, '#5': 1.043, '#6': 1.502, '#7': 2.044,
    '#8': 2.670, '#9': 3.400, '#10': 4.303, '#11': 5.313, '#14': 7.650, '#18': 13.600,
    // Metric (kg/m)
    '8mm': 0.395, '10mm': 0.617, '12mm': 0.888, '16mm': 1.579,
    '20mm': 2.466, '25mm': 3.854, '28mm': 4.834, '32mm': 6.313, '36mm': 7.990, '40mm': 9.864
};

// ============ HELPER FUNCTIONS ============

/**
 * Get the weight per foot/meter for a steel section
 * @param {string} sectionName - e.g., "W24x68", "ISMB450"
 * @returns {{ weight: number, unit: string } | null}
 */
export function getSteelWeightPerFoot(sectionName) {
    if (!sectionName) return null;
    const normalized = sectionName.replace(/\s+/g, '').toUpperCase();

    // Try AISC W-shape table first
    if (STEEL_WEIGHT_TABLE[normalized]) {
        return { weight: STEEL_WEIGHT_TABLE[normalized], unit: 'lb/ft' };
    }

    // Try Indian sections
    if (INDIAN_STEEL_WEIGHTS[normalized]) {
        return { weight: INDIAN_STEEL_WEIGHTS[normalized], unit: 'kg/m' };
    }

    // Try European sections (HEA, HEB, IPE, UPN)
    if (EUROPEAN_STEEL_WEIGHTS[normalized]) {
        return { weight: EUROPEAN_STEEL_WEIGHTS[normalized], unit: 'kg/m' };
    }

    // Try British/Australian sections (UB, UC, PFC)
    if (BRITISH_STEEL_WEIGHTS[normalized]) {
        return { weight: BRITISH_STEEL_WEIGHTS[normalized], unit: 'kg/m' };
    }

    // Try HSS table
    if (HSS_WEIGHTS[normalized]) {
        return { weight: HSS_WEIGHTS[normalized], unit: 'lb/ft' };
    }

    // Fallback: parse the weight from the section name (W24x68 -> 68 lb/ft)
    const wMatch = normalized.match(/^W(\d+)X(\d+(?:\.\d+)?)$/);
    if (wMatch) {
        return { weight: parseFloat(wMatch[2]), unit: 'lb/ft' };
    }

    // British UB/UC format: UB533X210X82 -> 82 kg/m
    const ubMatch = normalized.match(/^(UB|UC|PFC)(\d+)X(\d+)X(\d+(?:\.\d+)?)$/);
    if (ubMatch) {
        return { weight: parseFloat(ubMatch[4]), unit: 'kg/m' };
    }

    // European IPE/HEA/HEB: try to parse from section designation
    const euroMatch = normalized.match(/^(IPE|HEA|HEB|UPN)(\d+)$/);
    if (euroMatch) {
        // Check if it's in the table (already handled above), otherwise estimate
        return null;
    }

    return null;
}

/**
 * Get location factor for a city/region
 * @param {string} location - City name, e.g., "Houston, TX"
 * @returns {{ factor: number, currency: string, country: string }}
 */
export function getLocationFactor(location) {
    if (!location) return { factor: 1.0, currency: 'USD', country: 'US' };

    const normalized = location.toLowerCase().trim();

    // Direct match
    for (const [city, data] of Object.entries(LOCATION_FACTORS)) {
        if (normalized.includes(city)) {
            return data;
        }
    }

    // Country-level defaults
    if (/\bindia\b/i.test(location) || /\bIN\b/.test(location)) {
        return { factor: 1.0, currency: 'INR', country: 'IN' };
    }
    if (/\buae\b|\bunited arab\b|\bemirati\b/i.test(location)) {
        return { factor: 1.0, currency: 'AED', country: 'AE' };
    }
    if (/\buk\b|\bunited kingdom\b|\bengland\b|\bscotland\b|\bwales\b/i.test(location)) {
        return { factor: 1.0, currency: 'GBP', country: 'GB' };
    }
    if (/\bcanada\b/i.test(location)) {
        return { factor: 1.0, currency: 'CAD', country: 'CA' };
    }
    if (/\baustralia\b/i.test(location)) {
        return { factor: 1.0, currency: 'AUD', country: 'AU' };
    }
    if (/\bsaudi\b|\bksa\b/i.test(location)) {
        return { factor: 1.0, currency: 'SAR', country: 'SA' };
    }
    if (/\bsingapore\b/i.test(location)) {
        return { factor: 1.0, currency: 'SGD', country: 'SG' };
    }
    if (/\bgermany\b|\bdeutschland\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'DE' };
    }
    if (/\bfrance\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'FR' };
    }
    if (/\bspain\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'ES' };
    }
    if (/\bitaly\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'IT' };
    }
    if (/\bnetherlands\b|\bholland\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'NL' };
    }
    if (/\bireland\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'IE' };
    }
    if (/\bbelgium\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'BE' };
    }
    if (/\baustria\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'AT' };
    }
    if (/\bportugal\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'PT' };
    }
    if (/\bgreece\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'GR' };
    }
    if (/\bfinland\b/i.test(location)) {
        return { factor: 1.0, currency: 'EUR', country: 'FI' };
    }
    if (/\bjapan\b/i.test(location)) {
        return { factor: 1.0, currency: 'JPY', country: 'JP' };
    }
    if (/\bchina\b/i.test(location)) {
        return { factor: 1.0, currency: 'CNY', country: 'CN' };
    }
    if (/\bkorea\b/i.test(location)) {
        return { factor: 1.0, currency: 'KRW', country: 'KR' };
    }
    if (/\bmalaysia\b/i.test(location)) {
        return { factor: 1.0, currency: 'MYR', country: 'MY' };
    }
    if (/\bthai\b/i.test(location)) {
        return { factor: 1.0, currency: 'THB', country: 'TH' };
    }
    if (/\bindonesia\b/i.test(location)) {
        return { factor: 1.0, currency: 'IDR', country: 'ID' };
    }
    if (/\bphilippine\b/i.test(location)) {
        return { factor: 1.0, currency: 'PHP', country: 'PH' };
    }
    if (/\bvietnam\b/i.test(location)) {
        return { factor: 1.0, currency: 'VND', country: 'VN' };
    }
    if (/\bsouth africa\b/i.test(location)) {
        return { factor: 1.0, currency: 'ZAR', country: 'ZA' };
    }
    if (/\bnigeria\b/i.test(location)) {
        return { factor: 1.0, currency: 'NGN', country: 'NG' };
    }
    if (/\bkenya\b/i.test(location)) {
        return { factor: 1.0, currency: 'KES', country: 'KE' };
    }
    if (/\begypt\b/i.test(location)) {
        return { factor: 1.0, currency: 'EGP', country: 'EG' };
    }
    if (/\bbrazil\b/i.test(location)) {
        return { factor: 1.0, currency: 'BRL', country: 'BR' };
    }
    if (/\bmexico\b/i.test(location)) {
        return { factor: 1.0, currency: 'MXN', country: 'MX' };
    }
    if (/\bcolombia\b/i.test(location)) {
        return { factor: 1.0, currency: 'COP', country: 'CO' };
    }
    if (/\bchile\b/i.test(location)) {
        return { factor: 1.0, currency: 'CLP', country: 'CL' };
    }
    if (/\bnew zealand\b/i.test(location)) {
        return { factor: 1.0, currency: 'NZD', country: 'NZ' };
    }
    if (/\bqatar\b/i.test(location)) {
        return { factor: 1.0, currency: 'QAR', country: 'QA' };
    }
    if (/\boman\b/i.test(location)) {
        return { factor: 1.0, currency: 'OMR', country: 'OM' };
    }
    if (/\bkuwait\b/i.test(location)) {
        return { factor: 1.0, currency: 'KWD', country: 'KW' };
    }
    if (/\bbahrain\b/i.test(location)) {
        return { factor: 1.0, currency: 'BHD', country: 'BH' };
    }

    // Default US
    return { factor: 1.0, currency: 'USD', country: 'US' };
}

/**
 * Get unit rate for a specific item category
 * @param {string} currency - e.g., "USD", "INR"
 * @param {string} category - e.g., "structural_steel"
 * @param {string} subtype - e.g., "medium"
 * @returns {{ rate: number, unit: string, range: number[] } | null}
 */
export function getUnitRate(currency, category, subtype) {
    const currencyRates = UNIT_RATES[currency];
    if (!currencyRates) return null;

    const categoryRates = currencyRates[category];
    if (!categoryRates) return null;

    const item = categoryRates[subtype];
    if (!item) return null;

    return { rate: item.rate, unit: item.unit, range: item.range, desc: item.desc };
}

/**
 * Get benchmark range for a project type
 * @param {string} currency - e.g., "USD"
 * @param {string} projectType - e.g., "industrial", "commercial"
 * @returns {{ low: number, mid: number, high: number, unit: string, label: string } | null}
 */
export function getBenchmarkRange(currency, projectType) {
    const currencyBenchmarks = BENCHMARK_RANGES[currency];
    if (!currencyBenchmarks) return null;

    // Normalize project type to match keys
    const normalized = projectType.toLowerCase()
        .replace(/[\s\-\/]+/g, '_')
        .replace(/pre_engineered|peb|pre_eng/i, 'peb')
        .replace(/office/, 'commercial')
        .replace(/warehouse/, 'warehouse')
        .replace(/factory|manufacturing/, 'industrial');

    // Try direct match
    if (currencyBenchmarks[normalized]) return currencyBenchmarks[normalized];

    // Try partial match
    for (const [key, data] of Object.entries(currencyBenchmarks)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return data;
        }
    }

    return null;
}

/**
 * Classify steel member weight as light/medium/heavy
 * @param {number} weightPerFoot - lb/ft
 * @returns {string} "light" | "medium" | "heavy"
 */
export function classifySteelWeight(weightPerFoot) {
    if (weightPerFoot < 50) return 'light';
    if (weightPerFoot <= 100) return 'medium';
    return 'heavy';
}

export default {
    STEEL_WEIGHT_TABLE,
    INDIAN_STEEL_WEIGHTS,
    EUROPEAN_STEEL_WEIGHTS,
    BRITISH_STEEL_WEIGHTS,
    HSS_WEIGHTS,
    PEB_COMPONENT_WEIGHTS,
    UNIT_RATES,
    LOCATION_FACTORS,
    BENCHMARK_RANGES,
    REBAR_WEIGHTS,
    getSteelWeightPerFoot,
    getLocationFactor,
    getUnitRate,
    getBenchmarkRange,
    classifySteelWeight
};
