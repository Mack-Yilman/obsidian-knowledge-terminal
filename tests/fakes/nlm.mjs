// Fake de nlm (notebooklm-mcp-cli). Reglas reales: create exige --confirm para no preguntar; download
// escribe en --output; studio status lista artefactos. El estado de los artefactos se guarda en un
// archivo para simular que el contenido pasa de in_progress a completed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { datos, registrar, fallar, opcion } from './comun.mjs';

const args = process.argv.slice(2);
registrar('nlm', args);
const d = datos().notebooklm;
const estadoRuta = `${process.env.OKT_FAKE_DATOS}.estudio.json`;
const estudio = existsSync(estadoRuta) ? JSON.parse(readFileSync(estadoRuta, 'utf8')) : { artefactos: [], consultas: 0 };
const guardar = () => writeFileSync(estadoRuta, JSON.stringify(estudio));
const cuaderno = (id) => d.cuadernos.find((c) => c.id === id) || fallar(`Notebook not found: ${id}`);

const [a, b, c1, c2] = args;
if (a === '--version') console.log('nlm version 0.0.0-fake');
else if (a === 'list' && b === 'notebooks') console.log(JSON.stringify(d.cuadernos.map(({ notas, ...x }) => x)));
else if (a === 'note' && b === 'list') {
  const c = cuaderno(c1);
  console.log(JSON.stringify({ notebook_id: c.id, notes: c.notas || [], count: (c.notas || []).length }));
} else if (a === 'query' && b === 'notebook') {
  cuaderno(c1);
  console.log(JSON.stringify({ answer: `Respuesta sobre: ${c2}`, sources: [{ title: 'Guía de prueba' }] }));
} else if (b === 'create') {
  cuaderno(c1);
  if (!args.includes('--confirm')) fallar('Aborted: confirmation required');
  const id = `art-${estudio.artefactos.length + 1}`;
  const tipo = { infographic: 'infographic', slides: 'slide_deck', mindmap: 'mind_map', report: 'report', 'data-table': 'data_table', audio: 'audio', video: 'video' }[a];
  estudio.artefactos.push({ artifact_id: id, type: tipo, status: 'in_progress', polls: 0, lang: opcion(args, '--language') });
  guardar();
  console.log(JSON.stringify({ artifact_id: id, status: 'in_progress' }));
} else if (a === 'studio' && b === 'status') {
  cuaderno(c1);
  for (const x of estudio.artefactos) if (++x.polls >= 2) x.status = 'completed';
  guardar();
  console.log(JSON.stringify(estudio.artefactos.map(({ polls, lang, ...x }) => x)));
} else if (a === 'download') {
  cuaderno(c1);
  const out = opcion(args, '--output');
  const id = opcion(args, '--id');
  const art = estudio.artefactos.find((x) => x.artifact_id === id) || d.listos?.find((x) => x.artifact_id === id);
  if (!art || art.status !== 'completed') fallar('Artifact not ready');
  const contenido = { infographic: 'PNGFAKE', report: '# Informe\n\nTexto del informe.', 'mind-map': JSON.stringify({ name: 'Raíz', children: [{ name: 'Rama A', children: [{ name: 'Hoja' }] }, { name: 'Rama B' }] }), 'data-table': 'Fármaco,Dosis\nSulfato ferroso,3 mg/kg' }[b] || 'BIN';
  writeFileSync(out, contenido);
} else fallar(`fake nlm: no soportado ${args.join(' ')}`, 2);
