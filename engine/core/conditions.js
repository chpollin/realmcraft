// Condition language of engine/schemas/common.js (atoms, all, any, not; depth
// three is enforced by the schema). evalCondition reads the state it is given;
// during a turn that is always the opening state S0.
//
// cx = { state, env, pid, cal, world, isModuleActive(pid, id) }
// Flags are stored under "dev~name" because the log's dotted paths would split "dev.name".

import { idOfRef } from './env.js';
import { activeDevelopments, controlledRegions, kern, peopleIds, relKey, regionTerrain } from './state.js';

const cmpOk = (cmp, v, value) => (cmp === 'gte' ? v >= value : v < value);

export function evalCondition(cond, cx) {
  if (cond == null) return true;
  if (cond.all) return cond.all.every((c) => evalCondition(c, cx));
  if (cond.any) return cond.any.some((c) => evalCondition(c, cx));
  if (cond.not) return !evalCondition(cond.not, cx);
  const people = cx.state.peoples[cx.pid];
  if (!people) return false;
  if ('season' in cond) return cx.cal.season === cond.season;
  if ('res' in cond) return cmpOk(cond.cmp, people.resources?.[cond.res] ?? 0, cond.value);
  if ('meter' in cond) return cmpOk(cond.cmp, people.meters?.[cond.meter] ?? 0, cond.value);
  if ('knows' in cond) return activeDevelopments(cx.state, cx.env, cx.pid).some((d) => idOfRef(d.ref) === cond.knows);
  if ('lebensweise' in cond) return idOfRef(people.lebensweise) === cond.lebensweise;
  if ('module' in cond) return cx.isModuleActive ? cx.isModuleActive(cx.pid, cond.module) : false;
  if ('tagCount' in cond) {
    const n = activeDevelopments(cx.state, cx.env, cx.pid).filter((d) => d.ent.tags.includes(cond.tagCount)).length;
    return cmpOk(cond.cmp, n, cond.value);
  }
  if ('tierCount' in cond) {
    const n = (people.developments?.known ?? []).filter((k) => cx.env.entwicklung(k.ref)?.tier === cond.tierCount).length;
    return cmpOk(cond.cmp, n, cond.value);
  }
  if ('atWar' in cond) {
    const war = peopleIds(cx.state).some((o) => o !== cx.pid && cx.state.relations[relKey(cx.pid, o)]?.atWar === true);
    return war === cond.atWar;
  }
  if ('flag' in cond) return kern(people).flags?.[cond.flag.replace('.', '~')] === true;
  if ('controls' in cond) {
    let regions = controlledRegions(cx.state, cx.pid);
    const terrain = cond.controls?.terrain;
    if (terrain) regions = regions.filter((r) => regionTerrain(cx.world, r) === terrain);
    return cmpOk(cond.cmp, regions.length, cond.value);
  }
  if ('relation' in cond) {
    const others = peopleIds(cx.state).filter((o) => o !== cx.pid);
    const val = (o) => cx.state.relations[relKey(cx.pid, o)]?.value;
    if (cond.relation === '$any') return others.some((o) => val(o) !== undefined && cmpOk(cond.cmp, val(o), cond.value));
    const v = val(cond.relation);
    return v !== undefined && cmpOk(cond.cmp, v, cond.value);
  }
  throw new Error(`evalCondition: unknown atom ${JSON.stringify(cond)}`);
}
