// A fake implementation that crashes while reading the scenario.
for await (const _chunk of process.stdin);
console.error("reading the scenario");
console.error("TypeError: Cannot read properties of undefined (reading 'stays')");
process.exit(3);
