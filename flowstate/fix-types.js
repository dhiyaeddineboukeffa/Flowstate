const fs = require('fs');

let c1 = fs.readFileSync('src/app/api/pomodoro/route.ts', 'utf8');
c1 = c1.replace(/collection\("User"\)/g, 'collection<any>("User")');
fs.writeFileSync('src/app/api/pomodoro/route.ts', c1);

let c2 = fs.readFileSync('src/lib/actions.ts', 'utf8');
c2 = c2.replace(/collection\("([^"]+)"\)/g, 'collection<any>("$1")');
fs.writeFileSync('src/lib/actions.ts', c2);
