const mode = process.argv[2];
if (mode === 'timeout') {
  setTimeout(() => {}, 60_000);
} else if (mode === 'flood') {
  process.stdout.write('x'.repeat(128 * 1024));
} else {
  process.exitCode = 2;
}
