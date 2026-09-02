const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function ensure(realName, exampleName) {
  const real = path.join(root, realName);
  const example = path.join(root, exampleName);
  if (fs.existsSync(real)) return;
  if (!fs.existsSync(example)) {
    throw new Error(`Missing ${realName} and ${exampleName}`);
  }
  fs.copyFileSync(example, real);
  console.log(`Copied ${exampleName} -> ${realName} for the native build`);
}

ensure('GoogleService-Info.plist', 'GoogleService-Info.plist.example');
ensure('google-services.json', 'google-services.json.example');
