import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Search } from 'lucide-react';

export default function EmployeeSelectionDialog({ open, onOpenChange, company, onConfirm, initialIds = '' }) {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [searchAllCompanies, setSearchAllCompanies] = useState(false);

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list(),
        enabled: open
    });

    const companyEmployees = employees.filter(e => e.company === company && e.active);
    const allActiveEmployees = employees.filter(e => e.active);

    useEffect(() => {
        if (open && company) {
            if (initialIds) {
                // Load existing custom IDs
                const idsArray = initialIds.split(',').map(id => id.trim()).filter(Boolean);
                setSelectedIds(new Set(idsArray));
            } else {
                // Select all company employees by default
                const allIds = companyEmployees.map(e => e.hrms_id);
                setSelectedIds(new Set(allIds));
            }
        }
    }, [open, company, initialIds]);

    const employeesToSearch = searchAllCompanies ? allActiveEmployees : companyEmployees;
    
    const filteredEmployees = employeesToSearch.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.hrms_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.attendance_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleEmployee = (hrmsId) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(hrmsId)) {
            newSelected.delete(hrmsId);
        } else {
            newSelected.add(hrmsId);
        }
        setSelectedIds(newSelected);
    };

    const selectAll = () => {
        const allIds = companyEmployees.map(e => e.hrms_id);
        setSelectedIds(new Set(allIds));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selectedIds).join(', '));
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        Select Employees for Project
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                    {/* Search and Actions */}
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search by name, HRMS ID, or Attendance ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <Button variant="outline" size="sm" onClick={selectAll}>
                                Select All
                            </Button>
                            <Button variant="outline" size="sm" onClick={deselectAll}>
                                Deselect All
                            </Button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <Checkbox 
                                id="search-all"
                                checked={searchAllCompanies}
                                onCheckedChange={setSearchAllCompanies}
                            />
                            <Label htmlFor="search-all" className="text-sm font-normal cursor-pointer">
                                Search employees from all companies
                            </Label>
                        </div>
                    </div>

                    <div className="text-sm text-slate-600">
                        {selectedIds.size} employee{selectedIds.size !== 1 ? 's' : ''} selected
                    </div>

                    {/* Employee List */}
                    <div className="flex-1 overflow-y-auto border rounded-lg">
                        <div className="divide-y">
                            {filteredEmployees.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    {employeesToSearch.length === 0 ? 'No employees found' : 'No matching employees'}
                                </div>
                            ) : (
                                filteredEmployees.map((employee) => {
                                    const isFromDifferentCompany = employee.company !== company;
                                    return (
                                        <div
                                            key={employee.id}
                                            className={`flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer ${
                                                isFromDifferentCompany ? 'bg-amber-50/50' : ''
                                            }`}
                                            onClick={() => toggleEmployee(employee.hrms_id)}
                                        >
                                            <Checkbox
                                                checked={selectedIds.has(employee.hrms_id)}
                                                onCheckedChange={() => toggleEmployee(employee.hrms_id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-slate-900 truncate">{employee.name}</p>
                                                    {isFromDifferentCompany && (
                                                        <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                                                            {employee.company}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500">
                                                    HRMS: {employee.hrms_id} | Attendance: {employee.attendance_id}
                                                    {employee.department && ` | ${employee.department}`}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirm} className="bg-indigo-600 hover:bg-indigo-700">
                            Confirm Selection
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}