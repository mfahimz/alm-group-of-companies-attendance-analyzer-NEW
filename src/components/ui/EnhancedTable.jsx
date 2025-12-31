import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings2, Eye, EyeOff, GripVertical, Check, X, Edit2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function EnhancedTable({ 
    data, 
    columns: initialColumns, 
    onEdit,
    keyField = 'id',
    editable = false 
}) {
    const [columns, setColumns] = useState(initialColumns);
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');

    const visibleColumns = columns.filter(col => col.visible !== false);

    const toggleColumn = (key) => {
        setColumns(cols => cols.map(col => 
            col.key === key ? { ...col, visible: !col.visible } : col
        ));
    };

    const handleEditStart = (rowId, colKey, currentValue) => {
        setEditingCell({ rowId, colKey });
        setEditValue(currentValue);
    };

    const handleEditSave = (row) => {
        if (onEdit) {
            onEdit(row[keyField], editingCell.colKey, editValue);
        }
        setEditingCell(null);
    };

    const handleEditCancel = () => {
        setEditingCell(null);
        setEditValue('');
    };

    return (
        <div className="space-y-3">
            {/* Column Customization */}
            <div className="flex justify-end">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Settings2 className="w-4 h-4" />
                            Columns
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="end">
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm">Show/Hide Columns</h4>
                            <div className="space-y-2">
                                {columns.map((col) => (
                                    <div key={col.key} className="flex items-center gap-2">
                                        <Checkbox
                                            checked={col.visible !== false}
                                            onCheckedChange={() => toggleColumn(col.key)}
                                        />
                                        <label className="text-sm cursor-pointer flex-1">
                                            {col.label}
                                        </label>
                                        {col.visible !== false ? (
                                            <Eye className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <EyeOff className="w-4 h-4 text-slate-400" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Table */}
            <div className="rounded-lg border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            {visibleColumns.map((col) => (
                                <TableHead key={col.key} className="font-semibold">
                                    {col.label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row) => (
                            <TableRow key={row[keyField]} className="hover:bg-slate-50 transition-colors">
                                {visibleColumns.map((col) => {
                                    const isEditing = editingCell?.rowId === row[keyField] && editingCell?.colKey === col.key;
                                    const cellValue = col.render ? col.render(row) : row[col.key];

                                    return (
                                        <TableCell key={col.key} className="relative group">
                                            {isEditing ? (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        className="h-8"
                                                        autoFocus
                                                    />
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-green-600 hover:text-green-700"
                                                        onClick={() => handleEditSave(row)}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-red-600 hover:text-red-700"
                                                        onClick={handleEditCancel}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <span>{cellValue}</span>
                                                    {editable && col.editable && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handleEditStart(row[keyField], col.key, row[col.key])}
                                                        >
                                                            <Edit2 className="w-3 h-3 text-slate-400" />
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}