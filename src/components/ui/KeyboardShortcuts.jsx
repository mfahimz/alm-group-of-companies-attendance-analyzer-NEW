import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export function useKeyboardShortcuts({ onOpenSearch }) {
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyPress = (e) => {
            // Cmd/Ctrl + K for search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onOpenSearch();
            }

            // Cmd/Ctrl + Shift + shortcuts
            if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'd':
                        e.preventDefault();
                        navigate(createPageUrl('Dashboard'));
                        break;
                    case 'p':
                        e.preventDefault();
                        navigate(createPageUrl('Projects'));
                        break;
                    case 'e':
                        e.preventDefault();
                        navigate(createPageUrl('Employees'));
                        break;
                    case 'r':
                        e.preventDefault();
                        navigate(createPageUrl('Reports'));
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [navigate, onOpenSearch]);
}

export function KeyboardShortcutsHelp() {
    const shortcuts = [
        { key: '⌘/Ctrl + K', action: 'Open search' },
        { key: '⌘/Ctrl + Shift + D', action: 'Go to Dashboard' },
        { key: '⌘/Ctrl + Shift + P', action: 'Go to Projects' },
        { key: '⌘/Ctrl + Shift + E', action: 'Go to Employees' },
        { key: '⌘/Ctrl + Shift + R', action: 'Go to Reports' }
    ];

    return (
        <div className="space-y-2">
            {shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm text-slate-700">{shortcut.action}</span>
                    <kbd className="px-2 py-1 text-xs bg-slate-100 rounded border">{shortcut.key}</kbd>
                </div>
            ))}
        </div>
    );
}