// src/services/estimatePostProcessor.js
// Post-processes AI estimation output to add labor breakdown, manpower summary,
// crew breakdown, equipment costs, machinery schedule, rebar BBS, procurement
// quantities, and BOQ markups — ALL computed in code (saves ~40-50% output tokens).
//
// Covers ALL construction trades worldwide:
// Structural Steel (AISC/IS/BS/EN/AS), PEB, RCC, Precast, Timber,
// Foundations, Concrete, Rebar, Masonry, Roofing, Cladding/Envelope,
// Full MEP (HVAC, Plumbing, Electrical, Fire, Elevators, BMS),
// Architectural Finishes, Sitework, Specialties, Safety/Temporary

import { getSteelWeightPerFoot, getLocationFactor, REBAR_WEIGHTS, MACHINERY_RATES, PEB_COMPONENT_WEIGHTS } from '../data/costDatabase.js';

// ─── Industry-standard labor split ratios ───────────────────────────────────
// All-in installed rates split into material / labor / equipment by trade.
// Source: RSMeans, ENR, CPWD, CIOB, global contractor cost breakdowns.
const LABOR_SPLIT = {
    // Structural
    structural_steel:   { material: 0.45, labor: 0.40, equipment: 0.15 },
    peb_steel:          { material: 0.55, labor: 0.30, equipment: 0.15 },
    precast_concrete:   { material: 0.55, labor: 0.25, equipment: 0.20 },
    timber_framing:     { material: 0.50, labor: 0.45, equipment: 0.05 },
    // Concrete & Rebar
    concrete:           { material: 0.35, labor: 0.50, equipment: 0.15 },
    rebar:              { material: 0.50, labor: 0.45, equipment: 0.05 },
    formwork:           { material: 0.40, labor: 0.55, equipment: 0.05 },
    // Masonry
    masonry:            { material: 0.40, labor: 0.50, equipment: 0.10 },
    // Roofing & Cladding
    roofing:            { material: 0.50, labor: 0.40, equipment: 0.10 },
    cladding:           { material: 0.55, labor: 0.35, equipment: 0.10 },
    curtain_wall:       { material: 0.60, labor: 0.30, equipment: 0.10 },
    waterproofing:      { material: 0.45, labor: 0.50, equipment: 0.05 },
    insulation:         { material: 0.55, labor: 0.40, equipment: 0.05 },
    // MEP
    mep_plumbing:       { material: 0.55, labor: 0.40, equipment: 0.05 },
    mep_hvac:           { material: 0.50, labor: 0.40, equipment: 0.10 },
    mep_electrical:     { material: 0.55, labor: 0.40, equipment: 0.05 },
    mep_fire:           { material: 0.50, labor: 0.40, equipment: 0.10 },
    elevator:           { material: 0.65, labor: 0.25, equipment: 0.10 },
    bms:                { material: 0.60, labor: 0.35, equipment: 0.05 },
    // Architectural
    doors_windows:      { material: 0.60, labor: 0.35, equipment: 0.05 },
    flooring:           { material: 0.50, labor: 0.45, equipment: 0.05 },
    painting:           { material: 0.35, labor: 0.60, equipment: 0.05 },
    ceiling:            { material: 0.50, labor: 0.45, equipment: 0.05 },
    partitions:         { material: 0.50, labor: 0.45, equipment: 0.05 },
    architectural:      { material: 0.50, labor: 0.45, equipment: 0.05 },
    // Sitework
    sitework:           { material: 0.20, labor: 0.40, equipment: 0.40 },
    piling:             { material: 0.35, labor: 0.30, equipment: 0.35 },
    paving:             { material: 0.45, labor: 0.30, equipment: 0.25 },
    landscaping:        { material: 0.40, labor: 0.50, equipment: 0.10 },
    utilities:          { material: 0.50, labor: 0.35, equipment: 0.15 },
    drainage:           { material: 0.45, labor: 0.40, equipment: 0.15 },
    fencing:            { material: 0.55, labor: 0.40, equipment: 0.05 },
    // Specialties
    crane_system:       { material: 0.70, labor: 0.20, equipment: 0.10 },
    cold_storage:       { material: 0.55, labor: 0.35, equipment: 0.10 },
    clean_room:         { material: 0.55, labor: 0.35, equipment: 0.10 },
    dock_leveler:       { material: 0.65, labor: 0.25, equipment: 0.10 },
    conveyor:           { material: 0.60, labor: 0.30, equipment: 0.10 },
    // Safety / Temporary
    scaffolding:        { material: 0.30, labor: 0.55, equipment: 0.15 },
    temporary:          { material: 0.40, labor: 0.45, equipment: 0.15 },
    // General fallback
    general:            { material: 0.45, labor: 0.45, equipment: 0.10 },
    connections:        { material: 0.50, labor: 0.40, equipment: 0.10 },
    bolts_fasteners:    { material: 0.65, labor: 0.30, equipment: 0.05 },
};

