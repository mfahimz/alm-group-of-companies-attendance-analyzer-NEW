/**
 * Reusable AED (UAE Dirham) Currency Symbol Icon
 * Use this component anywhere a currency symbol is needed in the application.
 * 
 * Usage:
 *   import AEDIcon from '@/components/ui/AEDIcon';
 *   <AEDIcon className="w-4 h-4" />
 */

const AED_SYMBOL_URL = "https://media.base44.com/images/public/69230930412bf36e97f1ff37/605227dfc_aed-symbol.png";

export default function AEDIcon({ className = "w-4 h-4", style = {} }) {
    return (
        <img 
            src={AED_SYMBOL_URL} 
            alt="AED" 
            className={className}
            style={{ 
                objectFit: 'contain',
                ...style 
            }}
        />
    );
}

// Export the URL for cases where direct image src is needed
export const AED_ICON_URL = AED_SYMBOL_URL;