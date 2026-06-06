import { compileReb } from './src/compiler.js';
import { JSDOM } from 'jsdom';

// Polyfill DOMParser for Node
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
global.document = dom.window.document;

const raw = `<reb-date name="romd_start_date" format="02/01/06"></reb-date>`;
console.log(compileReb(raw).htmlSource);
