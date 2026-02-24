$ErrorActionPreference = "Stop"

$root="E:\nocomment-isp"
$frontend="$root\frontend"
$backend="$root\backend"
$npm="C:\Program Files\nodejs\npm.cmd"

if (!(Test-Path $frontend)) { throw "frontend missing: $frontend" }
if (!(Test-Path $backend))  { throw "backend missing:  $backend" }
if (!(Test-Path $npm))      { throw "npm missing:      $npm" }

Write-Host "== Frontend: install react-router-dom ==" -ForegroundColor Yellow
cd $frontend
& $npm install react-router-dom

Write-Host "== Backend: create data/users.json + server.js ==" -ForegroundColor Yellow
cd $backend
if (!(Test-Path "data")) { New-Item -ItemType Directory "data" | Out-Null }

# create bcrypt hash using existing bcryptjs dependency (already installed)
$hash = node -e "const b=require('bcryptjs'); process.stdout.write(b.hashSync('Admin@12345',10));"

@"
[
  {
    "id": 1,
    "email": "admin@nocomment.local",
    "passwordHash": "$hash",
    "role": "admin"
  }
]
"@ | Set-Content -Encoding UTF8 "data\users.json"

if (!(Test-Path ".env")) {
@"
PORT=8080
JWT_SECRET=CHANGE_ME_NOW
"@ | Set-Content -Encoding UTF8 ".env"
}

@"
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const PORT = process.env.PORT || 8080;
const SECRET = process.env.JWT_SECRET || 'CHANGE_ME_NOW';

function loadUsers() {
  return JSON.parse(fs.readFileSync('data/users.json','utf8'));
}

function auth(req,res,next){
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ ok:false, message:'Missing token' });
  try { req.user = jwt.verify(h.slice(7), SECRET); next(); }
  catch { return res.status(401).json({ ok:false, message:'Invalid token' }); }
}

app.get('/health', (req,res)=> res.json({ ok:true, service:'nocomment-isp-backend' }));

app.post('/auth/login', async (req,res)=>{
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok:false, message:'Missing email/password' });

  const users = loadUsers();
  const user = users.find(u => String(u.email).toLowerCase() === String(email).trim().toLowerCase());
  if (!user) return res.status(401).json({ ok:false, message:'Invalid credentials' });

  const ok = await bcrypt.compare(String(password), String(user.passwordHash));
  if (!ok) return res.status(401).json({ ok:false, message:'Invalid credentials' });

  const token = jwt.sign({ sub:user.id, email:user.email, role:user.role }, SECRET, { expiresIn:'2h' });
  res.json({ ok:true, token });
});

app.get('/auth/me', auth, (req,res)=> res.json({ ok:true, user:req.user }));

app.listen(PORT, ()=> console.log('Backend running on http://localhost:' + PORT));
"@ | Set-Content -Encoding UTF8 "server.js"

Write-Host "DONE  setup-all.ps1 created." -ForegroundColor Green
