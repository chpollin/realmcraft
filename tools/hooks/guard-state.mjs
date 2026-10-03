// PreToolUse guard of the game harness (docs/Harness.md, Agentenvertrag
// section Hooks). Only the kernel writes a campaign folder; agents write
// exactly their proposal file agents/proposals/<proposalId>.json.
//
// Write, Edit, MultiEdit, NotebookEdit: deny any target under
// campaigns/<cid>/ except a proposal file; for a RealmCraft subagent (rc-*)
// additionally deny every target outside its own proposals.
// Bash, PowerShell: deny command segments that write, move or delete under
// campaigns/ unless the segment invokes the kernel CLI or a harness helper.
//
// Every other event exits 0 without output, so developer sessions in this
// repository and every other project see no effect. The Bash check is a
// heuristic; the reliable guard is the kernel's tamper check on state.json.

import { agentOfProposalId, agentOfType, campaignPath, proposalIdOfRel, readHookInput, subagentTypeOf } from '../harness/lib.mjs';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  })}\n`);
  process.exit(0);
}

function checkFile(input) {
  const ti = input.tool_input ?? {};
  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  const role = agentOfType(subagentTypeOf(input));
  const loc = campaignPath(target, input.cwd);
  if (!loc) {
    if (role && typeof target === 'string') deny(`RealmCraft agent ${role} may only write its proposal file agents/proposals/<proposalId>.json named in its task, not ${target}.`);
    return;
  }
  const pid = proposalIdOfRel(loc.rel);
  if (!pid) {
    deny(`campaigns/${loc.cid ?? ''}${loc.rel ? `/${loc.rel}` : ''} belongs to the RealmCraft kernel. Agents write only agents/proposals/<proposalId>.json; everything else changes through node engine/cli.mjs.`);
  }
  if (role && agentOfProposalId(pid) !== role) {
    deny(`RealmCraft agent ${role} may not write proposal ${pid}; its proposal id starts with "${role}."`);
  }
}

// Writing commands of POSIX shells, PowerShell (with common aliases) and cmd,
// matched at command position so a search for the word "move" stays allowed;
// file functions of Node or Python one-liners and find -delete anywhere.
const WRITE_CMD = /^\s*[({]?\s*(?:sudo\s+|xargs\s+(?:-\S+\s+)*)?(?:rm|rmdir|mv|cp|tee|touch|truncate|dd|install|ln|chmod|unlink|sed\s(?:.*\s)?-i|perl\s+-\S*i|set-content|add-content|out-file|copy-item|move-item|remove-item|new-item|rename-item|clear-content|sc|ac|ni|cpi|mi|ri|del|erase|copy|move|ren)(?:\s|$)/i;
const WRITE_FN = /\b(?:writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|copyFileSync|cpSync|writeFile|appendFile|open\s*\([^)]*,\s*['"][wa])|\s-delete\b|-exec\s+rm\b/i;
const REDIRECT_INTO = />>?\s*["']?[^\s"'|;&]*campaigns[\\/]/i;
const KERNEL_CALL = /^\s*(?:[A-Z_]+=\S+\s+)*node(?:\.exe)?\s+(?:"[^"]*?|'[^']*?|\S*?)(?:engine[\\/]cli\.mjs|tools[\\/]harness[\\/][a-z-]+\.mjs)\b/i;

function checkShell(input) {
  const cmd = String(input.tool_input?.command ?? '');
  if (!/campaigns[\\/]/i.test(cmd)) return;
  for (const seg of cmd.split(/&&|\|\||;|\r?\n|\|/)) {
    if (!/campaigns[\\/]/i.test(seg)) continue;
    // examples/campaigns/ is developer territory, as in campaignPath().
    const live = seg.replace(/examples[\\/]campaigns[\\/]/gi, '');
    if (!/campaigns[\\/]/i.test(live)) continue;
    if (REDIRECT_INTO.test(live)) deny('Redirecting output into campaigns/ is not allowed; the kernel writes campaign files through node engine/cli.mjs.');
    if ((WRITE_CMD.test(live) || WRITE_FN.test(live)) && !KERNEL_CALL.test(seg)) {
      deny('This command would write, move or delete files under campaigns/, which only the RealmCraft kernel does. Use node engine/cli.mjs (or tools/harness/*.mjs); agents write their proposal with the Write tool.');
    }
  }
}

const input = await readHookInput();
if (input) {
  if (FILE_TOOLS.has(input.tool_name)) checkFile(input);
  else if (SHELL_TOOLS.has(input.tool_name)) checkShell(input);
}
process.exit(0);
