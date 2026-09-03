const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function ensure(realName, exampleName, envVar) {
  const real = path.join(root, realName);
  const fromEnv = (process.env[envVar] || '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    fs.copyFileSync(fromEnv, real);
    console.log(`Copied $${envVar} -> ${realName} for the native build`);
    return;
  }
  if (fs.existsSync(real)) return;
  const example = path.join(root, exampleName);
  if (!fs.existsSync(example)) {
    throw new Error(`Missing ${realName} and ${exampleName}`);
  }
  fs.copyFileSync(example, real);
  console.log(`Copied ${exampleName} -> ${realName} for the native build`);
}

ensure('GoogleService-Info.plist', 'GoogleService-Info.plist.example', 'GOOGLE_SERVICES_PLIST');
ensure('google-services.json', 'google-services.json.example', 'GOOGLE_SERVICES_JSON');