// ─── Labor productivity rates (hours per unit of work) ──────────────────────
const LABOR_PRODUCTIVITY = {
    USD: {
        structural_steel_per_ton: 24, peb_steel_per_ton: 18,
        concrete_per_cy: 3.0, rebar_per_ton: 20, formwork_per_sf: 0.04,
        masonry_per_sf: 0.06, roofing_per_sf: 0.025, cladding_per_sf: 0.03,
        curtain_wall_per_sf: 0.08, waterproofing_per_sf: 0.015,
        mep_plumbing_per_sf: 0.015, mep_hvac_per_sf: 0.025,
        mep_electrical_per_sf: 0.02, mep_fire_per_sf: 0.008,
        elevator_per_ea: 200, bms_per_sf: 0.005,
        doors_per_ea: 4, windows_per_ea: 3,
        flooring_per_sf: 0.03, painting_per_sf: 0.015, ceiling_per_sf: 0.02,
        partitions_per_sf: 0.035,
        sitework_per_cy: 0.08, piling_per_lf: 0.15, paving_per_sf: 0.02,
        landscaping_per_sf: 0.01, drainage_per_lf: 0.08, fencing_per_lf: 0.05,
        scaffolding_per_sf: 0.01,
        architectural_per_sf: 0.03, general_per_unit: 2,
        connections_per_ea: 4, precast_per_ea: 2
    },
    INR: {
        structural_steel_per_ton: 40, peb_steel_per_ton: 30,
        concrete_per_cy: 5.0, rebar_per_ton: 32, formwork_per_sf: 0.06,
        masonry_per_sf: 0.08, roofing_per_sf: 0.04, cladding_per_sf: 0.045,
        curtain_wall_per_sf: 0.10, waterproofing_per_sf: 0.02,
        mep_plumbing_per_sf: 0.02, mep_hvac_per_sf: 0.035,
        mep_electrical_per_sf: 0.025, mep_fire_per_sf: 0.012,
        elevator_per_ea: 300, bms_per_sf: 0.008,
        doors_per_ea: 6, windows_per_ea: 4,
        flooring_per_sf: 0.05, painting_per_sf: 0.025, ceiling_per_sf: 0.03,
        partitions_per_sf: 0.05,
        sitework_per_cy: 0.12, piling_per_lf: 0.20, paving_per_sf: 0.03,
        landscaping_per_sf: 0.015, drainage_per_lf: 0.12, fencing_per_lf: 0.08,
        scaffolding_per_sf: 0.015,
        architectural_per_sf: 0.05, general_per_unit: 3,
        connections_per_ea: 6, precast_per_ea: 3
    },
    AED: {
        structural_steel_per_ton: 28, peb_steel_per_ton: 22,
        concrete_per_cy: 3.5, rebar_per_ton: 24, formwork_per_sf: 0.045,
        masonry_per_sf: 0.07, roofing_per_sf: 0.03, cladding_per_sf: 0.035,
        curtain_wall_per_sf: 0.09, waterproofing_per_sf: 0.018,
        mep_plumbing_per_sf: 0.018, mep_hvac_per_sf: 0.03,
        mep_electrical_per_sf: 0.022, mep_fire_per_sf: 0.01,
        elevator_per_ea: 250, bms_per_sf: 0.006,
        doors_per_ea: 5, windows_per_ea: 3.5,
        flooring_per_sf: 0.035, painting_per_sf: 0.02, ceiling_per_sf: 0.025,
        partitions_per_sf: 0.04,
        sitework_per_cy: 0.1, piling_per_lf: 0.18, paving_per_sf: 0.025,
        landscaping_per_sf: 0.012, drainage_per_lf: 0.1, fencing_per_lf: 0.06,
        scaffolding_per_sf: 0.012,
        architectural_per_sf: 0.035, general_per_unit: 2.5,
        connections_per_ea: 5, precast_per_ea: 2.5
    },
    GBP: {
        structural_steel_per_ton: 22, peb_steel_per_ton: 16,
        concrete_per_cy: 2.8, rebar_per_ton: 18, formwork_per_sf: 0.035,
        masonry_per_sf: 0.055, roofing_per_sf: 0.022, cladding_per_sf: 0.028,
        curtain_wall_per_sf: 0.075, waterproofing_per_sf: 0.013,
        mep_plumbing_per_sf: 0.014, mep_hvac_per_sf: 0.024,
        mep_electrical_per_sf: 0.018, mep_fire_per_sf: 0.008,
        elevator_per_ea: 180, bms_per_sf: 0.005,
        doors_per_ea: 3.5, windows_per_ea: 2.5,
        flooring_per_sf: 0.028, painting_per_sf: 0.013, ceiling_per_sf: 0.018,
        partitions_per_sf: 0.032,
        sitework_per_cy: 0.07, piling_per_lf: 0.13, paving_per_sf: 0.018,
        landscaping_per_sf: 0.009, drainage_per_lf: 0.07, fencing_per_lf: 0.04,
        scaffolding_per_sf: 0.009,
        architectural_per_sf: 0.028, general_per_unit: 1.8,
        connections_per_ea: 3.5, precast_per_ea: 1.8
    },
    EUR: {
        structural_steel_per_ton: 22, peb_steel_per_ton: 16,
        concrete_per_cy: 2.8, rebar_per_ton: 18, formwork_per_sf: 0.035,
        masonry_per_sf: 0.055, roofing_per_sf: 0.022, cladding_per_sf: 0.028,
        curtain_wall_per_sf: 0.075, waterproofing_per_sf: 0.013,
        mep_plumbing_per_sf: 0.014, mep_hvac_per_sf: 0.024,
        mep_electrical_per_sf: 0.018, mep_fire_per_sf: 0.008,
        elevator_per_ea: 180, bms_per_sf: 0.005,
        doors_per_ea: 3.5, windows_per_ea: 2.5,
        flooring_per_sf: 0.028, painting_per_sf: 0.013, ceiling_per_sf: 0.018,
        partitions_per_sf: 0.032,
        sitework_per_cy: 0.07, piling_per_lf: 0.13, paving_per_sf: 0.018,
        landscaping_per_sf: 0.009, drainage_per_lf: 0.07, fencing_per_lf: 0.04,
        scaffolding_per_sf: 0.009,
        architectural_per_sf: 0.028, general_per_unit: 1.8,
        connections_per_ea: 3.5, precast_per_ea: 1.8
    },
    SAR: {
        structural_steel_per_ton: 28, peb_steel_per_ton: 22,
        concrete_per_cy: 3.5, rebar_per_ton: 24, formwork_per_sf: 0.045,
        masonry_per_sf: 0.07, roofing_per_sf: 0.03, cladding_per_sf: 0.035,
        curtain_wall_per_sf: 0.09, waterproofing_per_sf: 0.018,
        mep_plumbing_per_sf: 0.018, mep_hvac_per_sf: 0.03,
        mep_electrical_per_sf: 0.022, mep_fire_per_sf: 0.01,
        elevator_per_ea: 250, bms_per_sf: 0.006,
        doors_per_ea: 5, windows_per_ea: 3.5,
        flooring_per_sf: 0.035, painting_per_sf: 0.02, ceiling_per_sf: 0.025,
        partitions_per_sf: 0.04,
        sitework_per_cy: 0.1, piling_per_lf: 0.18, paving_per_sf: 0.025,
        landscaping_per_sf: 0.012, drainage_per_lf: 0.1, fencing_per_lf: 0.06,
        scaffolding_per_sf: 0.012,
        architectural_per_sf: 0.035, general_per_unit: 2.5,
        connections_per_ea: 5, precast_per_ea: 2.5
    },
    CAD: {
        structural_steel_per_ton: 24, peb_steel_per_ton: 18,
        concrete_per_cy: 3.0, rebar_per_ton: 20, formwork_per_sf: 0.04,
        masonry_per_sf: 0.06, roofing_per_sf: 0.025, cladding_per_sf: 0.03,
        curtain_wall_per_sf: 0.08, waterproofing_per_sf: 0.015,
        mep_plumbing_per_sf: 0.015, mep_hvac_per_sf: 0.025,
        mep_electrical_per_sf: 0.02, mep_fire_per_sf: 0.008,
        elevator_per_ea: 200, bms_per_sf: 0.005,
        architectural_per_sf: 0.03, general_per_unit: 2,
        sitework_per_cy: 0.08, connections_per_ea: 4, precast_per_ea: 2,
        doors_per_ea: 4, windows_per_ea: 3, flooring_per_sf: 0.03,
        painting_per_sf: 0.015, ceiling_per_sf: 0.02, partitions_per_sf: 0.035,
        piling_per_lf: 0.15, paving_per_sf: 0.02, drainage_per_lf: 0.08,
        fencing_per_lf: 0.05, landscaping_per_sf: 0.01, scaffolding_per_sf: 0.01
    },
    AUD: {
        structural_steel_per_ton: 24, peb_steel_per_ton: 18,
        concrete_per_cy: 3.0, rebar_per_ton: 20, formwork_per_sf: 0.04,
        masonry_per_sf: 0.06, roofing_per_sf: 0.025, cladding_per_sf: 0.03,
        curtain_wall_per_sf: 0.08, waterproofing_per_sf: 0.015,
        mep_plumbing_per_sf: 0.015, mep_hvac_per_sf: 0.025,
        mep_electrical_per_sf: 0.02, mep_fire_per_sf: 0.008,
        elevator_per_ea: 200, bms_per_sf: 0.005,
        architectural_per_sf: 0.03, general_per_unit: 2,
        sitework_per_cy: 0.08, connections_per_ea: 4, precast_per_ea: 2,
        doors_per_ea: 4, windows_per_ea: 3, flooring_per_sf: 0.03,
        painting_per_sf: 0.015, ceiling_per_sf: 0.02, partitions_per_sf: 0.035,
        piling_per_lf: 0.15, paving_per_sf: 0.02, drainage_per_lf: 0.08,
        fencing_per_lf: 0.05, landscaping_per_sf: 0.01, scaffolding_per_sf: 0.01
    },
    SGD: {
        structural_steel_per_ton: 26, peb_steel_per_ton: 20,
        concrete_per_cy: 3.2, rebar_per_ton: 22, formwork_per_sf: 0.042,
        masonry_per_sf: 0.065, roofing_per_sf: 0.027, cladding_per_sf: 0.032,
        curtain_wall_per_sf: 0.085, waterproofing_per_sf: 0.016,
        mep_plumbing_per_sf: 0.016, mep_hvac_per_sf: 0.027,
        mep_electrical_per_sf: 0.021, mep_fire_per_sf: 0.009,
        elevator_per_ea: 220, bms_per_sf: 0.006,
        architectural_per_sf: 0.032, general_per_unit: 2.2,
        sitework_per_cy: 0.09, connections_per_ea: 4.5, precast_per_ea: 2.2,
        doors_per_ea: 4, windows_per_ea: 3, flooring_per_sf: 0.032,
        painting_per_sf: 0.016, ceiling_per_sf: 0.022, partitions_per_sf: 0.038,
        piling_per_lf: 0.16, paving_per_sf: 0.022, drainage_per_lf: 0.09,
        fencing_per_lf: 0.055, landscaping_per_sf: 0.011, scaffolding_per_sf: 0.011
    }
};

