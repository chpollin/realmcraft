// Kernel issue codes (labour, restricted, tamper, idle_labour) are listed in
// engine/core/issues.js like every other code, so kissue is the plain issue
// builder. It stays as the kernel's entry point so callers need not change.

import { issue } from './issues.js';

export const kissue = issue;

/** Bare code of an issue; strips the "kern." prefix older journals and reports may still carry. */
export const bareCode = (i) => (i.code.startsWith('kern.') ? i.code.slice(5) : i.code);
