/**
 * ChangeLog Domain Rules
 * Portable business logic for filtering, sorting, and parsing developer changes.
 */

export const PRIORITIES = ["High", "Medium", "Low"];
export const STATUSES = ["Backlog", "Prompt Drafting", "AI Generating", "Testing", "Deployed"];
export const CATEGORIES = ["UI/UX", "Backend Logic", "Database/Schema"];
export const SECTIONS = STATUSES;

export const PRIORITY_WEIGHTS = {
    'High': 3,
    'Medium': 2,
    'Low': 1
};

export const STATUS_WEIGHTS = {
    'Backlog': 1,
    'Prompt Drafting': 2,
    'AI Generating': 3,
    'Testing': 4,
    'Deployed': 5
};

/**
 * Sorts an array of change log items based on status, completion, and a dynamic key.
 */
export const sortChangeLogs = (items, sortConfig) => {
    return [...items].sort((a, b) => {
        // Rule 1: 'Deployed' tasks are pinned to the bottom
        const isADeployed = a.status === 'Deployed';
        const isBDeployed = b.status === 'Deployed';

        if (isADeployed && !isBDeployed) return 1;
        if (!isADeployed && isBDeployed) return -1;

        // Rule 2: Normal sorting logic for non-completed items
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'priority') {
            valA = PRIORITY_WEIGHTS[valA] || 0;
            valB = PRIORITY_WEIGHTS[valB] || 0;
        } else if (sortConfig.key === 'status') {
            valA = STATUS_WEIGHTS[valA] || 0;
            valB = STATUS_WEIGHTS[valB] || 0;
        } else {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
};

/**
 * Parses a "Quick Add" string into a change log object.
 * Format: "Description #Priority @Status [Section]"
 * Example: "Fix login bug #Critical @In Progress [Changes]"
 */
export const parseQuickAdd = (input) => {
    let description = input;
    let priority = "Medium";
    let status = "Backlog";
    let section = "Backlog";

    // Extract Priority (#)
    const priorityMatch = description.match(/#(\w+)/);
    if (priorityMatch) {
        const p = priorityMatch[1].charAt(0).toUpperCase() + priorityMatch[1].slice(1).toLowerCase();
        if (PRIORITIES.includes(p)) priority = p;
        description = description.replace(priorityMatch[0], '').trim();
    }

    // Extract Status (@)
    const statusMatch = description.match(/@([\w\s]+)/);
    if (statusMatch) {
        const s = statusMatch[1].trim();
        const matchedStatus = STATUSES.find(st => st.toLowerCase() === s.toLowerCase());
        if (matchedStatus) status = matchedStatus;
        description = description.replace(statusMatch[0], '').trim();
    }

    // Extract Section ([])
    const sectionMatch = description.match(/\[([\w\s]+)\]/);
    if (sectionMatch) {
        const s = sectionMatch[1].trim();
        const matchedSection = SECTIONS.find(sec => sec.toLowerCase() === s.toLowerCase());
        if (matchedSection) section = matchedSection;
        description = description.replace(sectionMatch[0], '').trim();
    }

    return {
        description,
        priority,
        status,
        section_type: section,
        category: 'UI/UX', // default
        title: 'Request' // default
    };
};

/**
 * Calculates Karma points based on change log activity.
 */
export const calculateKarma = (items) => {
    const completedCount = items.filter(i => i.status === 'Completed').length;
    const criticalCount = items.filter(i => i.priority === 'Critical' && i.status === 'Completed').length;
    
    // 10 points per task, +20 for critical tasks
    return (completedCount * 10) + (criticalCount * 20);
};
