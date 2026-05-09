import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle, RotateCcw, Eye, Search, History, Target } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/components/hooks/usePermissions';
import { useCompanyFilter } from '@/components/context/CompanyContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatInUAE } from '@/components/ui/timezone';

export default function ApprovalHistory() {
    const { user: currentUser, userRole } = usePermissions();
    const { selectedCompany } = useCompanyFilter();
    const queryClient = useQueryClient();
    
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [showDetail, setShowDetail] = useState(false);

    const { data: records = [], isLoading } = useQuery({
        queryKey: ['compensationMonthlyRecords', selectedCompany, selectedMonth, selectedStatus],
        queryFn: async () => {
            const filters = { company: selectedCompany };
            if (selectedMonth) filters.month = selectedMonth;
            if (selectedStatus !== 'all') filters.status = selectedStatus;
            
            return base44.entities.CompensationMonthlyRecord.filter(filters, '-month', 1000);
        },
        enabled: !!selectedCompany,
        refetchOnWindowFocus: false
    });

    const filteredRecords = useMemo(() => {
        return records.filter(r => 
            r.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.target_label?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [records, searchTerm]);

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }) => {
            const payload = { status };
            if (status === 'Approved') {
                payload.approved_by = currentUser.email;
                payload.approval_date = new Date().toISOString();
            } else if (status === 'Draft') {
                // Reopen logic
                payload.reopened_by = currentUser.email;
                payload.reopened_date = new Date().toISOString();
                // Clear approval info if reopening? Usually good for audit
            }
            return base44.entities.CompensationMonthlyRecord.update(id, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compensationMonthlyRecords'] });
            toast.success('Status updated');
        },
        onError: (err) => {
            toast.error('Failed to update status: ' + err.message);
        }
    });

    const handleAction = (record, nextStatus) => {
        if (nextStatus === 'Approved' && !confirm('Approve this compensation record? This will freeze the values.')) return;
        if (nextStatus === 'Draft' && !confirm('Reopen this record? This will allow editing.')) return;
        
        updateStatusMutation.mutate({ id: record.id, status: nextStatus });
    };

    return (
        <Card className="p-6 bg-white border-[#E2E6EC]">
            <div className="flex flex-wrap gap-4 mb-6 items-end">
                <div className="space-y-1">
                    <Label className="text-xs text-[#64748B]">Month</Label>
                    <Input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-40 h-9 border-[#E2E6EC]"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs text-[#64748B]">Status</Label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="w-40 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Reviewed">Reviewed</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                    <Label className="text-xs text-[#64748B]">Search</Label>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                        <Input
                            placeholder="Employee name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 border-[#E2E6EC]"
                        />
                    </div>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden border-[#E2E6EC]">
                <Table>
                    <TableHeader className="bg-[#F8FAFC]">
                        <TableRow>
                            <TableHead className="font-semibold text-[#475569]">Month</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Employee</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Target</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Achieved</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Payout</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Status</TableHead>
                            <TableHead className="text-right font-semibold text-[#475569]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0F1E36]" />
                                </TableCell>
                            </TableRow>
                        ) : filteredRecords.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-[#64748B]">
                                    No records found matching filters
                                </TableCell>
                            </TableRow>
                        ) : filteredRecords.map((record) => (
                            <TableRow key={record.id} className="hover:bg-[#F8FAFC]">
                                <TableCell className="font-medium text-[#1E293B]">
                                    {record.month}
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-[#1E293B]">{record.employee_name}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-xs text-[#64748B]">{record.target_label}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm font-semibold">
                                        {record.achieved_value} <span className="text-[10px] text-slate-400">{record.unit}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="font-bold text-[#0F1E36]">
                                        AED {record.calculated_payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge className={
                                        record.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                        record.status === 'Reviewed' ? 'bg-blue-100 text-blue-700' :
                                        'bg-yellow-100 text-yellow-700'
                                    }>
                                        {record.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => { setSelectedRecord(record); setShowDetail(true); }}
                                            className="text-[#64748B]"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Button>
                                        
                                        {record.status === 'Draft' && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => handleAction(record, 'Reviewed')}
                                                className="border-blue-200 text-blue-600 h-8"
                                            >
                                                Review
                                            </Button>
                                        )}
                                        
                                        {record.status === 'Reviewed' && (
                                            <Button 
                                                variant="default" 
                                                size="sm" 
                                                onClick={() => handleAction(record, 'Approved')}
                                                className="bg-[#0F1E36] h-8"
                                            >
                                                Approve
                                            </Button>
                                        )}
                                        
                                        {record.status === 'Approved' && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleAction(record, 'Draft')}
                                                className="text-orange-500 hover:text-orange-600 hover:bg-orange-50 h-8"
                                            >
                                                <RotateCcw className="w-3 h-3 mr-1" /> Reopen
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={showDetail} onOpenChange={setShowDetail}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="w-5 h-5 text-blue-600" />
                            Record Details
                        </DialogTitle>
                    </DialogHeader>
                    {selectedRecord && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Employee</div>
                                    <div className="text-sm font-medium">{selectedRecord.employee_name}</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Month</div>
                                    <div className="text-sm font-medium">{selectedRecord.month}</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Target</div>
                                    <div className="text-sm font-medium">{selectedRecord.target_label} ({selectedRecord.unit})</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Calculation Mode</div>
                                    <div className="text-sm font-medium capitalize">{selectedRecord.calculation_mode_snapshot?.replace('_', ' ')}</div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Achieved</div>
                                    <div className="text-sm font-bold">{selectedRecord.achieved_value}</div>
                                </div>
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="text-[10px] uppercase text-blue-600 font-semibold">Payout</div>
                                    <div className="text-sm font-bold text-blue-800">AED {selectedRecord.calculated_payout.toLocaleString()}</div>
                                </div>
                            </div>

                            {(() => {
                                try {
                                    const snap = JSON.parse(selectedRecord.template_snapshot);
                                    if (snap.kpi_values) {
                                        return (
                                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                                                <h4 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-2">
                                                    <Target className="w-4 h-4 text-blue-500" />
                                                    KPI Breakdown
                                                </h4>
                                                <div className="grid grid-cols-4 gap-2">
                                                    <div className="text-center">
                                                        <div className="text-[9px] text-slate-400 uppercase">Units</div>
                                                        <div className="text-xs font-bold">{snap.kpi_values.units}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-[9px] text-slate-400 uppercase">SC</div>
                                                        <div className="text-xs font-bold">{snap.kpi_values.sc}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-[9px] text-slate-400 uppercase">IV</div>
                                                        <div className="text-xs font-bold">{snap.kpi_values.iv}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-[9px] text-slate-400 uppercase">NPS</div>
                                                        <div className="text-xs font-bold">{snap.kpi_values.nps}</div>
                                                    </div>
                                                </div>
                                                {snap.tier_result && (
                                                    <div className="pt-2 border-t border-slate-200">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-medium text-slate-600">Matched: {snap.tier_result.tier}</span>
                                                            <Badge variant="outline" className="text-[9px] uppercase bg-white">
                                                                {snap.tier_result.status}
                                                            </Badge>
                                                        </div>
                                                        {snap.tier_result.reasons?.length > 0 && (
                                                            <p className="text-[10px] text-slate-500 italic mt-1">
                                                                {snap.tier_result.reasons.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                } catch(e) {}
                                return null;
                            })()}
                            
                            <div className="space-y-2 pt-4 border-t">
                                <h4 className="text-xs font-semibold text-slate-500 uppercase">Audit Trail</h4>
                                {selectedRecord.approved_by && (
                                    <div className="flex justify-between text-xs p-2 bg-green-50 text-green-700 rounded border border-green-100">
                                        <span>Approved by: {selectedRecord.approved_by}</span>
                                        <span>{formatInUAE(selectedRecord.approval_date?.endsWith('Z') ? selectedRecord.approval_date : selectedRecord.approval_date + 'Z', 'dd/MM/yyyy hh:mm a')}</span>
                                    </div>
                                )}
                                {selectedRecord.reopened_by && (
                                    <div className="flex justify-between text-xs p-2 bg-orange-50 text-orange-700 rounded border border-orange-100">
                                        <span>Last reopened by: {selectedRecord.reopened_by}</span>
                                        <span>{formatInUAE(selectedRecord.reopened_date?.endsWith('Z') ? selectedRecord.reopened_date : selectedRecord.reopened_date + 'Z', 'dd/MM/yyyy hh:mm a')}</span>
                                    </div>
                                )}
                                {!selectedRecord.approved_by && !selectedRecord.reopened_by && (
                                    <div className="text-xs text-slate-400 italic">No audit records yet.</div>
                                )}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setShowDetail(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function Label({ children, className }) {
    return <label className={`block text-sm font-medium text-[#374151] ${className}`}>{children}</label>;
}
