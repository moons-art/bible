const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const replacement = fs.readFileSync('src/modals.txt', 'utf8');

const firstIdx = content.indexOf('      {/* Upload Modal */}');
const lastIdx = content.indexOf('      {/* Settings Modal */}');

if (firstIdx !== -1 && lastIdx !== -1) {
  const newContent = content.substring(0, firstIdx) + replacement + '\n' + content.substring(lastIdx);
  fs.writeFileSync('src/App.tsx', newContent);
  console.log('App.tsx repaired successfully');
} else {
  console.log('Error: Could not find indices');
}
