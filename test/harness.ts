/* A test is a list of assertions that prints what broke and exits non-zero. */

let failures = 0;

export function check(name: string, got: unknown, want: unknown): void {
  if (String(got) === String(want)) return;
  console.log(`  FAIL ${name}\n    got  ${got}\n    want ${want}`);
  failures++;
}

export function ok(name: string, condition: boolean): void {
  if (condition) return;
  console.log(`  FAIL ${name}`);
  failures++;
}

export function report(): void {
  if (failures === 0) {
    console.log("  all pass");
    return;
  }
  console.log(`  ${failures} failed`);
  process.exitCode = 1;
}
