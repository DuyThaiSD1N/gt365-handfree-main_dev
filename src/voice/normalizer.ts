const punctuationPattern = /[.,!?;:"'`~()[\]{}<>/\\|+=*_#$%^&@-]/g;

// Phonetic aliases: ASR thường phiên âm các từ vay mượn / nhầm tone gần giống.
// Áp dụng SAU normalize cơ bản (lowercase, đ→d, bỏ dấu) để khớp với phrase trong commands.
const phoneticAliases: Array<[RegExp, string]> = [
  // radio: phiên âm tiếng Việt — "ra-đi-ô", "ra đi ô", "ra điêu", "ra điều", "ra điếu",
  // "ra đêu", "ra đêo", "rai điêu", "rađio", "rei đi ô"...
  // Gom thành 1 regex: bắt đầu "ra"/"rai"/"rei" + tách "d/đ" + đuôi nguyên âm.
  [
    /\b(?:ra|rai|rei|rardi|radi)\s*[dđ]\s*(?:i\s*o|i\s*eu|ieu|yeu|i\s*[eou]|eu|eo|y\s*o|io)\b/g,
    'radio',
  ],
  [/\brardio\b/g, 'radio'],
  [/\bra\s*dio\b/g, 'radio'],

  // phạt nguội: ASR hay nhầm "phạt" → "phản/phát/phật", "nguội" → "người/ngụi/nguồi"
  [/\b(phan|phat|phật|phấn|phạt|phất)\s+(nguoi|nguội|ngui|nguôi|ngươi)\b/g, 'phat nguoi'],

  // gt365: "gt ba sáu năm" / "gi ti ba sáu năm"
  [/\bgi\s*ti\s*365\b/g, 'gt365'],
  [/\bgt\s*ba\s*sau\s*nam\b/g, 'gt365'],

  // trợ lý: ASR đôi khi đọc "chợ lý" / "trợ lí"
  [/\bcho\s+ly\b/g, 'tro ly'],
  [/\btro\s+li\b/g, 'tro ly'],

  // trang chủ: ASR đôi khi đọc "trang chu" → giữ; "chang chủ" → fix
  [/\bchang\s+chu\b/g, 'trang chu'],

  // cảnh báo: ASR đôi khi đọc "canh báo" → giữ; "cánh báo" → giữ
  [/\bcanh\s+bao\b/g, 'canh bao'],
];

export function normalizeVietnamese(input: string): string {
  let normalized = input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(punctuationPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of phoneticAliases) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

export function tokenize(input: string): string[] {
  return normalizeVietnamese(input)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function tokenOverlapScore(input: string, phrase: string): number {
  const inputTokens = tokenize(input);
  const phraseTokens = tokenize(phrase);

  if (inputTokens.length === 0 || phraseTokens.length === 0) {
    return 0;
  }

  const inputSet = new Set(inputTokens);
  const overlap = phraseTokens.filter((token) => inputSet.has(token)).length;
  return overlap / phraseTokens.length;
}

// Strip các cụm tiếng đệm cuối câu thường gặp khi nói giọng nói tự nhiên
// Ví dụ: "về trang chủ cho tôi" → "ve trang chu"
//        "bật vị trí đi" → "bat vi tri"
const TRAILING_FILLERS = /\s+(cho\s+toi|cho\s+minh|giup\s+toi|giup\s+minh|nhe|nha|di|voi|duoc\s+khong|duoc\s+ko|duoc\s+hong|dum\s+toi|dum\s+minh|a|nao)$/;

export function stripTrailingFillers(normalized: string): string {
  let result = normalized;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(TRAILING_FILLERS, '').trim();
  }
  return result;
}