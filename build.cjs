const fs=require('fs');
const parts=['client/c_css.html','client/c_shell.html','client/c_core.js','client/c_bill.js','client/c_lists.js','client/c_print.js','client/c_admin.js'];
let html=parts.map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\n</script>\n</body>\n</html>\n';
// PWA hooks in <head>
html=html.replace('<title>Dental Billing</title>',
 `<title>Hi-Klean Billing</title>
<meta name="theme-color" content="#0d2b33"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<link rel="manifest" href="/manifest.webmanifest"/>
<link rel="icon" href="/icon.png"/>
<link rel="apple-touch-icon" href="/icon.png"/>`);
html=html.replace('<meta name="viewport" content="width=device-width,initial-scale=1"/>',
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>');
fs.writeFileSync('public/index.html',html);
console.log('public/index.html', (html.length/1024).toFixed(1)+'KB');
