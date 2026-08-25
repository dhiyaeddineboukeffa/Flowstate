const fs = require('fs'); let c = fs.readFileSync('src/lib/actions.ts', 'utf8'); c = c.replace(/revalidatePath\([^)]+\);?/g, ''); fs.writeFileSync('src/lib/actions.ts', c); 
