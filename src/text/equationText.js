export const EQUATION_FONT_FAMILY = 'Cambria Math, STIX Two Math, STIXGeneral, Times New Roman, serif';

const SUPERSCRIPT = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ',
  k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ',
  u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};

const SUBSCRIPT = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ',
  o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

const COMMANDS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ',
  mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', cdot: '·', scalar: '·', scalarmul: '·', div: '÷', ast: '∗', circ: '∘',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
  sim: '∼', propto: '∝', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆',
  supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅',
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', therefore: '∴', because: '∵',
  infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', coprod: '∐',
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', degree: '°', angle: '∠',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',uparrow: '↑', downarrow: '↓',
  ell: 'ℓ', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', prime: '′', dots: '…', ldots: '…',
  sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', log: 'log', ln: 'ln', exp: 'exp',
  lim: 'lim', max: 'max', min: 'min', det: 'det', gcd: 'gcd',
};

const BLACKBOARD = {
  C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ',
};

function findClosingBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceGroupedCommand(input, command, groupCount, replacer) {
  const marker = `\\${command}`;
  let text = input;
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const commandIndex = text.indexOf(marker, searchFrom);
    if (commandIndex < 0) break;
    let cursor = commandIndex + marker.length;
    const groups = [];

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      while (text[cursor] === ' ') cursor += 1;
      if (text[cursor] !== '{') break;
      const end = findClosingBrace(text, cursor);
      if (end < 0) break;
      groups.push(text.slice(cursor + 1, end));
      cursor = end + 1;
    }

    if (groups.length !== groupCount) {
      searchFrom = commandIndex + marker.length;
      continue;
    }

    const replacement = replacer(...groups);
    text = `${text.slice(0, commandIndex)}${replacement}${text.slice(cursor)}`;
    searchFrom = commandIndex + replacement.length;
  }

  return text;
}

function scriptText(value, alphabet, fallbackPrefix) {
  const chars = [...value];
  if (chars.every(char => alphabet[char] != null)) {
    return chars.map(char => alphabet[char]).join('');
  }
  return `${fallbackPrefix}(${value})`;
}

function wrapFractionPart(value) {
  const trimmed = value.trim();
  return /^[\p{L}\p{N}.]+$/u.test(trimmed) ? trimmed : `(${trimmed})`;
}

function formatInternal(value) {
  let text = String(value ?? '');
  text = text.replace(/^\s*\$+|\$+\s*$/g, '');
  text = text.replace(/\\\\/g, '\n');
  text = text.replace(/\\left\b|\\right\b/g, '');

  text = replaceGroupedCommand(text, 'frac', 2, (numerator, denominator) => {
    const top = wrapFractionPart(formatInternal(numerator));
    const bottom = wrapFractionPart(formatInternal(denominator));
    return `${top}⁄${bottom}`;
  });
  text = replaceGroupedCommand(text, 'sqrt', 1, radicand => `√(${formatInternal(radicand)})`);
  text = replaceGroupedCommand(text, 'vec', 1, vector => `${formatInternal(vector)}⃗`);
  text = replaceGroupedCommand(text, 'overline', 1, content => `${formatInternal(content)}̅`);
  text = replaceGroupedCommand(text, 'mathbb', 1, content => (
    [...content].map(char => BLACKBOARD[char] ?? char).join('')
  ));
  for (const command of ['mathrm', 'mathbf', 'mathit', 'operatorname', 'text']) {
    text = replaceGroupedCommand(text, command, 1, content => formatInternal(content));
  }

  text = text.replace(/\\([A-Za-z]+)/g, (match, command) => COMMANDS[command] ?? command);
  text = text
    .replace(/<=>/g, '⇔')
    .replace(/=>/g, '⇒')
    .replace(/<->/g, '↔')
    .replace(/->/g, '→')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\+-/g, '±')
    .replace(/\*/g, '·');

  let previous;
  do {
    previous = text;
    text = text
      .replace(/\^\{([^{}]*)\}/g, (match, content) => scriptText(content, SUPERSCRIPT, '^'))
      .replace(/_\{([^{}]*)\}/g, (match, content) => scriptText(content, SUBSCRIPT, '_'));
  } while (text !== previous);

  text = text
    .replace(/\^([A-Za-z0-9+\-=()])/g, (match, content) => scriptText(content, SUPERSCRIPT, '^'))
    .replace(/_([A-Za-z0-9+\-=()])/g, (match, content) => scriptText(content, SUBSCRIPT, '_'))
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+/g, ' ');

  return text.trim();
}

export function formatEquationText(value) {
  return formatInternal(value);
}

export function getNodeDisplayText(node, value = node?.label ?? '') {
  return node?.equationMode ? formatEquationText(value) : String(value ?? '');
}

export function getNodeTextFontFamily(node) {
  return node?.equationMode
    ? EQUATION_FONT_FAMILY
    : 'Inter, system-ui, sans-serif';
}
