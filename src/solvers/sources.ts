import type { Source } from '../engine/types.js';
export const SOLVER_DATA_VERSION = 'tier2-data-1.0.0';
export const REGISTRY_VERSION = '1.0.0';
export const SOLVER_SOURCES: Readonly<Record<string, Source>> = Object.freeze({
  'ciaaw-2024': { title: 'CIAAW Abridged Standard Atomic Weights 2024', url: 'https://ciaaw.org/abridged-atomic-weights.htm', locator: 'Standard weights and table uncertainties; committed snapshot data/reference/ciaaw-2024.html. No standard mass is substituted for radioactive elements with a dash.' },
  pubchem: { title: 'PubChem periodic table reference', url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON', locator: 'Atomic numbers, symbols, reported neutral configurations and selected reference properties; committed source snapshot. Heavy-element configurations may be predictions.' },
  'nist-r': { title: 'NIST molar gas constant / SI constants', url: 'https://physics.nist.gov/cgi-bin/cuu/Value?r', locator: 'R = 8.31446261815324 J mol^-1 K^-1, computed from exact SI k and NA.' },
  'si-units': { title: 'BIPM SI Brochure', url: 'https://www.bipm.org/en/publications/si-brochure', locator: 'SI unit dimensions/prefixes; Celsius–kelvin offset 273.15; exact conventional atmosphere 101325 Pa and torr = atm/760.' },
  'openstax-stoich': { title: 'OpenStax Chemistry 2e, Stoichiometry', url: 'https://openstax.org/books/chemistry-2e/pages/4-3-reaction-stoichiometry', locator: 'Balanced coefficient ratios, limiting reactants and percent yield; 4.1–4.4.' },
  'openstax-gases': { title: 'OpenStax Chemistry 2e, Gases', url: 'https://openstax.org/books/chemistry-2e/pages/9-2-relating-pressure-volume-amount-and-temperature-the-ideal-gas-law', locator: 'PV=nRT, Dalton/Graham and van der Waals models; chapter 9.' },
  'openstax-solutions': { title: 'OpenStax Chemistry 2e, Solutions', url: 'https://openstax.org/books/chemistry-2e/pages/11-4-colligative-properties', locator: 'Concentration definitions, dilution, freezing/boiling changes and osmotic pressure; sections 3.3 and 11.4.' },
  'openstax-acid': { title: 'OpenStax Chemistry 2e, Acid–base equilibria', url: 'https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh', locator: 'Kw≈1e-14 at 25°C, pH/pOH, monoprotic equilibria, Henderson–Hasselbalch and titration approximations; chapter 14.' },
  'openstax-equilibrium': { title: 'OpenStax Chemistry 2e, Equilibrium calculations', url: 'https://openstax.org/books/chemistry-2e/pages/13-4-equilibrium-calculations', locator: 'K, Q and ICE tables. This solver uses one ideal-concentration reaction with standard concentration 1 mol/L.' },
  'openstax-atomic': { title: 'OpenStax Chemistry 2e, Electronic structure', url: 'https://openstax.org/books/chemistry-2e/pages/6-4-electronic-structure-of-atoms-electron-configurations', locator: 'Aufbau, Pauli, Hund, Cr/Cu exceptions and highest-n removal for cations; neutral computed model checked against PubChem through Kr.' },
  'openstax-algebra': { title: 'OpenStax Algebra and Trigonometry 2e', url: 'https://openstax.org/books/algebra-and-trigonometry-2e/pages/2-5-quadratic-equations', locator: 'Polynomial operations and linear/quadratic equation solving; known-answer fixtures cite their section.' },
  'openstax-calculus': { title: 'OpenStax Calculus Volume 1', url: 'https://openstax.org/books/calculus-volume-1/pages/3-3-differentiation-rules', locator: 'Differentiation/chain rules and power-rule antiderivatives; sections 3.3, 3.6 and 5.2. Integrals here are polynomial-only.' },
});
export const GAS_CONSTANT = 8.31446261815324;
export const WATER_KW_25C = 1e-14;
