// Fake de nlm (notebooklm-mcp-cli). Reglas reales: create exige --confirm para no preguntar; download
// escribe en --output; studio status lista artefactos. El estado (artefactos, cuadernos y fuentes creados) se
// guarda en un archivo para simular que el contenido pasa de in_progress a completed.
// Formatos de quiz, flashcards y source content copiados de nlm 0.15.7 real (2026-11-21).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { datos, registrar, fallar, opcion } from './comun.mjs';

const args = process.argv.slice(2);
registrar('nlm', args);
const d = datos().notebooklm;
const estadoRuta = `${process.env.OKT_FAKE_DATOS}.estudio.json`;
const estudio = existsSync(estadoRuta) ? JSON.parse(readFileSync(estadoRuta, 'utf8')) : { artefactos: [], consultas: 0, cuadernos: [], fuentes: [] };
estudio.cuadernos ||= [];
estudio.fuentes ||= [];
const guardar = () => writeFileSync(estadoRuta, JSON.stringify(estudio));
const todos = () => [...d.cuadernos, ...estudio.cuadernos];
const cuaderno = (id) => todos().find((c) => c.id === id) || fallar(`Notebook not found: ${id}`);

const QUIZ = {
  title: 'Ciclo Cardíaco Cuestionario',
  questions: [
    {
      type: 'multiple_choice',
      question: '¿Qué provoca el inicio de la eyección ventricular?',
      answerOptions: [
        { text: 'La presión del ventrículo izquierdo supera la de la aorta.', isCorrect: true, rationale: 'Así se abre la válvula aórtica.' },
        { text: 'Se abren las válvulas auriculoventriculares.', isCorrect: false, rationale: 'Eso inicia el llenado.' },
      ],
      hint: 'Piensa en el gradiente de presión.',
    },
  ],
};
const bloque = (t) => ({ flashcardContentBlock: [{ type: 'text', content: t }] });
const FLASHCARDS = {
  title: 'Ciclo Cardíaco Tarjetas',
  cards: [
    { front: bloque('¿Cuáles son las dos fases del ciclo cardiaco?'), back: bloque('La sístole y la diástole.') },
    { front: bloque('¿Qué produce el primer ruido cardiaco?'), back: bloque('El cierre de las válvulas mitral y tricúspide.') },
  ],
};
// El markdown real de nlm 0.15.7 sale roto (diccionarios de Python): OKT debe pedir --format json.
const MARKDOWN_ROTO = "# Tarjetas\n\n## Card 1\n\n**Front:** {'flashcardContentBlock': [{'type': 'text', 'content': '¿…?'}]}\n";

const [a, b, c1, c2] = args;
if (a === '--version') console.log('nlm version 0.0.0-fake');
else if (a === 'list' && b === 'notebooks') console.log(JSON.stringify(todos().map(({ notas, ...x }) => x)));
else if (a === 'notebook' && b === 'create') {
  const id = `00000000-0000-0000-0000-${String(estudio.cuadernos.length + 1).padStart(12, '0')}`;
  estudio.cuadernos.push({ id, title: c1, source_count: 0, updated_at: '2026-10-22' });
  guardar();
  console.log(JSON.stringify({ notebook_id: id, title: c1, url: `https://notebook.google.com/notebook/${id}`, message: `Created notebook: ${c1}` }));
} else if (a === 'note' && b === 'list') {
  const c = cuaderno(c1);
  console.log(JSON.stringify({ notebook_id: c.id, notes: c.notas || [], count: (c.notas || []).length }));
} else if (a === 'query' && b === 'notebook') {
  cuaderno(c1);
  // Formato real de nlm 0.15.4: references con citation_number, source_id y cited_text.
  console.log(JSON.stringify({ answer: `Respuesta sobre: ${c2} [1]`, question: c2, conversation_id: 'conv1', sources_used: ['s1'], citations: { 1: 's1' }, references: [{ source_id: 's1', citation_number: 1, cited_text: 'Texto citado de la guía.' }] }));
} else if (a === 'source' && b === 'add') {
  cuaderno(c1);
  const archivo = opcion(args, '--file');
  if (archivo && !existsSync(archivo)) fallar(`File not found: ${archivo}`);
  const ref = archivo || opcion(args, '--url') || opcion(args, '--youtube') || opcion(args, '--drive');
  if (!ref) fallar('Specify a source to add');
  const tipo = archivo ? 'file' : args.includes('--youtube') ? 'youtube' : args.includes('--drive') ? 'drive' : 'url';
  const id = `src-${estudio.fuentes.length + 1}`;
  estudio.fuentes.push({ id, cuaderno: c1, ref, tipo });
  guardar();
  console.log(JSON.stringify({ source_type: tipo, source_id: id, title: opcion(args, '--title') || ref.split(/[\\/]/).pop() }));
} else if (a === 'source' && b === 'content') {
  const f = estudio.fuentes.find((x) => x.id === c1) || fallar(`Source not found: ${c1}`);
  const audio = /\.(mp3|m4a|wav|ogg)$/i.test(f.ref);
  const content = audio ? d.transcripcion || 'Buenos días. Hoy repasamos el ciclo cardiaco: la sístole y la diástole.' : `Texto de ${f.ref}`;
  console.log(JSON.stringify({ content, title: f.ref, source_type: audio ? 'audio' : f.tipo, url: null, char_count: content.length }));
} else if (a === 'source' && b === 'list') {
  cuaderno(c1);
  // Como el real: una fuente subida con --file se titula con el nombre del archivo.
  const subidas = estudio.fuentes.filter((f) => f.cuaderno === c1).map((f) => ({ id: f.id, title: f.ref.split(/[\\/]/).pop(), type: f.tipo, url: null, status: 2 }));
  console.log(JSON.stringify([{ id: 's1', title: 'Guía de prueba', type: 'web', url: 'https://example.org/guia', status: 2 }, ...subidas]));
} else if (b === 'create') {
  cuaderno(c1);
  if (!args.includes('--confirm')) fallar('Aborted: confirmation required');
  const id = `art-${estudio.artefactos.length + 1}`;
  const tipo = { infographic: 'infographic', slides: 'slide_deck', mindmap: 'mind_map', report: 'report', 'data-table': 'data_table', audio: 'audio', video: 'video', quiz: 'quiz', flashcards: 'flashcards' }[a];
  estudio.artefactos.push({ artifact_id: id, type: tipo, status: 'in_progress', polls: 0, lang: opcion(args, '--language') });
  guardar();
  console.log(JSON.stringify({ artifact_type: tipo, artifact_id: id, status: 'queued' }));
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
  const json = opcion(args, '--format') === 'json';
  const contenido = {
    infographic: 'PNGFAKE',
    report: d.informe || '# Informe\n\nTexto del informe.',
    'mind-map': JSON.stringify({ name: 'Raíz', children: [{ name: 'Rama A', children: [{ name: 'Hoja' }] }, { name: 'Rama B' }] }),
    'data-table': 'Fármaco,Dosis\nSulfato ferroso,3 mg/kg',
    quiz: json ? JSON.stringify(QUIZ) : MARKDOWN_ROTO,
    flashcards: json ? JSON.stringify(FLASHCARDS) : MARKDOWN_ROTO,
  }[b] || 'BIN';
  writeFileSync(out, contenido);
} else fallar(`fake nlm: no soportado ${args.join(' ')}`, 2);
