// Narrowly reject the application's historical ASR hint copying itself.
// This is not a general truth/speech classifier. Preserve ordinary questions
// about a single medical word and do not suppress repeated short questions.
export function isLegacyPromptEcho(text) {
  if (typeof text !== 'string') return false;
  const compact = text.normalize('NFC').replace(/[\p{P}\p{Z}\s]/gu, '');
  if (compact.includes('한국어병원체험대화')) return true;
  const hints = ['청진기', '예방접종', '체온', '혈압', '산소포화도', '피검사', '배진찰'];
  return compact.includes('용어') && hints.filter(word => compact.includes(word)).length >= 4;
}
