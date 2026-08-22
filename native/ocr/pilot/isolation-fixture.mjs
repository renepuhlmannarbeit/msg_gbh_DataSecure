const mode = process.argv[2];
if (mode === 'timeout') {
  setTimeout(() => {}, 60_000);
} else if (mode === 'flood') {
  process.stdout.write('x'.repeat(128 * 1024));
} else if (mode === 'memory') {
  const allocations = [];
  setInterval(() => {
    const value = Buffer.allocUnsafe(32 * 1024 * 1024);
    value.fill(0x5a);
    allocations.push(value);
  }, 1);
} else if (mode === 'cpu') {
  for (;;) Math.sqrt(Math.random());
} else {
  process.exitCode = 2;
}
