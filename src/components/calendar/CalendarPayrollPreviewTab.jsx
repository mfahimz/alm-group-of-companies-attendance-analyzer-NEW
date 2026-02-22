import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play } from 'lucide-react';
import { toast } from 'sonner';

export default function CalendarPayrollPreviewTab() {
    const [selectedCycleId, setSelectedCycleId] = useState('');
    const queryClient = useQueryClient();

    const { data: cycles = [] } = useQuery({
        queryKey: ['calendarCycles'],
        queryFn: () => base44.entities.CalendarCycle.list('-created_date')
    });

    const { data: snapshots = [] } = useQuery({
        queryKey: ['calendarSnapshots', selectedCycleId],
        queryFn: () => base44.entities.CalendarPayrollSnapshot.filter({ calendar_cycle_id: selectedCycleId }),
        enabled: !!selectedCycleId
    });

    const runPreviewMutation = useMutation({
        mutationFn: () => base44.functions.invoke('runCalendarPayrollPreview', { calendar_cycle_id: selectedCycleId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarSnapshots']);
            toast.success('Payroll preview generated');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to generate preview');
        }
    });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Select Cycle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Calendar Cycle</Label>
                        <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a cycle" />
                            </SelectTrigger>
                            <SelectContent>
                                {cycles.map((cycle) => (
                                    <SelectItem key={cycle.id} value={cycle.id}>
                                        {cycle.name} - {cycle.payroll_month_label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {selectedCycleId && (
                        <Button onClick={() => runPreviewMutation.mutate()} disabled={runPreviewMutation.isPending}>
                            <Play className="w-4 h-4 mr-2" />
                            Generate Payroll Preview
                        </Button>
                    )}
                </CardContent>
            </Card>

            {snapshots.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Payroll Preview ({snapshots.length} employees)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Present</TableHead>
                                        <TableHead>LOP</TableHead>
                                        <TableHead>Annual Leave</TableHead>
                                        <TableHead>Assumed Days</TableHead>
                                        <TableHead>Carryover Applied</TableHead>
                                        <TableHead>Deferred</TableHead>
                                        <TableHead className="text-right">Net Pay</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {snapshots.map((snap) => (
                                        <TableRow key={snap.id}>
                                            <TableCell className="font-medium">{snap.name}</TableCell>
                                            <TableCell>{snap.present_days_in_cycle}</TableCell>
                                            <TableCell>{snap.lop_days_in_cycle}</TableCell>
                                            <TableCell>{snap.annual_leave_days_in_cycle}</TableCell>
                                            <TableCell>{snap.assumed_present_days_count}</TableCell>
                                            <TableCell>
                                                {snap.carryover_applied_minutes_total}m / {snap.carryover_applied_lop_days_total}d
                                            </TableCell>
                                            <TableCell>
                                                {snap.deferred_minutes_total}m / {snap.deferred_lop_days_total}d
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {snap.net_pay?.toLocaleString('en-AE', { style: 'currency', currency: 'AED' })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}