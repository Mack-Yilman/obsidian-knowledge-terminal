// okt doctor: detección de Obsidian en Windows (por usuario o para todo el equipo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { escribir, temporal } from './ayuda.mjs';
import { obsidianInstalado } from '../scripts/lib/doctor.mjs';

test('doctor encuentra Obsidian instalado para todo el equipo (Program Files), no solo por usuario', { skip: process.platform !== 'win32' }, () => {
  const t = temporal();
  const camino = process.env.PATH;
  process.env.PATH = ''; // sin el obsidian del PATH real
  try {
    const base = { LOCALAPPDATA: join(t.dir, 'local'), ProgramFiles: join(t.dir, 'Program Files'), 'ProgramFiles(x86)': join(t.dir, 'x86') };
    assert.equal(obsidianInstalado(base), false);
    escribir(base.ProgramFiles, 'Obsidian/Obsidian.exe', '');
    assert.equal(obsidianInstalado(base), true);
  } finally {
    process.env.PATH = camino;
    t.borrar();
  }
});
