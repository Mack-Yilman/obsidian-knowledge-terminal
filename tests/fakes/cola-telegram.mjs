// Servidor falso del Worker okt-telegram: impone el token y el contrato de la cola
// (GET /cola con cursor, GET /archivo/<key>, POST /cola/confirmar). Corre en el mismo proceso
// de la prueba, así que bajar() se importa directamente (el CLI con spawnSync lo bloquearía).
import { createServer } from 'node:http';

export const TOKEN = 'token-de-prueba-123';

export async function colaFalsa({ elementos = [], archivos = {}, porPagina = 50, fallarConfirmar = false, demora = 0 } = {}) {
  const estado = { elementos: [...elementos], archivos: { ...archivos }, confirmados: [], pedidos: [], fallarConfirmar, demoraArchivo: 0 };
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    estado.pedidos.push(`${req.method} ${url.pathname}`);
    if (demora) await new Promise((r) => setTimeout(r, demora));
    const responder = (codigo, cuerpo, tipo = 'application/json') => {
      res.writeHead(codigo, { 'content-type': tipo });
      res.end(tipo === 'application/json' ? JSON.stringify(cuerpo) : cuerpo);
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { error: 'no autorizado' });
    if (req.method === 'GET' && url.pathname === '/cola') {
      const desde = Number(url.searchParams.get('cursor') || 0);
      const pagina = estado.elementos.slice(desde, desde + porPagina);
      const siguiente = desde + porPagina < estado.elementos.length ? String(desde + porPagina) : null;
      return responder(200, { elementos: pagina, cursor: siguiente });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/archivo/')) {
      const key = decodeURIComponent(url.pathname.slice('/archivo/'.length));
      const a = estado.archivos[key];
      if (!a) return responder(404, { error: 'no existe' });
      if (estado.demoraArchivo) await new Promise((r) => setTimeout(r, estado.demoraArchivo));
      return responder(200, a.bytes, a.mime);
    }
    if (req.method === 'POST' && url.pathname === '/cola/confirmar') {
      let cuerpo = '';
      for await (const t of req) cuerpo += t;
      if (estado.fallarConfirmar) return responder(500, { error: 'falla simulada' });
      const { ids } = JSON.parse(cuerpo);
      estado.confirmados.push(...ids);
      estado.elementos = estado.elementos.filter((e) => !ids.includes(e.id));
      return responder(200, { borrados: ids.length });
    }
    return responder(404, { error: 'ruta' });
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}`;
  return { url, estado, cerrar: () => new Promise((r) => servidor.close(r)) };
}

// Elemento de la cola con los campos del contrato.
export function elemento(id, tipo, texto, extra = {}) {
  return { id, tipo, texto, fecha: '2026-10-21T18:05:00-05:00', chat_id: '1', ...extra };
}
