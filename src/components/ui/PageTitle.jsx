import { useEffect } from 'react';

/**
 * Hook to set browser tab title with proper formatting
 * Converts "DepartmentHeadDashboard" to "Department Head Dashboard"
 */
export function usePageTitle(pageName) {
    useEffect(() => {
        if (!pageName) return;
        
        // Convert camelCase/PascalCase to Title Case with spaces
        const formatted = pageName
            // Add space before capital letters
            .replace(/([A-Z])/g, ' $1')
            // Trim leading space
            .trim()
            // Capitalize first letter of each word
            .replace(/\b\w/g, char => char.toUpperCase());
        
        document.title = `${formatted} - ALM Attendance`;
        
        // Cleanup: reset to default on unmount
        return () => {
            document.title = 'ALM Attendance';
        };
    }, [pageName]);
}