// ─── Hourly labor rates by currency and trade ───────────────────────────────
const HOURLY_LABOR_RATES = {
    USD: { structural: 65, peb: 55, concrete: 50, rebar: 55, formwork: 48, masonry: 48, roofing: 50, cladding: 52, curtain_wall: 60, mep: 60, plumbing: 58, hvac: 62, electrical: 60, fire: 55, elevator: 70, bms: 65, architectural: 45, flooring: 42, painting: 38, ceiling: 42, doors: 45, windows: 48, partitions: 42, sitework: 45, piling: 55, paving: 42, landscaping: 35, drainage: 45, fencing: 38, scaffolding: 40, general: 40 },
    INR: { structural: 350, peb: 280, concrete: 280, rebar: 300, formwork: 250, masonry: 220, roofing: 250, cladding: 280, curtain_wall: 350, mep: 400, plumbing: 320, hvac: 380, electrical: 350, fire: 300, elevator: 500, bms: 450, architectural: 250, flooring: 220, painting: 180, ceiling: 220, doors: 250, windows: 280, partitions: 220, sitework: 220, piling: 350, paving: 200, landscaping: 180, drainage: 220, fencing: 180, scaffolding: 200, general: 200 },
    AED: { structural: 45, peb: 38, concrete: 35, rebar: 40, formwork: 33, masonry: 32, roofing: 35, cladding: 38, curtain_wall: 48, mep: 50, plumbing: 42, hvac: 48, electrical: 45, fire: 40, elevator: 55, bms: 50, architectural: 35, flooring: 30, painting: 25, ceiling: 30, doors: 33, windows: 35, partitions: 30, sitework: 30, piling: 42, paving: 28, landscaping: 22, drainage: 30, fencing: 25, scaffolding: 28, general: 28 },
    GBP: { structural: 55, peb: 48, concrete: 42, rebar: 48, formwork: 40, masonry: 40, roofing: 42, cladding: 45, curtain_wall: 55, mep: 52, plumbing: 48, hvac: 52, electrical: 50, fire: 45, elevator: 60, bms: 55, architectural: 38, flooring: 35, painting: 32, ceiling: 35, doors: 38, windows: 40, partitions: 35, sitework: 38, piling: 48, paving: 35, landscaping: 30, drainage: 38, fencing: 32, scaffolding: 35, general: 35 },
    EUR: { structural: 52, peb: 45, concrete: 40, rebar: 45, formwork: 38, masonry: 38, roofing: 40, cladding: 42, curtain_wall: 52, mep: 50, plumbing: 45, hvac: 50, electrical: 48, fire: 42, elevator: 58, bms: 52, architectural: 36, flooring: 33, painting: 30, ceiling: 33, doors: 36, windows: 38, partitions: 33, sitework: 36, piling: 45, paving: 33, landscaping: 28, drainage: 36, fencing: 30, scaffolding: 33, general: 33 },
    SAR: { structural: 42, peb: 35, concrete: 32, rebar: 38, formwork: 30, masonry: 30, roofing: 32, cladding: 35, curtain_wall: 45, mep: 48, plumbing: 40, hvac: 45, electrical: 42, fire: 38, elevator: 52, bms: 48, architectural: 32, flooring: 28, painting: 22, ceiling: 28, doors: 30, windows: 32, partitions: 28, sitework: 28, piling: 40, paving: 25, landscaping: 20, drainage: 28, fencing: 22, scaffolding: 25, general: 25 },
    CAD: { structural: 72, peb: 60, concrete: 55, rebar: 60, formwork: 52, masonry: 52, roofing: 55, cladding: 58, curtain_wall: 65, mep: 65, plumbing: 62, hvac: 68, electrical: 65, fire: 60, elevator: 75, bms: 70, architectural: 50, flooring: 46, painting: 42, ceiling: 46, doors: 50, windows: 52, partitions: 46, sitework: 50, piling: 60, paving: 46, landscaping: 38, drainage: 50, fencing: 42, scaffolding: 44, general: 44 },
    AUD: { structural: 78, peb: 65, concrete: 60, rebar: 65, formwork: 56, masonry: 56, roofing: 60, cladding: 62, curtain_wall: 70, mep: 70, plumbing: 68, hvac: 72, electrical: 70, fire: 65, elevator: 80, bms: 75, architectural: 55, flooring: 50, painting: 45, ceiling: 50, doors: 55, windows: 58, partitions: 50, sitework: 55, piling: 65, paving: 50, landscaping: 42, drainage: 55, fencing: 45, scaffolding: 48, general: 48 },
    SGD: { structural: 48, peb: 40, concrete: 38, rebar: 42, formwork: 35, masonry: 35, roofing: 38, cladding: 40, curtain_wall: 50, mep: 52, plumbing: 45, hvac: 50, electrical: 48, fire: 42, elevator: 58, bms: 52, architectural: 36, flooring: 32, painting: 28, ceiling: 32, doors: 35, windows: 38, partitions: 32, sitework: 32, piling: 45, paving: 30, landscaping: 25, drainage: 32, fencing: 28, scaffolding: 30, general: 30 },
};

// ─── Standard crew compositions for ALL construction trades ─────────────────
const CREW_TEMPLATES = [
    // Structural
    { trade: 'Structural Steel', crew: 'Ironworkers + Crane Operator', baseHeadcount: 6, rateKey: 'structural' },
    { trade: 'PEB Erection', crew: 'PEB erectors + Crane Operator', baseHeadcount: 8, rateKey: 'peb' },
    { trade: 'Precast Erection', crew: 'Precast crew + Crane', baseHeadcount: 6, rateKey: 'structural' },
    // Concrete & Rebar
    { trade: 'Concrete', crew: 'Concrete crew + Finishers + Pump operator', baseHeadcount: 10, rateKey: 'concrete' },
    { trade: 'Rebar', crew: 'Rod busters / Bar benders + Helpers', baseHeadcount: 6, rateKey: 'rebar' },
    { trade: 'Formwork', crew: 'Carpenters + Helpers', baseHeadcount: 8, rateKey: 'formwork' },
    // Masonry
    { trade: 'Masonry', crew: 'Masons + Helpers', baseHeadcount: 6, rateKey: 'masonry' },
    // MEP — all sub-trades
    { trade: 'MEP - Plumbing', crew: 'Plumbers + Pipe fitters + Helpers', baseHeadcount: 4, rateKey: 'plumbing' },
    { trade: 'MEP - HVAC', crew: 'HVAC Technicians + Sheet metal workers', baseHeadcount: 4, rateKey: 'hvac' },
    { trade: 'MEP - Electrical', crew: 'Electricians + Cable pullers + Helpers', baseHeadcount: 5, rateKey: 'electrical' },
    { trade: 'MEP - Fire Protection', crew: 'Sprinkler fitters + Helpers', baseHeadcount: 3, rateKey: 'fire' },
    { trade: 'MEP - Elevator', crew: 'Elevator technicians', baseHeadcount: 2, rateKey: 'elevator' },
    { trade: 'MEP - BMS/Controls', crew: 'BMS/Controls technicians', baseHeadcount: 2, rateKey: 'bms' },
    // Roofing & Cladding
    { trade: 'Roofing', crew: 'Roofers + Sheet metal workers', baseHeadcount: 5, rateKey: 'roofing' },
    { trade: 'Cladding/Envelope', crew: 'Cladding installers + Crane', baseHeadcount: 4, rateKey: 'cladding' },
    // Architectural Finishes — all sub-trades
    { trade: 'Doors & Windows', crew: 'Carpenters + Glaziers', baseHeadcount: 4, rateKey: 'doors' },
    { trade: 'Flooring', crew: 'Tile layers + Helpers', baseHeadcount: 6, rateKey: 'flooring' },
    { trade: 'Painting', crew: 'Painters + Helpers', baseHeadcount: 6, rateKey: 'painting' },
    { trade: 'Ceiling', crew: 'Ceiling installers', baseHeadcount: 4, rateKey: 'ceiling' },
    { trade: 'Partitions/Drywall', crew: 'Drywall crew', baseHeadcount: 4, rateKey: 'partitions' },
    { trade: 'Waterproofing', crew: 'Waterproofing applicators', baseHeadcount: 3, rateKey: 'general' },
    // Sitework — all sub-trades
    { trade: 'Sitework - Earthwork', crew: 'Equipment operators + Laborers', baseHeadcount: 5, rateKey: 'sitework' },
    { trade: 'Sitework - Piling', crew: 'Piling crew + Rig operator', baseHeadcount: 5, rateKey: 'piling' },
    { trade: 'Sitework - Paving', crew: 'Paving crew + Equipment', baseHeadcount: 5, rateKey: 'paving' },
    { trade: 'Sitework - Drainage', crew: 'Pipe layers + Excavator', baseHeadcount: 4, rateKey: 'drainage' },
    { trade: 'Sitework - Utilities', crew: 'Utility crew + Equipment', baseHeadcount: 4, rateKey: 'sitework' },
    { trade: 'Landscaping', crew: 'Landscape crew', baseHeadcount: 4, rateKey: 'landscaping' },
    { trade: 'Fencing', crew: 'Fencing crew', baseHeadcount: 3, rateKey: 'fencing' },
    // Safety / Temporary
    { trade: 'Scaffolding', crew: 'Scaffolders', baseHeadcount: 4, rateKey: 'scaffolding' },
    { trade: 'Safety & Temporary', crew: 'Safety officers + Laborers', baseHeadcount: 3, rateKey: 'general' },
    // General
    { trade: 'General Labor', crew: 'Helpers + Cleanup', baseHeadcount: 4, rateKey: 'general' },
];

