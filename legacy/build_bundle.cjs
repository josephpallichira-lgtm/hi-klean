const fs=require('fs');
const rd=p=>fs.readFileSync(p,'utf8');
const strip=(s)=>s
  .replace(/^import\s+[^;]*?from\s+'\.\/[^']+';?\s*$/gm,'')        // drop relative imports
  .replace(/^export\s+(const|let|function|async function|class)/gm,'$1')
  .replace(/^export\s+default\s+app;?\s*$/gm,'')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm,'');

// external packages, hoisted once
const head = `import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
`;

const schema = rd('src/schema.sql');
const clientHtml = rd('public/index.html');
const icon192 = fs.readFileSync('public/icon-192.png').toString('base64');
const icon512 = fs.readFileSync('public/icon-512.png').toString('base64');
const manifest = rd('public/manifest.webmanifest');
const sw = rd('public/sw.js');

let db = strip(rd('src/db.js'))
  .replace(/^import fs from 'node:fs';\s*$/gm,'')
  .replace(/^import path from 'node:path';\s*$/gm,'')
  .replace(/^import \{ fileURLToPath \}[^\n]*\n/gm,'')
  .replace(/^import pg from 'pg';\s*$/gm,'')
  .replace(/const __dirname[^\n]*\n/,'')
  .replace(/async function migrate\(\)\s*\{[\s\S]*?\n\}/, `async function migrate() {\n  await q(SCHEMA_SQL);\n}`);
let calc = strip(rd('src/calc.js'));
let auth = strip(rd('src/auth.js'))
  .replace(/^import bcrypt from 'bcryptjs';\s*$/gm,'')
  .replace(/^import jwt from 'jsonwebtoken';\s*$/gm,'');
let seed = strip(rd('src/seed.js'));
let server = strip(rd('src/server.js'))
  .replace(/^import [^\n]*from '(express|helmet|cookie-parser|express-rate-limit|node:path|node:url|dotenv\/config)';?\s*$/gm,'')
  .replace(/^import 'dotenv\/config';\s*$/gm,'')
  .replace(/const __dirname[^\n]*\n/,'')
  .replace(/app\.use\(express\.static\([^)]*\)[^;]*;/,'')
  .replace(/res\.sendFile\(path\.join\(__dirname, '\.\.', 'public', 'index\.html'\)\);/,
           `{ res.set('Content-Type','text/html'); res.send(CLIENT_HTML); }`);

const assets = `
const SCHEMA_SQL = ${JSON.stringify(schema)};
const CLIENT_HTML = ${JSON.stringify(clientHtml)};
const MANIFEST = ${JSON.stringify(manifest)};
const SW_JS = ${JSON.stringify(sw)};
const ICON192 = Buffer.from(${JSON.stringify(icon192)}, 'base64');
const ICON512 = Buffer.from(${JSON.stringify(icon512)}, 'base64');
`;

// static routes for the client + PWA files, inserted before the API auth wall
const staticRoutes = `
app.get('/', (req, res) => { res.set('Content-Type', 'text/html'); res.send(CLIENT_HTML); });
app.get('/index.html', (req, res) => { res.set('Content-Type', 'text/html'); res.send(CLIENT_HTML); });
app.get('/manifest.webmanifest', (req, res) => { res.type('application/manifest+json').send(MANIFEST); });
app.get('/sw.js', (req, res) => { res.type('application/javascript').send(SW_JS); });
app.get('/icon-192.png', (req, res) => { res.type('png').send(ICON192); });
app.get('/icon-512.png', (req, res) => { res.type('png').send(ICON512); });
app.get('/icon.png', (req, res) => { res.type('png').send(ICON192); });
`;
server = server.replace("app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });",
  staticRoutes + "\napp.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });");

const out = head + assets + '\n/* ---- db ---- */\n' + db + '\n/* ---- calc ---- */\n' + calc +
  '\n/* ---- auth ---- */\n' + auth + '\n/* ---- seed ---- */\n' + seed + '\n/* ---- server ---- */\n' + server;

fs.mkdirSync('/home/claude/pkg/deploy', { recursive: true });
fs.writeFileSync('/home/claude/pkg/deploy/server.mjs', out);
fs.writeFileSync('/home/claude/pkg/deploy/package.json', JSON.stringify({
  name: 'hiklean-billing', version: '2.1.0', private: true, type: 'module',
  scripts: { start: 'node server.mjs' },
  engines: { node: '>=20' },
  dependencies: {
    express: '^5.1.0', pg: '^8.16.3', bcryptjs: '^3.0.2', jsonwebtoken: '^9.0.2',
    'cookie-parser': '^1.4.7', helmet: '^8.1.0', 'express-rate-limit': '^8.1.0', dotenv: '^17.2.3'
  }
}, null, 2));
console.log('bundle', (out.length/1024).toFixed(0)+'KB');
