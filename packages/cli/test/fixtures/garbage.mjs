// A fake implementation that writes something other than JSON Lines.
for await (const _chunk of process.stdin);
process.stdout.write("hello world\nthis is not JSON\n");