// ─── Default markup percentages ─────────────────────────────────────────────
const DEFAULT_MARKUPS = {
    generalConditionsPercent: 7,
    overheadPercent: 6,
    profitPercent: 8,
    contingencyPercent: 7,
    escalationPercent: 2,
};

// ─── Rebar estimation constants (lbs/CY or kg/cum by element type) ──────────
const REBAR_INTENSITY = {
    footing: { imperial: 120, metric: 80 },
    slab_on_grade: { imperial: 80, metric: 55 },
    elevated_slab: { imperial: 150, metric: 100 },
    grade_beam: { imperial: 150, metric: 100 },
    retaining_wall: { imperial: 180, metric: 120 },
    column: { imperial: 200, metric: 135 },
    pile_cap: { imperial: 160, metric: 107 },
    raft: { imperial: 130, metric: 87 },
    beam: { imperial: 170, metric: 113 },
};

/**
 * Main post-processor: enriches AI output with labor, equipment, manpower,
 * machinery schedule, procurement quantities, rebar summary, and markups.
 * Call AFTER getting AI result, BEFORE sending to frontend.
 */
export function enrichEstimateWithLaborAndMarkups(estimate, projectInfo = {}) {
    if (!estimate) return estimate;

    const currency = projectInfo.currency || detectCurrencyFromEstimate(estimate) || 'USD';
    const location = projectInfo.location || projectInfo.region || '';
    const locFactor = getLocationFactor(location).factor || 1.0;
    const productivity = LABOR_PRODUCTIVITY[currency] || LABOR_PRODUCTIVITY.USD;
    const baseLaborRates = HOURLY_LABOR_RATES[currency] || HOURLY_LABOR_RATES.USD;
    // Apply regional location factor to labor rates (e.g., NYC 1.32x, Houston 0.92x)
    const laborRates = {};
    for (const [key, rate] of Object.entries(baseLaborRates)) {
        laborRates[key] = Math.round(rate * locFactor * 100) / 100;
    }

    const ms = estimate.materialSchedule;
    if (!ms) return estimate;

    let totalLaborHours = 0, totalLaborCost = 0, totalMaterialCost = 0, totalEquipmentCost = 0;
    const crewHoursMap = {};
    let totalRebarTons = 0, totalConcreteCY = 0, totalSteelTons = 0;

    // ── 1. STRUCTURAL STEEL (all standards: AISC, IS, BS, EN, AS) ────────────
    const steelMembers = ms.steelMembers || [];
    const isPEB = detectPEB(estimate, steelMembers);
    const steelSplit = isPEB ? LABOR_SPLIT.peb_steel : LABOR_SPLIT.structural_steel;
    const steelProdKey = isPEB ? 'peb_steel_per_ton' : 'structural_steel_per_ton';
    const steelCrewKey = isPEB ? 'PEB Erection' : 'Structural Steel';

    for (const m of steelMembers) {
        const totalCostRaw = Number(m.totalCost) || 0;
        if (totalCostRaw <= 0) continue;

        // Calculate weight if not present — works for W, ISMB, HEA, HEB, IPE, UB, UC, HSS, CHS, SHS
        if (!m.weightPerFt && m.section) {
            const wt = getSteelWeightPerFoot(m.section);
            if (wt && wt.weight > 0) {
                m.weightPerFt = wt.weight;
                m.weightUnit = wt.unit;
            }
        }
        if (!m.totalWeightLbs && m.weightPerFt && m.count && m.lengthFt) {
            const isMetric = (m.weightUnit || '').includes('kg');
            if (isMetric) {
                const lengthM = m.lengthFt * 0.3048;
                m.totalWeightKg = m.count * m.weightPerFt * lengthM;
                m.totalWeightTons = m.totalWeightKg / 1000;
                m.totalWeightLbs = m.totalWeightKg * 2.205;
            } else {
                m.totalWeightLbs = m.count * m.weightPerFt * m.lengthFt;
                m.totalWeightTons = m.totalWeightLbs / 2000;
            }
        }
        if (!m.calculation && m.count && m.weightPerFt && m.lengthFt) {
            const unit = (m.weightUnit || 'lb/ft');
            if (unit.includes('kg')) {
                m.calculation = `${m.count} x ${m.weightPerFt} kg/m x ${(m.lengthFt * 0.3048).toFixed(1)}m = ${Number(m.totalWeightKg || 0).toLocaleString()} kg = ${Number(m.totalWeightTons || 0).toFixed(2)} MT`;
            } else {
                m.calculation = `${m.count} x ${m.weightPerFt} lb/ft x ${m.lengthFt} ft = ${Number(m.totalWeightLbs || 0).toLocaleString()} lbs = ${Number(m.totalWeightTons || 0).toFixed(2)} tons`;
            }
        }

        m.materialCost = Math.round(totalCostRaw * steelSplit.material);
        m.laborCost = Math.round(totalCostRaw * steelSplit.labor);
        m.equipmentCost = Math.round(totalCostRaw * steelSplit.equipment);
        m.totalCost = m.materialCost + m.laborCost + m.equipmentCost;

        const tons = Number(m.totalWeightTons) || 0;
        m.laborHours = Math.round(tons * (productivity[steelProdKey] || 24));
        m.laborRate = laborRates[isPEB ? 'peb' : 'structural'];

        // Procurement-ready: mark, section, grade, count, lengthFt, totalWeightTons
        m.procurementQty = `${m.count || 0} nos x ${m.section || 'TBD'} x ${m.lengthFt || 0} ft`;

        totalMaterialCost += m.materialCost; totalLaborCost += m.laborCost;
        totalEquipmentCost += m.equipmentCost; totalLaborHours += m.laborHours;
        totalSteelTons += tons;
        crewHoursMap[steelCrewKey] = (crewHoursMap[steelCrewKey] || 0) + m.laborHours;
    }

    // Steel summary
    if (steelMembers.length > 0) {
        const stlSum = ms.steelSummary || {};
        stlSum.totalMaterialCost = steelMembers.reduce((s, m) => s + (Number(m.materialCost) || 0), 0);
        stlSum.totalLaborCost = steelMembers.reduce((s, m) => s + (Number(m.laborCost) || 0), 0);
        stlSum.totalSteelCost = steelMembers.reduce((s, m) => s + (Number(m.totalCost) || 0), 0);
        stlSum.totalSteelTons = stlSum.totalSteelTons || steelMembers.reduce((s, m) => s + (Number(m.totalWeightTons) || 0), 0);
        stlSum.isPEB = isPEB;
        ms.steelSummary = stlSum;
    }

    // ── 2. CONCRETE (all grades: PSI, M-grade, C-grade, MPa, N-grade) ────────
    const concreteItems = ms.concreteItems || [];
    for (const c of concreteItems) {
        const totalCostRaw = Number(c.totalCost) || 0;
        if (totalCostRaw <= 0) continue;

        const split = LABOR_SPLIT.concrete;
        c.materialCost = Math.round(totalCostRaw * split.material);
        c.laborCost = Math.round(totalCostRaw * split.labor);
        c.equipmentCost = Math.round(totalCostRaw * split.equipment);
        c.totalCost = c.materialCost + c.laborCost + c.equipmentCost;

        const cy = Number(c.totalCY) || Number(c.totalCUM) || 0;
        c.laborHours = Math.round(cy * (productivity.concrete_per_cy || 3));
        c.laborRate = laborRates.concrete;

        // Rebar auto-calculation if not provided
        if (!c.rebarTotalLbs && cy > 0) {
            const elemType = classifyConcreteElement(c.type || c.element || '');
            const intensity = REBAR_INTENSITY[elemType] || REBAR_INTENSITY.footing;
            c.rebarLbsPerCY = c.rebarLbsPerCY || intensity.imperial;
            c.rebarTotalLbs = Math.round(cy * c.rebarLbsPerCY);
        }

        totalConcreteCY += cy;
        totalRebarTons += (c.rebarTotalLbs || 0) / 2000;
        totalMaterialCost += c.materialCost; totalLaborCost += c.laborCost;
        totalEquipmentCost += c.equipmentCost; totalLaborHours += c.laborHours;
        crewHoursMap['Concrete'] = (crewHoursMap['Concrete'] || 0) + c.laborHours;
    }

    if (concreteItems.length > 0) {
        const cncSum = ms.concreteSummary || {};
        cncSum.totalMaterialCost = concreteItems.reduce((s, c) => s + (Number(c.materialCost) || 0), 0);
        cncSum.totalLaborCost = concreteItems.reduce((s, c) => s + (Number(c.laborCost) || 0), 0);
        cncSum.totalConcreteCost = concreteItems.reduce((s, c) => s + (Number(c.totalCost) || 0), 0);
        cncSum.totalConcreteCY = cncSum.totalConcreteCY || totalConcreteCY;
        cncSum.totalRebarTons = cncSum.totalRebarTons || Math.round(totalRebarTons * 100) / 100;
        ms.concreteSummary = cncSum;
    }

    // ── 3. MEP ITEMS (Plumbing, HVAC, Electrical, Fire, Elevator, BMS) ───────
    enrichGenericItems(ms.mepItems, productivity, laborRates, crewHoursMap, (item) => {
        const cat = (item.category || item.item || '').toLowerCase();
        if (cat.includes('plumb') || cat.includes('pipe') || cat.includes('drain') || cat.includes('sanit'))
            return { split: LABOR_SPLIT.mep_plumbing, prodKey: 'mep_plumbing_per_sf', rateKey: 'plumbing', crewKey: 'MEP - Plumbing' };
        if (cat.includes('hvac') || cat.includes('mech') || cat.includes('air cond') || cat.includes('duct') || cat.includes('chiller') || cat.includes('ahu'))
            return { split: LABOR_SPLIT.mep_hvac, prodKey: 'mep_hvac_per_sf', rateKey: 'hvac', crewKey: 'MEP - HVAC' };
        if (cat.includes('electr') || cat.includes('power') || cat.includes('light') || cat.includes('panel') || cat.includes('cable') || cat.includes('switch') || cat.includes('wiring'))
            return { split: LABOR_SPLIT.mep_electrical, prodKey: 'mep_electrical_per_sf', rateKey: 'electrical', crewKey: 'MEP - Electrical' };
        if (cat.includes('fire') || cat.includes('sprinkler') || cat.includes('alarm') || cat.includes('smoke'))
            return { split: LABOR_SPLIT.mep_fire, prodKey: 'mep_fire_per_sf', rateKey: 'fire', crewKey: 'MEP - Fire Protection' };
        if (cat.includes('elevator') || cat.includes('lift') || cat.includes('escalat'))
            return { split: LABOR_SPLIT.elevator, prodKey: 'elevator_per_ea', rateKey: 'elevator', crewKey: 'MEP - Elevator' };
        if (cat.includes('bms') || cat.includes('control') || cat.includes('automat'))
            return { split: LABOR_SPLIT.bms, prodKey: 'bms_per_sf', rateKey: 'bms', crewKey: 'MEP - BMS/Controls' };
        return { split: LABOR_SPLIT.mep_plumbing, prodKey: 'mep_plumbing_per_sf', rateKey: 'mep', crewKey: 'MEP - Plumbing' };
    });
    const mepTotals = sumItems(ms.mepItems);
    totalMaterialCost += mepTotals.mat; totalLaborCost += mepTotals.lab;
    totalEquipmentCost += mepTotals.equip; totalLaborHours += mepTotals.hrs;

    // ── 4. ARCHITECTURAL ITEMS (Doors, Windows, Flooring, Ceiling, Paint, Partitions, Waterproofing) ─
    enrichGenericItems(ms.architecturalItems, productivity, laborRates, crewHoursMap, (item) => {
        const cat = (item.category || item.item || '').toLowerCase();
        if (cat.includes('door') || cat.includes('shutter') || cat.includes('rolling'))
            return { split: LABOR_SPLIT.doors_windows, prodKey: 'doors_per_ea', rateKey: 'doors', crewKey: 'Doors & Windows' };
        if (cat.includes('window') || cat.includes('glaz') || cat.includes('curtain'))
            return { split: cat.includes('curtain') ? LABOR_SPLIT.curtain_wall : LABOR_SPLIT.doors_windows, prodKey: 'windows_per_ea', rateKey: 'windows', crewKey: 'Doors & Windows' };
        if (cat.includes('floor') || cat.includes('tile') || cat.includes('epoxy') || cat.includes('carpet') || cat.includes('vinyl') || cat.includes('marble') || cat.includes('granite') || cat.includes('terrazzo'))
            return { split: LABOR_SPLIT.flooring, prodKey: 'flooring_per_sf', rateKey: 'flooring', crewKey: 'Flooring' };
        if (cat.includes('paint') || cat.includes('coat'))
            return { split: LABOR_SPLIT.painting, prodKey: 'painting_per_sf', rateKey: 'painting', crewKey: 'Painting' };
        if (cat.includes('ceil') || cat.includes('soffit'))
            return { split: LABOR_SPLIT.ceiling, prodKey: 'ceiling_per_sf', rateKey: 'ceiling', crewKey: 'Ceiling' };
        if (cat.includes('partition') || cat.includes('drywall') || cat.includes('gypsum') || cat.includes('plaster'))
            return { split: LABOR_SPLIT.partitions, prodKey: 'partitions_per_sf', rateKey: 'partitions', crewKey: 'Partitions/Drywall' };
        if (cat.includes('waterproof') || cat.includes('damp'))
            return { split: LABOR_SPLIT.waterproofing, prodKey: 'waterproofing_per_sf', rateKey: 'general', crewKey: 'Waterproofing' };
        if (cat.includes('insul'))
            return { split: LABOR_SPLIT.insulation, prodKey: 'architectural_per_sf', rateKey: 'general', crewKey: 'General Labor' };
        return { split: LABOR_SPLIT.architectural, prodKey: 'architectural_per_sf', rateKey: 'architectural', crewKey: 'General Labor' };
    });
    const archTotals = sumItems(ms.architecturalItems);
    totalMaterialCost += archTotals.mat; totalLaborCost += archTotals.lab;
    totalEquipmentCost += archTotals.equip; totalLaborHours += archTotals.hrs;

    if (ms.architecturalItems && ms.architecturalItems.length > 0) {
        ms.architecturalSummary = { totalMaterialCost: archTotals.mat, totalLaborCost: archTotals.lab, totalArchitecturalCost: archTotals.total };
    }

    // ── 5. ROOFING ITEMS ─────────────────────────────────────────────────────
    enrichSimpleItems(ms.roofingItems, LABOR_SPLIT.roofing, productivity.roofing_per_sf, laborRates.roofing, 'Roofing', crewHoursMap);
    const roofTotals = sumItems(ms.roofingItems);
    totalMaterialCost += roofTotals.mat; totalLaborCost += roofTotals.lab;
    totalEquipmentCost += roofTotals.equip; totalLaborHours += roofTotals.hrs;

    // ── 6. CLADDING/ENVELOPE ITEMS ───────────────────────────────────────────
    enrichSimpleItems(ms.claddingItems, LABOR_SPLIT.cladding, productivity.cladding_per_sf, laborRates.cladding, 'Cladding/Envelope', crewHoursMap);
    const cladTotals = sumItems(ms.claddingItems);
    totalMaterialCost += cladTotals.mat; totalLaborCost += cladTotals.lab;
    totalEquipmentCost += cladTotals.equip; totalLaborHours += cladTotals.hrs;

    // ── 7. SITEWORK ITEMS (Earthwork, Piling, Paving, Drainage, Utilities, Landscaping, Fencing) ─
    enrichGenericItems(ms.siteworkItems, productivity, laborRates, crewHoursMap, (item) => {
        const desc = (item.item || item.description || '').toLowerCase();
        if (desc.includes('pil') || desc.includes('bore') || desc.includes('caisson'))
            return { split: LABOR_SPLIT.piling, prodKey: 'piling_per_lf', rateKey: 'piling', crewKey: 'Sitework - Piling' };
        if (desc.includes('pav') || desc.includes('asphalt') || desc.includes('road') || desc.includes('kerb') || desc.includes('curb'))
            return { split: LABOR_SPLIT.paving, prodKey: 'paving_per_sf', rateKey: 'paving', crewKey: 'Sitework - Paving' };
        if (desc.includes('drain') || desc.includes('sewer') || desc.includes('manhole') || desc.includes('catch basin'))
            return { split: LABOR_SPLIT.drainage, prodKey: 'drainage_per_lf', rateKey: 'drainage', crewKey: 'Sitework - Drainage' };
        if (desc.includes('util') || desc.includes('water line') || desc.includes('gas line') || desc.includes('electric') && desc.includes('under'))
            return { split: LABOR_SPLIT.utilities, prodKey: 'drainage_per_lf', rateKey: 'sitework', crewKey: 'Sitework - Utilities' };
        if (desc.includes('landscape') || desc.includes('plant') || desc.includes('turf') || desc.includes('garden'))
            return { split: LABOR_SPLIT.landscaping, prodKey: 'landscaping_per_sf', rateKey: 'landscaping', crewKey: 'Landscaping' };
        if (desc.includes('fenc') || desc.includes('gate') || desc.includes('compound') || desc.includes('barbed'))
            return { split: LABOR_SPLIT.fencing, prodKey: 'fencing_per_lf', rateKey: 'fencing', crewKey: 'Fencing' };
        return { split: LABOR_SPLIT.sitework, prodKey: 'sitework_per_cy', rateKey: 'sitework', crewKey: 'Sitework - Earthwork' };
    });
    const siteTotals = sumItems(ms.siteworkItems);
    totalMaterialCost += siteTotals.mat; totalLaborCost += siteTotals.lab;
    totalEquipmentCost += siteTotals.equip; totalLaborHours += siteTotals.hrs;

    // ── 8. OTHER MATERIALS (Connections, Bolts, Deck, Misc) ──────────────────
    enrichGenericItems(ms.otherMaterials, productivity, laborRates, crewHoursMap, (item) => {
        const desc = (item.material || item.item || '').toLowerCase();
        if (desc.includes('connect') || desc.includes('base plate') || desc.includes('splice') || desc.includes('gusset'))
            return { split: LABOR_SPLIT.connections, prodKey: 'connections_per_ea', rateKey: 'structural', crewKey: 'Structural Steel' };
        if (desc.includes('bolt') || desc.includes('fastener') || desc.includes('nut') || desc.includes('washer') || desc.includes('anchor') || desc.includes('screw'))
            return { split: LABOR_SPLIT.bolts_fasteners, prodKey: 'general_per_unit', rateKey: 'general', crewKey: 'General Labor' };
        if (desc.includes('deck') || desc.includes('metal deck'))
            return { split: LABOR_SPLIT.structural_steel, prodKey: 'general_per_unit', rateKey: 'structural', crewKey: 'Structural Steel' };
        if (desc.includes('precast'))
            return { split: LABOR_SPLIT.precast_concrete, prodKey: 'precast_per_ea', rateKey: 'structural', crewKey: 'Precast Erection' };
        if (desc.includes('scaffold'))
            return { split: LABOR_SPLIT.scaffolding, prodKey: 'scaffolding_per_sf', rateKey: 'scaffolding', crewKey: 'Scaffolding' };
        if (desc.includes('temporary') || desc.includes('safety') || desc.includes('barricad'))
            return { split: LABOR_SPLIT.temporary, prodKey: 'general_per_unit', rateKey: 'general', crewKey: 'Safety & Temporary' };
        if (desc.includes('crane') || desc.includes('hoist'))
            return { split: LABOR_SPLIT.crane_system, prodKey: 'general_per_unit', rateKey: 'structural', crewKey: 'Structural Steel' };
        return { split: LABOR_SPLIT.general, prodKey: 'general_per_unit', rateKey: 'general', crewKey: 'General Labor' };
    });
    const otherTotals = sumItems(ms.otherMaterials);
    totalMaterialCost += otherTotals.mat; totalLaborCost += otherTotals.lab;
    totalEquipmentCost += otherTotals.equip; totalLaborHours += otherTotals.hrs;

    // ── 9. PEB-SPECIFIC ITEMS (if present) ───────────────────────────────────
    enrichSimpleItems(ms.pebItems, LABOR_SPLIT.peb_steel, productivity.peb_steel_per_ton || 18, laborRates.peb || laborRates.structural, 'PEB Erection', crewHoursMap);
    const pebTotals = sumItems(ms.pebItems);
    totalMaterialCost += pebTotals.mat; totalLaborCost += pebTotals.lab;
    totalEquipmentCost += pebTotals.equip; totalLaborHours += pebTotals.hrs;

    // ── 10. SAFETY / TEMPORARY WORKS ─────────────────────────────────────────
    enrichSimpleItems(ms.safetyItems, LABOR_SPLIT.temporary, productivity.scaffolding_per_sf || 0.01, laborRates.scaffolding || laborRates.general, 'Scaffolding', crewHoursMap);
    const safetyTotals = sumItems(ms.safetyItems);
    totalMaterialCost += safetyTotals.mat; totalLaborCost += safetyTotals.lab;
    totalEquipmentCost += safetyTotals.equip; totalLaborHours += safetyTotals.hrs;

    // ── 11. BUILD MANPOWER SUMMARY ───────────────────────────────────────────
    const crewBreakdown = [];
    const hoursPerWeekPerPerson = 40;
    for (const tmpl of CREW_TEMPLATES) {
        const hours = crewHoursMap[tmpl.trade] || 0;
        if (hours <= 0) continue;
        const headcount = tmpl.baseHeadcount;
        const durationWeeks = Math.max(1, Math.ceil(hours / (headcount * hoursPerWeekPerPerson)));
        const hourlyRate = laborRates[tmpl.rateKey] || laborRates.general;
        crewBreakdown.push({
            trade: tmpl.trade, crew: tmpl.crew, headcount, durationWeeks,
            laborHours: Math.round(hours), laborCost: Math.round(hours * hourlyRate)
        });
    }

    const maxWeeks = crewBreakdown.reduce((mx, c) => Math.max(mx, c.durationWeeks), 0);
    const durationStr = maxWeeks > 0 ? `${maxWeeks}-${Math.ceil(maxWeeks * 1.3)} weeks` : 'TBD';
    const peakManpower = crewBreakdown.reduce((sum, c) => sum + c.headcount, 0);

    ms.manpowerSummary = {
        totalLaborHours: Math.round(totalLaborHours),
        totalLaborCost: Math.round(totalLaborCost),
        totalMaterialCost: Math.round(totalMaterialCost),
        totalEquipmentCost: Math.round(totalEquipmentCost),
        peakManpower,
        crewBreakdown,
        estimatedProjectDuration: durationStr
    };

    // ── 12. BUILD MACHINERY SCHEDULE ─────────────────────────────────────────
    ms.machinerySchedule = buildMachinerySchedule(estimate, currency, maxWeeks, totalSteelTons, totalConcreteCY, isPEB);

    // ── 13. BUILD BOQ MARKUPS ────────────────────────────────────────────────
    const aiMarkups = ms.boqMarkups || {};
    const subtotalDirectCost = Math.round(totalMaterialCost + totalLaborCost + totalEquipmentCost);
    const gcPct = Number(aiMarkups.generalConditionsPercent) || DEFAULT_MARKUPS.generalConditionsPercent;
    const ohPct = Number(aiMarkups.overheadPercent) || DEFAULT_MARKUPS.overheadPercent;
    const prPct = Number(aiMarkups.profitPercent) || DEFAULT_MARKUPS.profitPercent;
    const ctPct = Number(aiMarkups.contingencyPercent) || DEFAULT_MARKUPS.contingencyPercent;
    const esPct = Number(aiMarkups.escalationPercent) || DEFAULT_MARKUPS.escalationPercent;
    const gc = Math.round(subtotalDirectCost * gcPct / 100);
    const oh = Math.round(subtotalDirectCost * ohPct / 100);
    const pr = Math.round(subtotalDirectCost * prPct / 100);
    const ct = Math.round(subtotalDirectCost * ctPct / 100);
    const es = Math.round(subtotalDirectCost * esPct / 100);
    const totalMarkupsAmt = gc + oh + pr + ct + es;

    ms.boqMarkups = {
        subtotalDirectCost,
        generalConditionsPercent: gcPct, generalConditions: gc,
        overheadPercent: ohPct, overhead: oh,
        profitPercent: prPct, profit: pr,
        contingencyPercent: ctPct, contingency: ct,
        escalationPercent: esPct, escalation: es,
        totalMarkups: totalMarkupsAmt,
        grandTotalWithMarkups: subtotalDirectCost + totalMarkupsAmt
    };

    // ── 14. GRAND TOTALS & PROCUREMENT SUMMARY ──────────────────────────────
    ms.grandTotalMaterialCost = Math.round(totalMaterialCost + totalLaborCost + totalEquipmentCost);

    // Build weight summary
    if (!ms.totalMaterialWeight) {
        const parts = [];
        if (totalSteelTons > 0) parts.push(`Steel: ${totalSteelTons.toFixed(1)} tons`);
        if (totalConcreteCY > 0) parts.push(`Concrete: ${totalConcreteCY.toFixed(0)} CY`);
        if (totalRebarTons > 0) parts.push(`Rebar: ${totalRebarTons.toFixed(1)} tons`);
        if (parts.length > 0) ms.totalMaterialWeight = parts.join(', ');
    }

    // Procurement summary — key quantities someone needs to buy materials
    ms.procurementSummary = {
        steelTonnage: Math.round(totalSteelTons * 100) / 100,
        concreteCY: Math.round(totalConcreteCY * 10) / 10,
        rebarTonnage: Math.round(totalRebarTons * 100) / 100,
        isPEB,
        currency,
        steelMembers: (ms.steelMembers || []).map(m => ({
            mark: m.mark || '', section: m.section || '', grade: m.grade || '',
            count: m.count || 0, lengthFt: m.lengthFt || 0, weightTons: m.totalWeightTons || 0,
            procurementQty: m.procurementQty || 0
        })),
        concreteByGrade: groupConcreteByGrade(ms.concreteItems || []),
        rebarByElement: (ms.concreteItems || []).filter(c => c.rebarTotalLbs > 0).map(c => ({
            element: c.element, rebarLbs: c.rebarTotalLbs, rebarTons: Math.round(c.rebarTotalLbs / 2000 * 100) / 100
        }))
    };

    console.log(`[POST-PROCESSOR] Enriched: Material=${totalMaterialCost}, Labor=${totalLaborCost} (${Math.round(totalLaborHours)}hrs), Equipment=${totalEquipmentCost}, Steel=${totalSteelTons.toFixed(1)}T, Concrete=${totalConcreteCY.toFixed(0)}CY, Rebar=${totalRebarTons.toFixed(1)}T, Crews=${crewBreakdown.length}, Markups=${totalMarkupsAmt}, Grand=${ms.boqMarkups.grandTotalWithMarkups}`);
    return estimate;
}

