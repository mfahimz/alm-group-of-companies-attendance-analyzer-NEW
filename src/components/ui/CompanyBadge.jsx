import React from 'react';
import { Badge } from '@/components/ui/badge';

const companyColors = {
    'Al Maraghi Auto Repairs': 'bg-blue-100 text-blue-800 border-blue-200',
    'Al Maraghi Automotive': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'Naser Mohsin Auto Parts': 'bg-purple-100 text-purple-800 border-purple-200',
    'Astra Autoparts': 'bg-pink-100 text-pink-800 border-pink-200'
};

export function CompanyBadge({ company, className = '' }) {
    const colorClass = companyColors[company] || 'bg-slate-100 text-slate-800 border-slate-200';
    
    return (
        <Badge 
            variant="outline" 
            className={`${colorClass} font-medium ${className}`}
        >
            {company}
        </Badge>
    );
}