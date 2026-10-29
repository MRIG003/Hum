import { REACTIONS } from '../server/meeting.js';

// Reactions only work while the floor is open. Tests that only need "someone reacted" open a
// long floor directly (without the side effects of openTheFloor) and start a fresh one when the
// same person reacts with the same emoji again.
export const floorReact = (meeting, pid, kind) => {
  const p = meeting.participants.get(pid);
  const used = meeting.nudge && p?.floorReactions?.floorId === meeting.nudge.id && p.floorReactions.kinds.includes(kind);
  if (!meeting.nudge || used) {
    meeting.nudge = { id: `t${Math.random().toString(36).slice(2, 8)}`, until: Number.MAX_SAFE_INTEGER, counts: Object.fromEntries(REACTIONS.map((k) => [k, 0])) };
  }
  meeting.react(pid, kind);
};
