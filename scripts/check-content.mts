import { checkEntries } from "../src/content/load";

const { entries, errors } = await checkEntries();
if (errors.length) {
  for (const e of errors) console.error(`${e.file}: ${e.message}`);
  console.error(`${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`${entries.length} entries OK`);
