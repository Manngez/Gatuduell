import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../result-ui.css',import.meta.url),'utf8');

test('resultatmodalen är dold vid sidstart',()=>{
  assert.match(html,/id="resultModal" class="modal" hidden/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
});
