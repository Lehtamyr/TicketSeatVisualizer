const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/actions/saveLayout.ts');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const layoutId = await prisma.$transaction(',
  `console.log('[saveLayoutAction DEBUG] received input sections:', JSON.stringify(input.sections, null, 2));\n  const layoutId = await prisma.$transaction(`
);

fs.writeFileSync(file, code);
