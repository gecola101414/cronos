import { WorkGroup, Dependency, DependencyType } from '../types';
import { addDays, format, parse, differenceInDays } from 'date-fns';

/**
 * Calculates the new start date for a successor task based on its predecessor and dependency rule.
 * @param predecessor The task that comes before.
 * @param successor The task that comes after.
 * @param dependency The dependency linking the two tasks.
 * @returns The calculated new start date for the successor.
 */
function calculateNewStartDate(predecessor: WorkGroup, successor: WorkGroup, dependency: Dependency): Date {
  const predecessorStartDate = parse(predecessor.startDate, 'yyyy-MM-dd', new Date());
  const predecessorEndDate = parse(predecessor.endDate, 'yyyy-MM-dd', new Date());
  const lagInDays = dependency.lag || 0;

  switch (dependency.type) {
    case 'FS': // Finish-to-Start
      // Successor starts `lag` days after the predecessor finishes.
      return addDays(predecessorEndDate, lagInDays + 1);
    case 'SS': // Start-to-Start
      // Successor starts `lag` days after the predecessor starts.
      return addDays(predecessorStartDate, lagInDays);
    case 'FF': // Finish-to-Finish
      // Successor finishes `lag` days after the predecessor finishes.
      // We calculate the end date first, then derive the start date.
      const newEndDate = addDays(predecessorEndDate, lagInDays);
      return addDays(newEndDate, -(successor.duration - 1));
    case 'SF': // Start-to-Finish
      // Successor finishes `lag` days after the predecessor starts.
      const sfNewEndDate = addDays(predecessorStartDate, lagInDays);
      return addDays(sfNewEndDate, -(successor.duration - 1));
    default:
      // Default to FS for unknown types.
      return addDays(predecessorEndDate, lagInDays + 1);
  }
}

/**
 * Recalculates the entire project schedule based on dependencies, starting from a task that was just updated.
 * It performs a forward pass, updating all successor tasks down the chain.
 * @param allWorkGroups The complete list of work groups in the project.
 * @param allDependencies The complete list of dependencies in the project.
 * @param updatedGroupId The ID of the task that was manually changed by the user.
 * @returns A new array of WorkGroup objects with updated start and end dates.
 */
export function recalculateSchedule(
  allWorkGroups: WorkGroup[],
  allDependencies: Dependency[],
  updatedGroupId: string
): WorkGroup[] {
  const workGroupsMap = new Map<string, WorkGroup>(allWorkGroups.map(wg => [wg.id, { ...wg }]));
  const successorMap = new Map<string, Dependency[]>();

  for (const dep of allDependencies) {
    if (!successorMap.has(dep.from)) {
      successorMap.set(dep.from, []);
    }
    successorMap.get(dep.from)!.push(dep);
  }
  
  const queue: string[] = [updatedGroupId];
  const processed = new Set<string>(); // Prevents infinite loops in case of cycles

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    if (processed.has(currentId)) continue;
    processed.add(currentId);

    const predecessor = workGroupsMap.get(currentId);
    if (!predecessor) continue;
    
    const successors = successorMap.get(currentId);
    if (!successors) continue;

    for (const dep of successors) {
      const successor = workGroupsMap.get(dep.to);
      if (!successor) continue;

      const newStartDate = calculateNewStartDate(predecessor, successor, dep);
      const newStartDateString = format(newStartDate, 'yyyy-MM-dd');

      // Only update and propagate if the date has actually changed
      if (successor.startDate !== newStartDateString) {
        const newEndDate = addDays(newStartDate, successor.duration - 1);
        const newEndDateString = format(newEndDate, 'yyyy-MM-dd');
        
        successor.startDate = newStartDateString;
        successor.endDate = newEndDateString;
        
        workGroupsMap.set(successor.id, successor);
        queue.push(successor.id);
      }
    }
  }

  return Array.from(workGroupsMap.values());
}
