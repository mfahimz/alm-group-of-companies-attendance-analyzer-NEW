import InlineEditableCell from './InlineEditableCell';

/**
 * DeductibleCell
 * Displays: max(0, deductible_minutes - ramadan_gift_minutes)
 * DB always stores raw deductible (grace already applied, gift NOT subtracted).
 * This component subtracts gift at render time.
 */
export default function DeductibleCell({ result, isEditable, onSave, isFinalized }) {
    const rawDeductible = Math.max(0, result.manual_deductible_minutes ?? result.deductible_minutes ?? 0);
    const giftMins = Math.max(0, result.ramadan_gift_minutes || 0);
    const displayDeductible = Math.max(0, rawDeductible - giftMins);

    return (
        <div className="flex flex-col">
            <InlineEditableCell
                value={displayDeductible}
                onSave={(newDisplay) => {
                    // Store back as raw: add gift mins back so DB always holds the raw value
                    const storeValue = Math.max(0, newDisplay) + giftMins;
                    onSave(storeValue);
                }}
                isEditable={isEditable}
                className={`font-bold ${displayDeductible > 0 ? 'text-red-600' : 'text-green-600'}`}
            />
            {isFinalized && (
                <span className="text-[10px] text-purple-600">Finalized</span>
            )}
        </div>
    );
}