import { chemicalFormula } from './chemistry.js';
import { parseExpression } from './math.js';

export function classifyTyped(text: string): 'chemical-equation' | 'chemical-formula' | 'math-equation' | 'math-expression' | null {
  if (text.length > 1000) return null;
  const arrow = text.replaceAll('→', '->').split('->');
  if (arrow.length === 2) { try { arrow.flatMap(side => side.split('+')).forEach(s => chemicalFormula(s.trim().replace(/^\d+\s*/, ''))); return 'chemical-equation'; } catch { return null; } }
  try { chemicalFormula(text); return 'chemical-formula'; } catch { /* other typed grammar */ }
  const equation = text.split('='); if (equation.length === 2) { try { equation.forEach(parseExpression); return 'math-equation'; } catch { return null; } }
  try { parseExpression(text); return 'math-expression'; } catch { return null; }
}
