import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumb({ items }) {
    return (
        <nav className="flex items-center space-x-1 text-sm text-slate-500 mb-4">
            <Link 
                to={createPageUrl('Dashboard')} 
                className="flex items-center hover:text-indigo-600 transition-colors"
            >
                <Home className="w-4 h-4" />
            </Link>
            {items.map((item, index) => (
                <div key={index} className="flex items-center space-x-1">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                    {item.href ? (
                        <Link 
                            to={createPageUrl(item.href)} 
                            className="hover:text-indigo-600 transition-colors"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-slate-900 font-medium">{item.label}</span>
                    )}
                </div>
            ))}
        </nav>
    );
}