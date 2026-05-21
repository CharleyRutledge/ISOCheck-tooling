const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const server = spawn(process.execPath, [path.join(root, 'server.js')], {
  cwd: root, env: { ...process.env, PORT: '3099' }, stdio: 'ignore',
});
setTimeout(() => {
  http.get('http://127.0.0.1:3099/iso-compliance-checker.html', (res) => {
    let d = ''; res.on('data', (c) => (d += c));
    res.on('end', () => {
      if (res.statusCode !== 200 || !d.includes('ISOCheck')) process.exitCode = 1;
      else console.log('smoke ok');
      server.kill();
    });
  }).on('error', () => { process.exitCode = 1; server.kill(); });
}, 400);
