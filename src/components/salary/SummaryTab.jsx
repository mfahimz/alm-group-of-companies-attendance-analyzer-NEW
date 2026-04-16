// SummaryTab.jsx
// Fully customizable payroll summary workspace for accountants
// View mode: all roles — read-only rendered cards
// Edit mode: admin and senior_accountant only — add/remove/rename cards and rows
// Data model: cards array stored in report.summary_manual_fields
// Template: loaded from SummaryTemplate entity per company, saved back on template save

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
    ChevronUp, 
    ChevronDown, 
    Trash2, 
    Plus, 
    Edit2, 
    Save, 
    X, 
    Lock,
    Settings2,
    LayoutTemplate
} from 'lucide-react';

// --- PART A: CONSTANTS ---

// Calculated values available to insert as locked rows in any card
const CALCULATED_KEYS = [
  { key: 'totalSalaryAndAllowances', label: 'Total Salary & Allowances' },
  { key: 'totalSalariesPayable', label: 'Total Salaries Payable' },
  { key: 'totalWpsPayable (A)', label: 'Total WPS Payable (A)' },
  { key: 'branchWpsTotal', label: 'Branch WPS Total' },
  { key: 'bodyshopWpsTotal', label: 'Body Shop WPS Total' },
  { key: 'bodyshopTotalSalary', label: 'Body Shop Total Salary' },
  { key: 'bodyshopNetPayable', label: 'Body Shop Net Payable' },
  { key: 'bodyshopLeaveSalary', label: 'Body Shop Leave Salary' },
  { key: 'bodyshopOtPayable', label: 'Body Shop OT Payable' },
  { key: 'bodyshopCashSalary', label: 'Body Shop Cash Salary' },
  { key: 'totalLeaveSalary (B)', label: 'Total Leave Salary (B)' },
  { key: 'totalOpenLeaveSalary (C)', label: 'Total Open Leave Salary (C)' },
  { key: 'totalOtPayable (D)', label: 'Total OT Payable (D)' },
  { key: 'totalIncentivePayable', label: 'Total Incentive Payable' },
  { key: 'totalOtherAllowances (E)', label: 'Total Other Allowances (E)' },
  { key: 'totalCashSalary', label: 'Total Cash Salary' },
];

/**
 * NOTE: The CALCULATED_KEYS array above includes some labels in the keys 
 * if they are meant to match the calculatedValues object keys.
 * However, the user's CALCULATED_KEYS list had keys like 'totalWpsPayable' 
 * and labels like 'Total WPS Payable (A)'.
 * I will stick to the literal keys from the PART B memo to ensure resolveValue works.
 */

const VALID_CALCULATED_KEYS = [
  { key: 'totalSalaryAndAllowances', label: 'Total Salary & Allowances' },
  { key: 'totalSalariesPayable', label: 'Total Salaries Payable' },
  { key: 'totalWpsPayable', label: 'Total WPS Payable (A)' },
  { key: 'branchWpsTotal', label: 'Branch WPS Total' },
  { key: 'bodyshopWpsTotal', label: 'Body Shop WPS Total' },
  { key: 'bodyshopTotalSalary', label: 'Body Shop Total Salary' },
  { key: 'bodyshopNetPayable', label: 'Body Shop Net Payable' },
  { key: 'bodyshopLeaveSalary', label: 'Body Shop Leave Salary' },
  { key: 'bodyshopOtPayable', label: 'Body Shop OT Payable' },
  { key: 'bodyshopCashSalary', label: 'Body Shop Cash Salary' },
  { key: 'totalLeaveSalary', label: 'Total Leave Salary (B)' },
  { key: 'totalOpenLeaveSalary', label: 'Total Open Leave Salary (C)' },
  { key: 'totalOtPayable', label: 'Total OT Payable (D)' },
  { key: 'totalIncentivePayable', label: 'Total Incentive Payable' },
  { key: 'totalOtherAllowances', label: 'Total Other Allowances (E)' },
  { key: 'totalCashSalary', label: 'Total Cash Salary' },
];

