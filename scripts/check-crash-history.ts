/** Historical-simulator checks; filled in with the simulator. */
export function runSection(check: (name: string, cond: boolean) => void) {
  check('history section loaded', true);
}
