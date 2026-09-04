#!/bin/bash
# Reset the database, start the server, set the admin password, run a suite.
# Several suites assume a FRESH database and will report false failures against
# one that already holds their fixtures.
SUITE="$1"
if [ -f /tmp/hk-srv.pid ]; then kill "$(cat /tmp/hk-srv.pid)" 2>/dev/null; sleep 2; fi
su postgres -c "dropdb --if-exists --force hiklean; createdb hiklean" >/dev/null || exit 1
cd /tmp/hk || exit 1
PORT=3000 DATABASE_URL='postgres://postgres@/hiklean?host=/var/run/postgresql' \
 JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
 ADMIN_USER=admin ADMIN_PASSWORD='Test@1234' \
 setsid node src/server.js > /tmp/srv.log 2>&1 </dev/null &
echo $! > /tmp/hk-srv.pid
for i in $(seq 1 40); do curl -sf http://127.0.0.1:3000/api/health >/dev/null && break; sleep 1; done
if [ "$2" != "--virgin" ]; then
node -e "
const http=require('http');
function req(p,m,b,c){return new Promise((res,rej)=>{const d=b?JSON.stringify(b):null;const r=http.request('http://127.0.0.1:3000'+p,{method:m||'GET',headers:{'Content-Type':'application/json','X-Requested-With':'hk',...(c?{Cookie:c}:{}),...(d?{'Content-Length':Buffer.byteLength(d)}:{})}},x=>{let s='';x.on('data',k=>s+=k);x.on('end',()=>res({status:x.statusCode,headers:x.headers,body:s?JSON.parse(s):null}))});r.on('error',rej);if(d)r.write(d);r.end()})}
(async()=>{const r=await req('/api/auth/login','POST',{username:'admin',password:'Test@1234'});
const ck=(r.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
await req('/api/auth/password','POST',{current:'Test@1234',next:'Test@12345'},ck);})()"
fi
node "$SUITE"
