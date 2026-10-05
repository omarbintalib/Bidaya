/** Parse CSV text (RFC 4180: quoted fields, doubled quotes, newlines inside quotes) into objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Copies runs of plain text with slice() and stops only at the characters that matter: this runs over ~1.4 MB on every load.
  const special = /[",\r\n]/g;
  let i = 0;
  while (i < src.length) {
    if (quoted) {
      const end = src.indexOf('"', i);
      if (end === -1) { field += src.slice(i); break; }
      field += src.slice(i, end);
      if (src.charCodeAt(end + 1) === 34) { field += '"'; i = end + 2; } else { quoted = false; i = end + 1; }
      continue;
    }
    special.lastIndex = i;
    const match = special.exec(src);
    if (!match) { field += src.slice(i); break; }
    const at = match.index, c = match[0];
    field += src.slice(i, at);
    i = at + 1;
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else {
      if (c === '\r' && src.charCodeAt(i) === 10) i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    }
  }
  row.push(field);
  if (row.some(v => v !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  const keys = header.map(h => h.trim());
  return body.map(values => Object.fromEntries(keys.map((key, i) => [key, (values[i] ?? '').trim()])));
}
