// Fake de defuddle: «parse <url> --json --md» devuelve la página de datos().web[url]; sin ella, falla como el real.
import { datos, registrar, fallar } from './comun.mjs';

const args = process.argv.slice(2);
registrar('defuddle', args);
if (args[0] !== 'parse' || !args.includes('--json') || !args.includes('--md')) fallar(`fake defuddle: no soportado ${args.join(' ')}`, 2);
const pagina = datos().web?.[args[1]];
if (!pagina) fallar('Error: Failed to fetch page: 404');
console.log(JSON.stringify(pagina));