// ─── Machinery schedule builder ─────────────────────────────────────────────
function buildMachinerySchedule(estimate, currency, projectWeeks, steelTons, concreteCY, isPEB) {
    const rates = (typeof MACHINERY_RATES !== 'undefined' && MACHINERY_RATES[currency]) || null;
    if (!rates) return [];

    const schedule = [];
    const workingDays = Math.max(1, projectWeeks * 5);

    // Crane — required for steel erection
    if (steelTons > 0) {
        const craneDays = Math.max(5, Math.ceil(steelTons / 3)); // ~3 tons/day
        const craneType = steelTons > 50 ? 'mobile_crane_50t' : 'mobile_crane_25t';
        const craneRate = rates[craneType] || rates.mobile_crane_25t || rates.mobile_crane_20t;
        if (craneRate) {
            schedule.push({ equipment: craneRate.desc, quantity: 1, durationDays: craneDays, dailyRate: craneRate.rate, totalCost: craneDays * craneRate.rate });
        }
    }

    // Concrete pump & transit mixer
    if (concreteCY > 0) {
        const pumpDays = Math.max(3, Math.ceil(concreteCY / 30));
        const pumpRate = rates.concrete_pump;
        const mixerRate = rates.transit_mixer;
        if (pumpRate) schedule.push({ equipment: pumpRate.desc, quantity: 1, durationDays: pumpDays, dailyRate: pumpRate.rate, totalCost: pumpDays * pumpRate.rate });
        if (mixerRate) schedule.push({ equipment: mixerRate.desc, quantity: 2, durationDays: pumpDays, dailyRate: mixerRate.rate, totalCost: 2 * pumpDays * mixerRate.rate });
    }

    // Excavator — always needed for foundations
    const excRate = rates.excavator_20t || rates.excavator_pc200;
    if (excRate) {
        const excDays = Math.max(5, Math.ceil(workingDays * 0.15));
        schedule.push({ equipment: excRate.desc, quantity: 1, durationDays: excDays, dailyRate: excRate.rate, totalCost: excDays * excRate.rate });
    }

    // JCB / backhoe
    const jcbRate = rates.backhoe_loader || rates.jcb;
    if (jcbRate) {
        const jcbDays = Math.max(10, Math.ceil(workingDays * 0.3));
        schedule.push({ equipment: jcbRate.desc, quantity: 1, durationDays: jcbDays, dailyRate: jcbRate.rate, totalCost: jcbDays * jcbRate.rate });
    }

    // Boom lift for MEP/finishing
    const boomRate = rates.boom_lift;
    if (boomRate) {
        const boomDays = Math.max(5, Math.ceil(workingDays * 0.2));
        schedule.push({ equipment: boomRate.desc, quantity: 1, durationDays: boomDays, dailyRate: boomRate.rate, totalCost: boomDays * boomRate.rate });
    }

    // Welding machine
    const weldRate = rates.welding_machine;
    if (weldRate && steelTons > 0) {
        const weldDays = Math.max(10, Math.ceil(steelTons * 2));
        schedule.push({ equipment: weldRate.desc, quantity: 2, durationDays: weldDays, dailyRate: weldRate.rate, totalCost: 2 * weldDays * weldRate.rate });
    }

    // Generator
    const genRate = rates.generator;
    if (genRate) {
        schedule.push({ equipment: genRate.desc, quantity: 1, durationDays: workingDays, dailyRate: genRate.rate, totalCost: workingDays * genRate.rate });
    }

    // Compactor for sitework
    const compRate = rates.compactor;
    if (compRate) {
        const compDays = Math.max(5, Math.ceil(workingDays * 0.1));
        schedule.push({ equipment: compRate.desc, quantity: 1, durationDays: compDays, dailyRate: compRate.rate, totalCost: compDays * compRate.rate });
    }

    // Bar bending/cutting for rebar (Indian market)
    if (rates.bar_bending && concreteCY > 0) {
        const bbDays = Math.max(5, Math.ceil(workingDays * 0.2));
        schedule.push({ equipment: rates.bar_bending.desc, quantity: 1, durationDays: bbDays, dailyRate: rates.bar_bending.rate, totalCost: bbDays * rates.bar_bending.rate });
    }
    if (rates.bar_cutting && concreteCY > 0) {
        const bcDays = Math.max(5, Math.ceil(workingDays * 0.2));
        schedule.push({ equipment: rates.bar_cutting.desc, quantity: 1, durationDays: bcDays, dailyRate: rates.bar_cutting.rate, totalCost: bcDays * rates.bar_cutting.rate });
    }

    // Forklift
    const forkRate = rates.forklift;
    if (forkRate) {
        const forkDays = Math.max(10, Math.ceil(workingDays * 0.4));
        schedule.push({ equipment: forkRate.desc, quantity: 1, durationDays: forkDays, dailyRate: forkRate.rate, totalCost: forkDays * forkRate.rate });
    }

    // Total machinery cost
    const totalMachineryCost = schedule.reduce((s, m) => s + m.totalCost, 0);
    return { items: schedule, totalMachineryCost: Math.round(totalMachineryCost) };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function enrichSimpleItems(items, splitRatio, prodRate, hourlyRate, crewKey, crewHoursMap) {
    if (!items || items.length === 0) return;
    for (const item of items) {
        const totalCostRaw = Number(item.totalCost) || Number(item.unitRate) || 0;
        if (totalCostRaw <= 0) continue;
        if (item.materialCost > 0 && item.laborCost > 0) continue;
        item.materialCost = Math.round(totalCostRaw * splitRatio.material);
        item.laborCost = Math.round(totalCostRaw * splitRatio.labor);
        item.equipmentCost = Math.round(totalCostRaw * splitRatio.equipment);
        item.totalCost = item.materialCost + item.laborCost + item.equipmentCost;
        const qty = Number(item.quantity) || 0;
        item.laborHours = Math.round(qty * prodRate);
        item.laborRate = hourlyRate;
        crewHoursMap[crewKey] = (crewHoursMap[crewKey] || 0) + item.laborHours;
    }
}

function enrichGenericItems(items, productivity, laborRates, crewHoursMap, classifierFn) {
    if (!items || items.length === 0) return;
    for (const item of items) {
        const totalCostRaw = Number(item.totalCost) || Number(item.unitRate) || 0;
        if (totalCostRaw <= 0) continue;
        if (item.materialCost > 0 && item.laborCost > 0) continue;
        const { split, prodKey, rateKey, crewKey } = classifierFn(item);
        item.materialCost = Math.round(totalCostRaw * split.material);
        item.laborCost = Math.round(totalCostRaw * split.labor);
        item.equipmentCost = Math.round(totalCostRaw * split.equipment);
        item.totalCost = item.materialCost + item.laborCost + item.equipmentCost;
        const qty = Number(item.quantity) || 0;
        item.laborHours = Math.round(qty * (productivity[prodKey] || 0.02));
        item.laborRate = laborRates[rateKey] || laborRates.general;
        crewHoursMap[crewKey] = (crewHoursMap[crewKey] || 0) + item.laborHours;
    }
}

function sumItems(items) {
    if (!items || items.length === 0) return { mat: 0, lab: 0, equip: 0, hrs: 0, total: 0 };
    return items.reduce((acc, i) => ({
        mat: acc.mat + (Number(i.materialCost) || 0), lab: acc.lab + (Number(i.laborCost) || 0),
        equip: acc.equip + (Number(i.equipmentCost) || 0), hrs: acc.hrs + (Number(i.laborHours) || 0),
        total: acc.total + (Number(i.totalCost) || 0),
    }), { mat: 0, lab: 0, equip: 0, hrs: 0, total: 0 });
}

function detectCurrencyFromEstimate(estimate) {
    const sym = (estimate.summary || {}).currencySymbol || '';
    if (sym === '$' || sym === 'USD') return 'USD';
    if (sym === '₹' || sym === 'INR') return 'INR';
    if (sym.includes('د') || sym === 'AED') return 'AED';
    if (sym === '£' || sym === 'GBP') return 'GBP';
    if (sym === '€' || sym === 'EUR') return 'EUR';
    if (sym === 'RM' || sym === 'MYR') return 'MYR';
    if (sym === 'S$' || sym === 'SGD') return 'SGD';
    if (sym === 'A$' || sym === 'AUD') return 'AUD';
    if (sym === 'C$' || sym === 'CAD') return 'CAD';
    const curr = (estimate.summary || {}).currency || '';
    if (curr.includes('INR') || curr.includes('Rupee')) return 'INR';
    if (curr.includes('AED') || curr.includes('Dirham')) return 'AED';
    if (curr.includes('GBP') || curr.includes('Pound')) return 'GBP';
    if (curr.includes('EUR') || curr.includes('Euro')) return 'EUR';
    if (curr.includes('SAR') || curr.includes('Riyal')) return 'SAR';
    if (curr.includes('CAD')) return 'CAD';
    if (curr.includes('AUD')) return 'AUD';
    if (curr.includes('SGD')) return 'SGD';
    return 'USD';
}

function detectPEB(estimate, steelMembers) {
    const sys = ((estimate.summary || {}).structuralSystem || '').toLowerCase();
    if (sys.includes('peb') || sys.includes('pre-engineer') || sys.includes('pre engineer')) return true;
    const type = ((estimate.summary || {}).projectType || '').toLowerCase();
    if (type.includes('peb') || type.includes('pre-eng')) return true;
    // Check if any member has PEB-type naming
    for (const m of steelMembers) {
        if (/peb|built.?up|tapered|rafter/i.test(m.type || '')) return true;
    }
    return false;
}

function classifyConcreteElement(typeStr) {
    const t = typeStr.toLowerCase();
    if (t.includes('slab') && (t.includes('grade') || t.includes('ground') || t.includes('sog'))) return 'slab_on_grade';
    if (t.includes('slab') || t.includes('elevated')) return 'elevated_slab';
    if (t.includes('grade beam') || t.includes('plinth')) return 'grade_beam';
    if (t.includes('retaining') || t.includes('shear wall')) return 'retaining_wall';
    if (t.includes('column') || t.includes('pedestal')) return 'column';
    if (t.includes('pile') || t.includes('caisson')) return 'pile_cap';
    if (t.includes('raft') || t.includes('mat')) return 'raft';
    if (t.includes('beam') || t.includes('lintel')) return 'beam';
    return 'footing';
}

function groupConcreteByGrade(concreteItems) {
    const groups = {};
    for (const c of concreteItems) {
        const grade = c.concreteGrade || 'Unknown';
        if (!groups[grade]) groups[grade] = { grade, totalCY: 0, items: [] };
        groups[grade].totalCY += Number(c.totalCY) || 0;
        groups[grade].items.push(c.element || c.description || 'N/A');
    }
    return Object.values(groups);
}
