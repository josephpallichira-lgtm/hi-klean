const fs=require('fs');
const parts=['client/c_css.html','client/c_shell.html','client/c_core.js','client/c_bill.js','client/c_lists.js','client/c_print.js','client/c_admin.js'];
const logo=fs.readFileSync('/home/claude/build/logo_b64.txt','utf8').trim();
const procs=JSON.parse(fs.readFileSync('/tmp/procs.json','utf8'));
let html=parts.map(p=>fs.readFileSync(p,'utf8')).join('\n');
html=html.replace('<title>Dental Billing</title>',
 `<title>Hi-Klean Billing — DEMO</title>
<meta name="theme-color" content="#0d2b33"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>`);
// demo seed data goes in before the app boots
const seed=`window.__LOCAL_ONLY__=true;window.__DEMO_LOGO__=${JSON.stringify(logo)};window.__DEMO_PROCS__=${JSON.stringify(procs)};\n`;
// the mock must exist before the app boots
const demo=fs.readFileSync('client/c_demo.js','utf8');
html=html.replace('<script>\n',()=>'<script>\n'+seed+demo+'\n');
html+='\n</script>\n</body>\n</html>\n';
fs.writeFileSync('/home/claude/pkg/Hi-Klean-Billing-DEMO.html',html);
console.log('demo built', (html.length/1024).toFixed(1)+'KB');
