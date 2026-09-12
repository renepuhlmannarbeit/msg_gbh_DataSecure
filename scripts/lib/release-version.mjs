// A version cut must demote the current-source claim, including the plain
// published "RCnnn" form. Historical package/commit evidence is left intact.
export function advanceReleaseSource(text, { previous, target }) {
  if (target === previous) return text;
  const label = /-rc(\d+)$/iu.exec(target);
  const rc = label ? `RC${label[1]}` : target;
  const sentence = /^Der aktuelle Quellstand ist\b[\s\S]*?\.(?=\s|$)/mu;
  if (!sentence.test(text)) throw new Error('RELEASE_SOURCE_STATEMENT_MISSING');
  return text.replace(sentence,
    `Der aktuelle Quellstand ist ${rc}-Entwicklungsstand und noch kein neu gebundener Paketkandidat.`);
}
