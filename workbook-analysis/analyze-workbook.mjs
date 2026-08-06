import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workbookPath = decodeURIComponent(new URL('../STFC-Officers-Tool-reference.xlsx', import.meta.url).pathname).replace(/^\/(.:\/)/, '$1');
const targetSheet = process.argv[2] ?? 'sheets';
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

async function print(label, options) {
  const result = await workbook.inspect(options);
  console.log(`\n===== ${label} =====`);
  console.log(result.ndjson);
}

if (targetSheet === 'sheets') {
  await print('sheets', { kind: 'sheet', include: 'id,name', maxChars: 10000 });
  await print('defined names', { kind: 'definedName', maxChars: 10000 });
} else {
  const ranges = {
    Main: 'A1:P24',
    Roster: 'A1:AZ36',
    'All Docks': 'A1:AZ42',
    'Saved Setups': 'A1:AZ36',
    'Pre-Set Crews': 'A1:AZ40',
    Ships: 'A1:AZ36',
    'ATA Overview': 'A1:AZ38',
    'ATA Analysis': 'A1:AZ38',
    'ATA Planning': 'A1:AZ42',
  };
  const range = ranges[targetSheet] ?? 'A1:Z36';
  await print(`${targetSheet} region`, {
    kind: 'region', sheetId: targetSheet, range, maxChars: 10000,
  });
  await print(`${targetSheet} formulas`, {
    kind: 'formula', sheetId: targetSheet, range, maxChars: 9000,
    options: { maxResults: 100 },
  });
  await print(`${targetSheet} styles`, {
    kind: 'computedStyle', sheetId: targetSheet, range: range.replace(/:[A-Z]+\d+$/, ':P24'), maxChars: 6000,
  });
}
