import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function BulkEditDialog({ open, onClose, selectedCount, onConfirm, isPending }) {
    const [field, setField] = useState('department');
    const [value, setValue] = useState('');

    const handleFieldChange = (newField) => {
        setField(newField);
        if (newField === 'active') setValue(true);
        else setValue('');
    };

    const handleConfirm = () => {
        const updates = {};
        updates[field] = value;
        onConfirm(updates);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Bulk Edit ({selectedCount} Employees)</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Field to Update</Label>
                        <Select value={field} onValueChange={handleFieldChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="department">Department</SelectItem>
                                <SelectItem value="company">Company</SelectItem>
                                <SelectItem value="active">Status</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>New Value</Label>
                        {field === 'department' && (
                             <Select value={value} onValueChange={setValue}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Department" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Admin">Admin</SelectItem>
                                    <SelectItem value="Operations">Operations</SelectItem>
                                    <SelectItem value="Front Office">Front Office</SelectItem>
                                    <SelectItem value="Housekeeping">Housekeeping</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        {field === 'company' && (
                             <Select value={value} onValueChange={setValue}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Company" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Al Maraghi Motors">Al Maraghi Motors</SelectItem>
                                    <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        {field === 'active' && (
                            <div className="flex items-center space-x-2 pt-2">
                                <Switch checked={value === true} onCheckedChange={setValue} />
                                <span>{value ? 'Active' : 'Inactive'}</span>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={isPending || (field !== 'active' && !value)}>
                        {isPending ? 'Updating...' : 'Update Employees'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}