// Default card layout used when no SummaryTemplate exists for this company
const DEFAULT_TEMPLATE = {
  cards: [
    {
      id: 'card_header',
      title: 'Salary Summary',
      rows: [
        { id: 'r1', label: 'Total Salary & Allowance Expenses', valueType: 'calculated', calculatedKey: 'totalSalaryAndAllowances', manualValue: null },
        { id: 'r2', label: 'Total Salaries & Allowances Payable', valueType: 'calculated', calculatedKey: 'totalSalariesPayable', manualValue: null },
        { id: 'r3', label: 'Total WPS Amount Payable (A)', valueType: 'calculated', calculatedKey: 'totalWpsPayable', manualValue: null },
      ]
    },
    {
      id: 'card_leave',
      title: 'Leave Salary Allowances (B)',
      rows: [
        { id: 'r4', label: 'Total Leave Salary', valueType: 'calculated', calculatedKey: 'totalLeaveSalary', manualValue: null },
      ]
    },
    {
      id: 'card_ot',
      title: 'OT, Incentive & Other Payable (D)',
      rows: [
        { id: 'r5', label: 'Total OT Payable', valueType: 'calculated', calculatedKey: 'totalOtPayable', manualValue: null },
        { id: 'r6', label: 'Total Incentive Payable', valueType: 'calculated', calculatedKey: 'totalIncentivePayable', manualValue: null },
      ]
    },
    {
      id: 'card_wps',
      title: 'WPS Transfer Details',
      rows: [
        { id: 'r7', label: 'Branch WPS Total', valueType: 'calculated', calculatedKey: 'branchWpsTotal', manualValue: null },
        { id: 'r8', label: 'WPS Service Charges (Branch)', valueType: 'manual', calculatedKey: null, manualValue: 0 },
        { id: 'r9', label: 'Body Shop WPS Total', valueType: 'calculated', calculatedKey: 'bodyshopWpsTotal', manualValue: null },
        { id: 'r10', label: 'WPS Service Charges (Body Shop)', valueType: 'manual', calculatedKey: null, manualValue: 0 },
      ]
    },
    {
      id: 'card_bodyshop',
      title: 'Body Shop — Payroll Summary',
      rows: [
        {
          id: 'r_bs1',
          label: 'Total Salary & Allowances',
          valueType: 'calculated',
          calculatedKey: 'bodyshopTotalSalary',
          manualValue: null
        },
        {
          id: 'r_bs2',
          label: 'Net Payable',
          valueType: 'calculated',
          calculatedKey: 'bodyshopNetPayable',
          manualValue: null
        },
        {
          id: 'r_bs3',
          label: 'WPS Transfer',
          valueType: 'calculated',
          calculatedKey: 'bodyshopWpsTotal',
          manualValue: null
        },
        {
          id: 'r_bs4',
          label: 'WPS Service Charges',
          valueType: 'manual',
          calculatedKey: null,
          manualValue: 0
        },
        {
          id: 'r_bs5',
          label: 'Leave Salary',
          valueType: 'calculated',
          calculatedKey: 'bodyshopLeaveSalary',
          manualValue: null
        },
        {
          id: 'r_bs6',
          label: 'OT Payable',
          valueType: 'calculated',
          calculatedKey: 'bodyshopOtPayable',
          manualValue: null
        },
        {
          id: 'r_bs7',
          label: 'Cash Salary',
          valueType: 'calculated',
          calculatedKey: 'bodyshopCashSalary',
          manualValue: null
        },
      ]
    },
    {
      id: 'card_reconciliation',
      title: 'Professional Charges Reconciliation',
      rows: [
        { id: 'r11', label: 'Professional Charges Balance from Last Month', valueType: 'manual', calculatedKey: null, manualValue: 0 },
        { id: 'r12', label: 'Professional Charges from NM & Astra', valueType: 'manual', calculatedKey: null, manualValue: 0 },
        { id: 'r13', label: 'Professional Charges from ALM DXB & Other', valueType: 'manual', calculatedKey: null, manualValue: 0 },
        { id: 'r14', label: 'NM Receivables (Akhil WPS Salary)', valueType: 'manual', calculatedKey: null, manualValue: 0 },
        { id: 'r15', label: 'Less: Total Cash Salary', valueType: 'calculated', calculatedKey: 'totalCashSalary', manualValue: null },
      ]
    },
  ]
};

