/**
 * Single Source of Truth for Exception Types
 * Used across ExceptionsTab, BulkEditExceptionDialog, EditExceptionDialog, and EditDayRecordDialog.
 */

export const EXCEPTION_TYPES = [
    { 
        value: 'PUBLIC_HOLIDAY', 
        label: 'Public Holiday', 
        categories: ['general', 'filter'] 
    },
    { 
        value: 'SHIFT_OVERRIDE', 
        label: 'Shift Override', 
        categories: ['general', 'filter', 'report_filter', 'day_override'] 
    },
    { 
        value: 'MANUAL_PRESENT', 
        label: 'Manual Present', 
        categories: ['general', 'filter', 'report_filter', 'day_override'] 
    },
    { 
        value: 'WORK_FROM_HOME', 
        label: 'Work From Home', 
        categories: ['general', 'filter', 'report_filter', 'day_override'] 
    },
    { 
        value: 'MANUAL_ABSENT', 
        label: 'Manual Absent', 
        categories: ['general', 'filter', 'report_filter', 'day_override'] 
    },
    { 
        value: 'SICK_LEAVE', 
        label: 'Sick Leave', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'ANNUAL_LEAVE', 
        label: 'Annual Leave / Vacation', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'ALLOWED_MINUTES', 
        label: 'Allowed Minutes (Grace)', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'SKIP_PUNCH', 
        label: 'Skip Specific Punch', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'HALF_DAY_HOLIDAY', 
        label: 'Half-Day Holiday (Natural Calamity)', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'DAY_SWAP', 
        label: 'Day Swap (Weekly Off Override)', 
        categories: ['general', 'filter', 'day_override'] 
    },
    { 
        value: 'MANUAL_LATE', 
        label: 'Manual Late', 
        categories: ['report_filter'], 
        reportOnly: true 
    },
    { 
        value: 'MANUAL_EARLY_CHECKOUT', 
        label: 'Manual Early Checkout', 
        categories: ['report_filter'], 
        reportOnly: true 
    },
    { 
        value: 'MANUAL_OTHER_MINUTES', 
        label: 'Manual Other Minutes', 
        categories: ['report_filter'], 
        reportOnly: true 
    },
    { 
        value: 'GIFT_MINUTES', 
        label: 'Gift Minutes', 
        categories: [], 
        reportOnly: true 
    },
    { 
        value: 'OFF', 
        label: 'Off Day', 
        categories: ['day_override'] 
    },
    { 
        value: 'SKIP_DOUBLE_DEDUCTION', 
        label: 'Skip Double Deduction', 
        categories: ['general', 'filter'] 
    },
    { 
        value: 'CUSTOM', 
        label: 'Custom Type', 
        categories: ['general'] 
    }
];

/**
 * Utility to format exception type values into human-readable labels
 * Example: 'SHIFT_OVERRIDE' -> 'Shift Override'
 */
export const formatExceptionTypeLabel = (value) => {
    if (!value) return '';
    
    // Check if we have a predefined label first
    const typeDef = EXCEPTION_TYPES.find(t => t.value === value);
    if (typeDef && typeDef.label) return typeDef.label;

    // Fallback to automatic formatting
    return value
        .toLowerCase()
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/**
 * Filter exception types by category and user role
 */
export const getFilteredExceptionTypes = (category, isAdmin = false) => {
    return EXCEPTION_TYPES.filter(type => {
        const matchesCategory = category === 'all' || (type.categories && type.categories.includes(category));
        const matchesRole = !type.adminOnly || isAdmin;
        return matchesCategory && matchesRole;
    });
};