import { loadAll, validate } from './lib/parse.mjs';
const sets = loadAll('data-src');
let total = 0;
for (const s of sets) { total += s.questions.length; console.log(s.id.padEnd(5), s.title.padEnd(24), s.questions.length); }
console.log('TOTAL', total);
const errs = validate(sets);
console.log('ERRORS', errs.length);
console.log(errs.slice(0, 60).join('\n'));
