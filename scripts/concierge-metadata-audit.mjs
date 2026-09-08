// Read-only public catalog audit. Never touches sessions, bookings or metadata.
import { writeFile } from 'node:fs/promises';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supply the public Supabase URL/key via --env-file.');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const fields = 'id,title,description,highlights,category,tags,country,department,city,area,price_per_person,currency,min_capacity,max_capacity,duration_hours,whats_included,whats_not_included,what_to_bring,publication_status,is_active';
const rows = [];
for (let offset = 0; ; offset += 200) {
  const q = new URLSearchParams({ select: fields, publication_status: 'eq.published', order: 'id', limit: '200', offset: String(offset) });
  const res = await fetch(`${url}/rest/v1/activities?${q}`, { headers });
  if (!res.ok) throw new Error(`Catalog read HTTP ${res.status}`);
  const page = await res.json(); rows.push(...page); if (page.length < 200) break;
}
let metadataStatus = 'available';
let metadata = [];
for (let offset = 0; ; offset += 200) {
  const m = await fetch(`${url}/rest/v1/activities?select=id,recommendation_metadata&publication_status=eq.published&order=id&limit=200&offset=${offset}`, { headers });
  if (m.ok) { const page = await m.json(); metadata.push(...page); if (page.length < 200) break; }
  else { const error = await m.json(); if (error.code !== '42703' && error.code !== 'PGRST204') throw new Error(`Metadata read HTTP ${m.status}`); metadataStatus = 'column absent in live schema'; break; }
}
const required = ['interests','desired_feelings','best_for','adventure_level','physical_intensity','pace'];
let report = `# Published catalog metadata review\n\nRead-only snapshot: ${new Date().toISOString()}. Project: ${new URL(url).hostname}.\n\nScope: all published activities visible to the public anon role, paginated; no active-only query filter. This cannot attest to unpublished or otherwise RLS-hidden records. Metadata: ${metadataStatus}. No production writes.\n\n`;
for (const row of rows) {
  const current = metadata.find((r) => r.id === row.id)?.recommendation_metadata ?? {};
  const missing = required.filter((k) => current[k] == null || (Array.isArray(current[k]) && !current[k].length));
  report += `## ${row.title}\n\nID: \`${row.id}\`\n\nFactual DB fields:\n\n\`\`\`json\n${JSON.stringify(row, null, 2)}\n\`\`\`\n\nMissing/review required: ${missing.join(', ') || 'none of the six required fields'}.\n\nCurrent metadata:\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n\nManual review worksheet (not an insert/update payload; null = unreviewed):\n\n\`\`\`json\n${JSON.stringify(Object.fromEntries(required.map((k) => [k, current[k] ?? null])), null, 2)}\n\`\`\`\n\n`;
}
report += 'Do not infer subjective metadata from photos, titles or marketing copy. An authorized catalog editor must confirm each field with the provider. Unknown values must remain absent in database JSON, not guessed or filled with null.\n';
await writeFile('docs/concierge-metadata-review.md', report);
console.log(JSON.stringify({ publishedPublicActivities: rows.length, metadataStatus }));
