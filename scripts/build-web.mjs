import fs from 'node:fs';
for(const file of ['web/public/index.html','web/public/app.js','web/public/style.css','api/control.mjs'])if(!fs.existsSync(file))throw new Error('Missing '+file);
console.log('Private remote control panel ready; renderer stays on the Mac.');