export default function SummaryTab({ 
    salaryData = [], 
    report = {}, 
    project = {}, 
    onSaveManualFields,
    onLoadTemplate,
    onSaveAsTemplate,
    userRole = 'user',
    currentUser = {}
}) {

    // --- PART B: CALCULATED VALUES MEMO ---

    // Compute all auto-calculated values from salaryData
    const calculatedValues = useMemo(() => {
        let totalSalaryAndAllowances = 0;
        let totalSalariesPayable = 0;
        let totalWpsPayable = 0;
        let branchWpsTotal = 0;
        let bodyshopWpsTotal = 0;
        let bodyshopNetPayable = 0;
        let bodyshopLeaveSalary = 0;
        let bodyshopOtPayable = 0;
        let bodyshopCashSalary = 0;
        let bodyshopTotalSalary = 0;
        let totalLeaveSalary = 0;
        let totalOpenLeaveSalary = 0;
        let totalOtPayable = 0;
        let totalIncentivePayable = 0;
        let totalOtherAllowances = 0;
        let totalCashSalary = 0;

        salaryData.forEach(row => {
            totalSalaryAndAllowances += (row.total_salary || 0);
            totalSalariesPayable += (row.total || 0);
            totalWpsPayable += (row.wpsPay || 0);
            if (row.department === 'Bodyshop') {
                bodyshopWpsTotal += (row.wpsPay || 0);
                bodyshopNetPayable += (row.total || 0);
                bodyshopLeaveSalary += (row.salaryLeaveAmount || 0);
                bodyshopOtPayable += ((row.normalOtSalary || 0) + (row.specialOtSalary || 0));
                bodyshopCashSalary += (row.balance || 0);
                bodyshopTotalSalary += (row.total_salary || 0);
            } else {
                branchWpsTotal += (row.wpsPay || 0);
            }
            totalLeaveSalary += (row.salaryLeaveAmount || 0);
            totalOpenLeaveSalary += (row.open_leave_salary || 0);
            totalOtPayable += ((row.normalOtSalary || 0) + (row.specialOtSalary || 0));
            totalIncentivePayable += (row.incentive || 0);
            totalOtherAllowances += (row.other_allowance || 0);
            totalCashSalary += (row.balance || 0);
        });

        return {
            totalSalaryAndAllowances,
            totalSalariesPayable,
            totalWpsPayable,
            branchWpsTotal,
            bodyshopWpsTotal,
            bodyshopNetPayable,
            bodyshopLeaveSalary,
            bodyshopOtPayable,
            bodyshopCashSalary,
            bodyshopTotalSalary,
            totalLeaveSalary,
            totalOpenLeaveSalary,
            totalOtPayable,
            totalIncentivePayable,
            totalOtherAllowances,
            totalCashSalary,
        };
    }, [salaryData]);

    // Helper to resolve a row value — calculated rows use calculatedValues, manual rows use manualValue
    const resolveValue = (row) => {
        if (row.valueType === 'calculated') {
            return calculatedValues[row.calculatedKey] ?? 0;
        }
        return row.manualValue ?? 0;
    };

    const formatAED = (val) => {
        return `AED ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // --- PART C: STATE ---

    // Permission check
    const canEdit = userRole === 'admin' || userRole === 'senior_accountant';

    // Edit mode toggle
    const [editMode, setEditMode] = useState(false);

    // The working cards array — initialized from report.summary_manual_fields
    // Falls back to DEFAULT_TEMPLATE if no saved data exists
    const [cards, setCards] = useState(() => {
        try {
            const saved = report?.summary_manual_fields;
            if (saved) {
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                if (parsed?.cards && Array.isArray(parsed.cards)) return parsed.cards;
            }
        } catch (e) {}
        return DEFAULT_TEMPLATE.cards;
    });

    // Saving state
    const [isSaving, setIsSaving] = useState(false);

    // State for add row picker — tracks which card is showing the add row dropdown
    const [addRowCardId, setAddRowCardId] = useState(null);

    // State for add card form
    const [showAddCard, setShowAddCard] = useState(false);
    const [newCardTitle, setNewCardTitle] = useState('');

    // Tracks whether template load has been attempted
    // Prevents overwriting user edits with template on re-render
    const [templateLoaded, setTemplateLoaded] = useState(false);

    // --- PART D: HANDLERS ---

    // On mount: if no saved report data exists, load from SummaryTemplate entity
    // This pre-fills the layout for new reports using the company template
    useEffect(() => {
        if (templateLoaded) return;
        if (!onLoadTemplate) {
            setTemplateLoaded(true);
            return;
        }
        // Only load template if report has no saved summary data
        const hasSavedData = (() => {
            try {
                const saved = report?.summary_manual_fields;
                if (!saved) return false;
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                return parsed?.cards && Array.isArray(parsed.cards) && parsed.cards.length > 0;
            } catch (e) {
                return false;
            }
        })();

        if (hasSavedData) {
            setTemplateLoaded(true);
            return;
        }

        // No saved data — load from template
        onLoadTemplate().then(templateCards => {
            if (templateCards && Array.isArray(templateCards) && templateCards.length > 0) {
                // Template found — use it as starting layout
                setCards(templateCards);
            }
            // If no template either — DEFAULT_TEMPLATE.cards already set in useState
            setTemplateLoaded(true);
        }).catch(() => {
            // Template load failed — silently fall back to DEFAULT_TEMPLATE
            setTemplateLoaded(true);
        });
    }, []);
    // Empty dependency array — run once on mount only

    // Generate a simple unique id for new cards/rows
    const genId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Save current cards to report.summary_manual_fields
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSaveManualFields({ cards });
            setEditMode(false);
            toast.success('Summary saved');
        } catch (e) {
            toast.error('Failed to save summary');
        } finally {
            setIsSaving(false);
        }
    };

    // Saves current card layout as the company template for future reports
    // Template will pre-fill new reports that have no saved summary data
    const handleSaveAsTemplate = async () => {
        if (!onSaveAsTemplate) {
            toast.error('Save as template is not available');
            return;
        }
        try {
            await onSaveAsTemplate(cards);
            toast.success('Template saved — will pre-fill future reports');
        } catch (e) {
            toast.error('Failed to save template');
        }
    };

    const handleCancel = () => {
        try {
            const saved = report?.summary_manual_fields;
            if (saved) {
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                if (parsed?.cards && Array.isArray(parsed.cards)) {
                    setCards(parsed.cards);
                } else {
                    setCards(DEFAULT_TEMPLATE.cards);
                }
            } else {
                setCards(DEFAULT_TEMPLATE.cards);
            }
        } catch (e) {
            setCards(DEFAULT_TEMPLATE.cards);
        }
        setEditMode(false);
    };

    // Add a new empty card
    const handleAddCard = () => {
        if (!newCardTitle.trim()) return;
        setCards(prev => [...prev, {
            id: genId(),
            title: newCardTitle.trim(),
            rows: []
        }]);
        setNewCardTitle('');
        setShowAddCard(false);
    };

    // Delete a card
    const handleDeleteCard = (cardId) => {
        setCards(prev => prev.filter(c => c.id !== cardId));
    };

    // Rename a card
    const handleRenameCard = (cardId, newTitle) => {
        setCards(prev => prev.map(c =>
            c.id === cardId ? { ...c, title: newTitle } : c
        ));
    };

    // Move card up
    const handleMoveCardUp = (cardId) => {
        setCards(prev => {
            const idx = prev.findIndex(c => c.id === cardId);
            if (idx <= 0) return prev;
            const next = [...prev];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return next;
        });
    };

    // Move card down
    const handleMoveCardDown = (cardId) => {
        setCards(prev => {
            const idx = prev.findIndex(c => c.id === cardId);
            if (idx >= prev.length - 1) return prev;
            const next = [...prev];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            return next;
        });
    };

    // Add a calculated row to a card
    const handleAddCalculatedRow = (cardId, calcKey) => {
        const calcDef = VALID_CALCULATED_KEYS.find(k => k.key === calcKey);
        if (!calcDef) return;
        setCards(prev => prev.map(c =>
            c.id === cardId ? {
                ...c,
                rows: [...c.rows, {
                    id: genId(),
                    label: calcDef.label,
                    valueType: 'calculated',
                    calculatedKey: calcKey,
                    manualValue: null
                }]
            } : c
        ));
        setAddRowCardId(null);
    };

    // Add a manual row to a card
    const handleAddManualRow = (cardId) => {
        setCards(prev => prev.map(c =>
            c.id === cardId ? {
                ...c,
                rows: [...c.rows, {
                    id: genId(),
                    label: 'New item',
                    valueType: 'manual',
                    calculatedKey: null,
                    manualValue: 0
                }]
            } : c
        ));
        setAddRowCardId(null);
    };

    // Delete a row
    const handleDeleteRow = (cardId, rowId) => {
        setCards(prev => prev.map(c =>
            c.id === cardId ? { ...c, rows: c.rows.filter(r => r.id !== rowId) } : c
        ));
    };

    // Update row label
    const handleRowLabelChange = (cardId, rowId, newLabel) => {
        setCards(prev => prev.map(c =>
            c.id === cardId ? {
                ...c,
                rows: c.rows.map(r =>
                    r.id === rowId ? { ...r, label: newLabel } : r
                )
            } : c
        ));
    };

    // Update manual row value
    const handleRowValueChange = (cardId, rowId, newValue) => {
        setCards(prev => prev.map(c =>
            c.id === cardId ? {
                ...c,
                rows: c.rows.map(r =>
                    r.id === rowId && r.valueType === 'manual'
                        ? { ...r, manualValue: newValue }
                        : r
                )
            } : c
        ));
    };

    // Move row up within a card
    const handleMoveRowUp = (cardId, rowId) => {
        setCards(prev => prev.map(c => {
            if (c.id !== cardId) return c;
            const idx = c.rows.findIndex(r => r.id === rowId);
            if (idx <= 0) return c;
            const rows = [...c.rows];
            [rows[idx - 1], rows[idx]] = [rows[idx], rows[idx - 1]];
            return { ...c, rows };
        }));
    };

    // Move row down within a card
    const handleMoveRowDown = (cardId, rowId) => {
        setCards(prev => prev.map(c => {
            if (c.id !== cardId) return c;
            const idx = c.rows.findIndex(r => r.id === rowId);
            if (idx >= c.rows.length - 1) return c;
            const rows = [...c.rows];
            [rows[idx], rows[idx + 1]] = [rows[idx + 1], rows[idx]];
            return { ...c, rows };
        }));
    };

    // --- PART E: RENDER ---

    if (!templateLoaded) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400">
                Loading summary...
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto py-6 px-4">
            
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">
                        Payroll Summary — {report.report_name || 'Annual Report'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {editMode ? 'Configuring custom workspace layout' : 'Financial summary view'}
                    </p>
                </div>
                
                {canEdit && (
                    <div className="flex items-center gap-2">
                        {!editMode ? (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setEditMode(true)}
                                className="border-slate-300 text-slate-600"
                            >
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit Layout
                            </Button>
                        ) : (
                            <>
                                <Button 
                                    size="sm" 
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleCancel}
                                    disabled={isSaving}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>

                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleSaveAsTemplate}
                                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                >
                                    <LayoutTemplate className="w-4 h-4 mr-2" />
                                    Save as Template
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cards.map((card, cardIdx) => (
                    <Card key={card.id} className={`overflow-hidden transition-all border-2 ${editMode ? 'border-amber-100 border-t-amber-400 shadow-md' : 'border-slate-100'}`}>
                        <CardHeader className="bg-slate-50/80 border-b py-3 px-4 flex flex-row items-center justify-between space-y-0">
                            {editMode ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <Input 
                                        value={card.title}
                                        onChange={(e) => handleRenameCard(card.id, e.target.value)}
                                        className="h-8 text-sm font-bold bg-white max-w-[240px]"
                                    />
                                    <div className="flex items-center gap-1 ml-auto">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveCardUp(card.id)} disabled={cardIdx === 0}>
                                            <ChevronUp className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveCardDown(card.id)} disabled={cardIdx === cards.length - 1}>
                                            <ChevronDown className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteCard(card.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700">
                                    {card.title}
                                </CardTitle>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-100">
                                {card.rows.map((row, rowIdx) => (
                                    <div key={row.id} className="flex items-center py-3 px-4 hover:bg-slate-50/50 transition-colors">
                                        {/* Row Label */}
                                        <div className="flex-1 pr-4">
                                            {editMode ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex flex-col gap-0.5">
                                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveRowUp(card.id, row.id)} disabled={rowIdx === 0}>
                                                            <ChevronUp className="w-3 h-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveRowDown(card.id, row.id)} disabled={rowIdx === card.rows.length - 1}>
                                                            <ChevronDown className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    <Input 
                                                        value={row.label}
                                                        onChange={(e) => handleRowLabelChange(card.id, row.id, e.target.value)}
                                                        className="h-8 text-xs bg-white"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-600 font-medium">
                                                    {row.label}
                                                </span>
                                            )}
                                        </div>

                                        {/* Row Value */}
                                        <div className="flex items-center gap-3">
                                            {row.valueType === 'calculated' ? (
                                                <div className="flex items-center gap-2">
                                                    <Lock className="w-3 h-3 text-slate-400" />
                                                    <span className="text-sm font-bold text-emerald-700 tabular-nums">
                                                        {formatAED(resolveValue(row))}
                                                    </span>
                                                </div>
                                            ) : (
                                                editMode ? (
                                                    <Input 
                                                        type="number"
                                                        value={row.manualValue}
                                                        onChange={(e) => handleRowValueChange(card.id, row.id, Number(e.target.value) || 0)}
                                                        className="h-8 w-28 text-right text-xs font-bold bg-white"
                                                    />
                                                ) : (
                                                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                                                        {formatAED(resolveValue(row))}
                                                    </span>
                                                )
                                            )}
                                            
                                            {editMode && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 text-slate-300 hover:text-rose-500 transition-colors"
                                                    onClick={() => handleDeleteRow(card.id, row.id)}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {card.rows.length === 0 && !editMode && (
                                    <div className="py-8 text-center text-xs text-slate-400 italic">
                                        No entries in this section
                                    </div>
                                )}
                            </div>

                            {editMode && (
                                <div className="p-3 bg-slate-50 border-t flex items-center justify-center relative">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => setAddRowCardId(addRowCardId === card.id ? null : card.id)}
                                        className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900"
                                    >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add Row
                                    </Button>

                                    {addRowCardId === card.id && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-64 bg-white border rounded-lg shadow-xl z-50 overflow-hidden">
                                            <div className="p-2 border-b bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">Input Type</div>
                                            <button 
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2"
                                                onClick={() => handleAddManualRow(card.id)}
                                            >
                                                <Edit2 className="w-3 h-3 text-slate-400" />
                                                Manual Entry Row
                                            </button>
                                            <div className="p-2 border-b border-t bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">Calculated Values</div>
                                            <div className="max-h-48 overflow-y-auto">
                                                {VALID_CALCULATED_KEYS.map(k => (
                                                    <button 
                                                        key={k.key}
                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 border-b last:border-0"
                                                        onClick={() => handleAddCalculatedRow(card.id, k.key)}
                                                    >
                                                        <Lock className="w-3 h-3 text-emerald-500" />
                                                        {k.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {/* Add Card Section */}
                {editMode && (
                    <div className="flex items-stretch min-h-[120px]">
                        {!showAddCard ? (
                            <button 
                                onClick={() => setShowAddCard(true)}
                                className="w-full h-full border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all"
                            >
                                <Plus className="w-8 h-8" />
                                <span className="text-sm font-bold uppercase tracking-widest">Add New Section</span>
                            </button>
                        ) : (
                            <Card className="w-full border-2 border-indigo-200 border-dashed bg-indigo-50/10">
                                <CardContent className="p-6 flex flex-col gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Section Title</label>
                                        <Input 
                                            autoFocus
                                            value={newCardTitle}
                                            onChange={(e) => setNewCardTitle(e.target.value)}
                                            placeholder="e.g. Reconciliation Breakdown"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddCard()}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={handleAddCard} className="bg-indigo-600 hover:bg-indigo-700">Add Section</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setShowAddCard(false)}>Cancel</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}
            </div>

            {cards.length === 0 && !editMode && (
                <div className="flex flex-col items-center justify-center py-24 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Settings2 className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">No summary configured yet.</p>
                </div>
            )}
        </div>
    );
}