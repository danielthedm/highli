// Server-only store accessor — re-exports the SQLite reader from /core so
// route handlers and React Server Components can pull events directly. This
// is the same store the CLI populates; thin client / company mode replaces
// this with /api/me/* fetches in build #11.
import "server-only";

export {
  eventsBetween,
  eventCount,
  getDb,
  getDbPath,
  getSetting,
  setSetting,
  star,
  unstar,
  isStarred,
  listStars,
  archive,
  unarchive,
  isArchived,
  listArchives,
  createManualGroup,
  addToManualGroup,
  removeFromManualGroup,
  deleteManualGroup,
  listManualGroups,
  getManualGroupForEvent,
  getCurrentGoal,
  saveGoal,
  listGoalHistory,
} from "@highli/core/db";
export type { CareerGoal, ManualGroup } from "@highli/core/db";
export type { Event } from "@highli/core/types";
