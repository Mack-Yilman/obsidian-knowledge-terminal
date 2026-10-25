// Fake de yt-dlp: «-J --skip-download … <url>» devuelve los datos de datos().youtube[id]. Las url de las pistas de
// subtítulos son data: URLs con el json3, que fetch lee sin red.
import { datos, registrar, fallar } from './comun.mjs';

const args = process.argv.slice(2);
registrar('yt-dlp', args);
if (!args.includes('-J') || !args.includes('--skip-download')) fallar(`fake yt-dlp: no soportado ${args.join(' ')}`, 2);
const id = (args.at(-1).match(/v=([\w-]{11})/) || [])[1];
const video = datos().youtube?.[id];
if (!video) fallar(`ERROR: [youtube] ${id}: Video unavailable`);
console.log(JSON.stringify(video));
