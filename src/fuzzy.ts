/**
 * Subsequence fuzzy match. Each character of `query` must appear in `name`
 * in order. Case-insensitive. Empty query matches everything.
 *
 * Ported from tmux.expose's `fuzzy_matches` in model.rs.
 */
export function fuzzyMatches(name: string, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.length === 0) return true;

  const lowerName = name.toLowerCase();
  let nameIdx = 0;
  for (const queryCh of lowerQuery) {
    let found = false;
    while (nameIdx < lowerName.length) {
      const nameCh = lowerName[nameIdx];
      nameIdx += 1;
      if (nameCh === queryCh) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}
