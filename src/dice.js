/**
 * TRPG写作工坊 — Dice Roller Engine
 * Supports: NdX, NdXkh/klN, NdX+/-M, and complex formulas
 */

/**
 * Roll a single die
 * @param {number} sides 
 * @returns {number}
 */
function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parse and evaluate a dice formula
 * @param {string} formula - e.g. "2d6+3", "4d6kh3", "1d20"
 * @returns {{ formula: string, rolls: number[], kept: number[], modifier: number, total: number, details: string }}
 */
export function rollDice(formula) {
  formula = formula.trim().toLowerCase();

  // Match pattern: (count)d(sides)(kh/kl N)(+/- modifier)
  const match = formula.match(
    /^(\d+)?d(\d+)(?:(kh|kl)(\d+))?(?:\s*([+\-])\s*(\d+))?$/
  );

  if (!match) {
    // Try evaluating as pure number/expression
    const num = parseInt(formula);
    if (!isNaN(num)) {
      return {
        formula,
        rolls: [num],
        kept: [num],
        modifier: 0,
        total: num,
        details: `${num}`
      };
    }
    throw new Error(`无法解析骰子公式: ${formula}`);
  }

  const count = parseInt(match[1] || '1');
  const sides = parseInt(match[2]);
  const keepMode = match[3]; // 'kh' or 'kl' or undefined
  const keepCount = match[4] ? parseInt(match[4]) : count;
  const modSign = match[5]; // '+' or '-' or undefined
  const modValue = match[6] ? parseInt(match[6]) : 0;
  const modifier = modSign === '-' ? -modValue : modValue;

  if (count > 100) throw new Error('骰子数量不能超过100');
  if (sides > 1000) throw new Error('骰面不能超过1000');

  // Roll all dice
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }

  // Sort for keep highest / keep lowest
  let kept = [...rolls];
  if (keepMode) {
    const sorted = [...rolls].map((v, i) => ({ v, i }));
    if (keepMode === 'kh') {
      sorted.sort((a, b) => b.v - a.v);
    } else {
      sorted.sort((a, b) => a.v - b.v);
    }
    const keptIndices = new Set(sorted.slice(0, keepCount).map(x => x.i));
    kept = rolls.filter((_, i) => keptIndices.has(i));
  }

  const subtotal = kept.reduce((sum, v) => sum + v, 0);
  const total = subtotal + modifier;

  // Build details string (B3: use index set for correct drop marking)
  const keptIndexSet = keepMode ? new Set(
    [...rolls].map((v, i) => ({ v, i }))
      .sort((a, b) => keepMode === 'kh' ? b.v - a.v : a.v - b.v)
      .slice(0, keepCount)
      .map(x => x.i)
  ) : null;
  let details = `[${rolls.map((r, i) => {
    if (keepMode && !keptIndexSet.has(i)) {
      return `~~${r}~~`;
    }
    return r;
  }).join(', ')}]`;

  if (keepMode) {
    details += ` ${keepMode}${keepCount}`;
  }
  if (modifier !== 0) {
    details += ` ${modifier > 0 ? '+' : ''}${modifier}`;
  }

  return {
    formula: formula.toUpperCase(),
    rolls,
    kept,
    modifier,
    total,
    details
  };
}

/**
 * Evaluate a compound dice expression
 * e.g. "2d6+1d4+3"
 * @param {string} expression 
 * @returns {{ formula: string, total: number, details: string }}
 */
export function evaluateDiceExpression(expression) {
  expression = expression.trim().toLowerCase();

  // If it's a simple formula, use rollDice directly
  if (/^(\d+)?d(\d+)(?:(kh|kl)(\d+))?(?:\s*[+\-]\s*\d+)?$/.test(expression)) {
    return rollDice(expression);
  }

  // Split by + and - while keeping the operators
  const parts = expression.split(/(?=[+\-])/);
  let total = 0;
  const details = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (/d/.test(trimmed)) {
      // It's a dice roll
      const cleanPart = trimmed.replace(/^\+/, '');
      const isNegative = cleanPart.startsWith('-');
      const actualPart = cleanPart.replace(/^[+\-]/, '');
      const result = rollDice(actualPart);
      const value = isNegative ? -result.total : result.total;
      total += value;
      details.push(`${isNegative ? '-' : details.length > 0 ? '+' : ''}${result.details}`);
    } else {
      // It's a number
      const num = parseInt(trimmed);
      if (!isNaN(num)) {
        total += num;
        details.push(`${num > 0 && details.length > 0 ? '+' : ''}${num}`);
      }
    }
  }

  return {
    formula: expression.toUpperCase(),
    total,
    details: details.join(' ')
  };
}
