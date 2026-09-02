const fs = require('fs');
const path = require('path');

// Function to get all keys from a nested object
function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        keys = keys.concat(getAllKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
  }
  return keys;
}

// Function to get nested value from object using dot notation
function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let value = obj;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return value;
}

/** Top-level JSON sections skipped when comparing (e.g. not synced across locales). */
const EXCLUDED_TOP_LEVEL = new Set([]);

function isKeyExcluded(fullKey) {
  const top = fullKey.split('.')[0];
  return EXCLUDED_TOP_LEVEL.has(top);
}

// Read en.json
const enPath = path.join(__dirname, 'en.json');
const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const enKeys = getAllKeys(enContent).filter((k) => !isKeyExcluded(k));

console.log(`\n📋 Total keys in en.json (excluding ${[...EXCLUDED_TOP_LEVEL].join(', ')}): ${enKeys.length}\n`);

// Get all language files (excluding German and Hebrew)
const localeDir = __dirname;
const files = fs.readdirSync(localeDir).filter(file => 
  file.endsWith('.json') && 
  file !== 'en.json' && 
  file !== 'de.json' && 
  file !== 'he.json'
);

const results = {};

for (const file of files) {
  const langCode = file.replace('.json', '');
  const filePath = path.join(localeDir, file);
  
  try {
    const langContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const missingKeys = [];
    
    for (const key of enKeys) {
      const value = getNestedValue(langContent, key);
      if (value === undefined) {
        missingKeys.push(key);
      }
    }
    
    results[langCode] = {
      file: file,
      missing: missingKeys,
      totalMissing: missingKeys.length,
      coverage: ((enKeys.length - missingKeys.length) / enKeys.length * 100).toFixed(2)
    };
  } catch (error) {
    results[langCode] = {
      file: file,
      error: error.message,
      missing: [],
      totalMissing: 0,
      coverage: '0.00'
    };
  }
}

// Sort by missing count (most missing first)
const sortedResults = Object.entries(results).sort((a, b) => 
  b[1].totalMissing - a[1].totalMissing
);

// Print results
console.log('='.repeat(80));
console.log(
  `🔍 KEY COMPARISON RESULTS (excluding German & Hebrew; sections: ${[...EXCLUDED_TOP_LEVEL].join(', ')})`,
);
console.log('='.repeat(80));

for (const [langCode, data] of sortedResults) {
  console.log(`\n📄 ${langCode.toUpperCase()} (${data.file})`);
  console.log(`   Coverage: ${data.coverage}% | Missing: ${data.totalMissing} keys`);
  
  if (data.error) {
    console.log(`   ❌ Error: ${data.error}`);
  } else if (data.totalMissing > 0) {
    // Group missing keys by top-level section
    const sections = {};
    for (const key of data.missing) {
      const topLevel = key.split('.')[0];
      if (!sections[topLevel]) {
        sections[topLevel] = [];
      }
      sections[topLevel].push(key);
    }
    
    console.log(`\n   Missing keys by section:`);
    for (const [section, keys] of Object.entries(sections).sort((a, b) => 
      b[1].length - a[1].length
    )) {
      console.log(`   • ${section}: ${keys.length} missing`);
      if (keys.length <= 10) {
        keys.forEach(k => console.log(`     - ${k}`));
      } else {
        keys.slice(0, 5).forEach(k => console.log(`     - ${k}`));
        console.log(`     ... and ${keys.length - 5} more`);
      }
    }
  } else {
    console.log(`   ✅ All keys present!`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('✅ Comparison complete!\n');
