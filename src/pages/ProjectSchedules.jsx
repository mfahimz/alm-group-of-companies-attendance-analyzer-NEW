import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '@/components/ui/dialog';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { 
  Plus, 
  Play, 
  Trash2, 
  Edit, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  History,
  Calendar,
  Building2,
  FileText,
  Save,
  ChevronRight,
  Loader2,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

const COMPANIES = [
    'Al Maraghi Motors',
    'Al Maraghi Automotive',
    'Naser Mohsin Auto Parts',
    'Astra Auto Parts'
];

const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 ring-amber-200',
    completed: 'bg-green-100 text-green-700 ring-green-200',
    failed: 'bg-red-100 text-red-700 ring-red-200',
    inactive: 'bg-slate-100 text-slate-700 ring-slate-200'
};

export default function ProjectSchedules() {
    usePageTitle('Project Automation');
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        company: COMPANIES[0],
        label: '',
        trigger_date: '',
        project_name: '',
        date_from: '',
        date_to: '',
        status: 'pending',
        is_dry_run: false,
        // Optional defaults
        salary_calculation_days: 30,
        ot_calculation_days: 30,
        weekly_off_override: 'None',
        use_carried_grace_minutes: false,
        use_gift_minutes: false
    });

    const { data: schedules = [], isLoading } = useQuery({
        queryKey: ['projectSchedules'],
        queryFn: () => base44.entities.ProjectSchedule.list('-trigger_date')
    });

    const { data: auditLogs = [] } = useQuery({
        queryKey: ['auditLogs', 'ProjectSchedule'],
        queryFn: () => base44.entities.AuditLog.filter({ entity_name: 'ProjectSchedule' }, '-created_date', 10)
    });

    const upsertMutation = useMutation({
        mutationFn: async (data) => {
            const { 
                salary_calculation_days, 
                ot_calculation_days, 
                weekly_off_override, 
                use_carried_grace_minutes, 
                use_gift_minutes, 
                ...mainFields 
            } = data;

            const auto_fill_defaults = JSON.stringify({
                salary_calculation_days,
                ot_calculation_days,
                weekly_off_override,
                use_carried_grace_minutes,
                use_gift_minutes
            });

            const payload = { ...mainFields, auto_fill_defaults };

            if (editingRow) {
                return base44.entities.ProjectSchedule.update(editingRow.id, payload);
            } else {
                return base44.entities.ProjectSchedule.create(payload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projectSchedules']);
            toast.success(editingRow ? 'Schedule updated' : 'Schedule created');
            handleCloseDialog();
        },
        onError: (err) => {
            toast.error('Failed to save: ' + err.message);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.ProjectSchedule.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['projectSchedules']);
            toast.success('Schedule deleted');
        }
    });

    const runNowMutation = useMutation({
        mutationFn: () => base44.functions.invoke('autoCreateProjects', {}),
        onSuccess: (data) => {
            queryClient.invalidateQueries(['projectSchedules']);
            queryClient.invalidateQueries(['projects']);
            queryClient.invalidateQueries(['auditLogs']);
            
            const results = data.results || [];
            const created = results.filter(r => r.status === 'created').length;
            const skipped = results.filter(r => r.status === 'skipped').length;
            
            toast.success(`Automation completed: ${created} created, ${skipped} skipped.`);
            setIsProcessing(false);
        },
        onError: (err) => {
            toast.error('Automation failed: ' + err.message);
            setIsProcessing(false);
        }
    });

    const handleOpenDialog = (row = null) => {
        if (row) {
            setEditingRow(row);
            const defaults = row.auto_fill_defaults ? JSON.parse(row.auto_fill_defaults) : {};
            setFormData({
                company: row.company,
                label: row.label || '',
                trigger_date: row.trigger_date,
                project_name: row.project_name,
                date_from: row.date_from,
                date_to: row.date_to,
                status: row.status,
                is_dry_run: row.is_dry_run || false,
                salary_calculation_days: defaults.salary_calculation_days || 30,
                ot_calculation_days: defaults.ot_calculation_days || 30,
                weekly_off_override: defaults.weekly_off_override || 'None',
                use_carried_grace_minutes: defaults.use_carried_grace_minutes || false,
                use_gift_minutes: defaults.use_gift_minutes || false
            });
        } else {
            setEditingRow(null);
            // Default project name pattern for new rows
            setFormData({
                company: COMPANIES[0],
                label: '',
                trigger_date: '',
                project_name: '',
                date_from: '',
                date_to: '',
                status: 'pending',
                is_dry_run: false,
                salary_calculation_days: 30,
                ot_calculation_days: 30,
                weekly_off_override: 'None',
                use_carried_grace_minutes: false,
                use_gift_minutes: false
            });
        }
        setShowDialog(true);
    };

    const handleCloseDialog = () => {
        setShowDialog(false);
        setEditingRow(null);
    };

    const handleSave = (e) => {
        e.preventDefault();
        if (!formData.trigger_date || !formData.date_from || !formData.date_to || !formData.project_name) {
            toast.error('Please fill in all required fields');
            return;
        }
        upsertMutation.mutate(formData);
    };

    const handleRunAutomation = () => {
        if (confirm('Run automation check now? This will process all "pending" rows whose trigger date is today or earlier.')) {
            setIsProcessing(true);
            runNowMutation.mutate();
        }
    };

    const filteredSchedules = schedules.filter(s => 
        s.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.label?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-slate-500 font-medium">Loading project schedules...</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            <Breadcrumb items={[
                { label: 'Admin' },
                { label: 'Project Automation' }
            ]} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
                        Project Automation
                    </h1>
                    <p className="text-slate-500">Manage exact predefined payroll periods for automatic project creation.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant="outline" 
                        onClick={handleRunAutomation}
                        disabled={isProcessing}
                        className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 text-indigo-600" />}
                        Run Automation
                    </Button>
                    <Button 
                        onClick={() => handleOpenDialog()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Period
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Main Content - List of Rows */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input 
                            placeholder="Search by project name or company..."
                            className="pl-10 bg-white border-slate-200"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {filteredSchedules.length === 0 ? (
                        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50 rounded-2xl">
                            <CardContent className="py-20 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Clock className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900">No schedules found</h3>
                                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                                    Define the exact dates for your 2026 payroll periods to enable automatic project creation.
                                </p>
                                <Button 
                                    variant="outline" 
                                    className="mt-6 border-indigo-200 text-indigo-600"
                                    onClick={() => handleOpenDialog()}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add First Period
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {filteredSchedules.map((row) => (
                                <Card key={row.id} className="group border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-300 rounded-xl overflow-hidden">
                                    <CardContent className="p-0">
                                        <div className="flex flex-col sm:flex-row items-stretch">
                                            {/* Status Indicator */}
                                            <div className={`w-2 ${
                                                row.status === 'completed' ? 'bg-green-500' : 
                                                row.status === 'pending' ? 'bg-amber-400' : 
                                                row.status === 'failed' ? 'bg-red-500' : 'bg-slate-300'
                                            }`} />
                                            
                                            <div className="flex-1 p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${STATUS_COLORS[row.status] || STATUS_COLORS.inactive}`}>
                                                            {row.status}
                                                        </span>
                                                        {row.is_dry_run && (
                                                            <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter">
                                                                Dry Run
                                                            </span>
                                                        )}
                                                        <h3 className="text-lg font-bold text-slate-900 truncate">
                                                            {row.project_name}
                                                        </h3>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                                                            <Building2 className="w-4 h-4 text-indigo-500" />
                                                            {row.company}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="w-4 h-4" />
                                                            {formatInUAE(parseDateInUAE(row.date_from), 'MMM d')} - {formatInUAE(parseDateInUAE(row.date_to), 'MMM d, yyyy')}
                                                        </div>
                                                        {row.label && (
                                                            <div className="bg-slate-50 px-2 py-0.5 rounded text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
                                                                {row.label}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8 md:border-l border-slate-100 md:pl-8">
                                                    <div className="text-right space-y-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Trigger Date</p>
                                                        <p className="font-mono text-sm font-bold text-indigo-600">
                                                            {formatInUAE(parseDateInUAE(row.trigger_date), 'dd/MM/yyyy')}
                                                        </p>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full"
                                                            onClick={() => handleOpenDialog(row)}
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                                                            onClick={() => {
                                                                if (confirm('Delete this period?')) deleteMutation.mutate(row.id);
                                                            }}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-0 shadow-xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Clock className="w-20 h-20 rotate-12" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <History className="w-5 h-5" />
                                Stats
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                                    <p className="text-[10px] uppercase font-bold text-indigo-100">Pending</p>
                                    <p className="text-2xl font-bold">{schedules.filter(s => s.status === 'pending').length}</p>
                                </div>
                                <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                                    <p className="text-[10px] uppercase font-bold text-indigo-100">Completed</p>
                                    <p className="text-2xl font-bold">{schedules.filter(s => s.status === 'completed').length}</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-indigo-100 leading-relaxed italic opacity-80">
                                Schedules are processed daily at 2:00 AM UAE time. Use "Run Automation" for manual triggers.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm rounded-xl">
                        <CardHeader className="pb-3 border-b border-slate-50">
                            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Recent Logs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-50">
                                {auditLogs.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-sm italic">No recent activity</div>
                                ) : (
                                    auditLogs.map((log) => (
                                        <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-1 p-1 rounded-full ${
                                                    log.action_type === 'create' ? 'bg-green-100 text-green-600' : 
                                                    log.action_type === 'error' ? 'bg-red-100 text-red-600' :
                                                    'bg-blue-100 text-blue-600'
                                                }`}>
                                                    {log.action_type === 'create' ? <CheckCircle2 className="w-3 h-3" /> : 
                                                     log.action_type === 'error' ? <AlertCircle className="w-3 h-3" /> :
                                                     <ChevronRight className="w-3 h-3" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-slate-900 leading-tight">{log.context}</p>
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        {formatInUAE(log.created_date?.endsWith('Z') ? log.created_date : log.created_date + 'Z', 'MMM d, hh:mm a')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto rounded-2xl border-0 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                            {editingRow ? <Edit className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
                            {editingRow ? 'Edit Period Row' : 'Add Predefined Period'}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-2">
                                <Label htmlFor="project_name" className="text-slate-700 font-bold">Project Name *</Label>
                                <Input 
                                    id="project_name" 
                                    placeholder="e.g. October 2026 Payroll" 
                                    value={formData.project_name}
                                    onChange={e => setFormData({...formData, project_name: e.target.value})}
                                    className="border-slate-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-700 font-bold">Target Company *</Label>
                                <Select 
                                    value={formData.company} 
                                    onValueChange={val => setFormData({...formData, company: val})}
                                >
                                    <SelectTrigger className="border-slate-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="label" className="text-slate-700 font-bold">Label / Month (Optional)</Label>
                                <Input 
                                    id="label" 
                                    placeholder="e.g. Oct-2026" 
                                    value={formData.label}
                                    onChange={e => setFormData({...formData, label: e.target.value})}
                                    className="border-slate-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="trigger_date" className="text-slate-700 font-bold text-indigo-600">Trigger Date (When to create) *</Label>
                                <Input 
                                    id="trigger_date" 
                                    type="date"
                                    value={formData.trigger_date}
                                    onChange={e => setFormData({...formData, trigger_date: e.target.value})}
                                    className="border-indigo-200 bg-indigo-50/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-700 font-bold">Row Status</Label>
                                <Select 
                                    value={formData.status} 
                                    onValueChange={val => setFormData({...formData, status: val})}
                                >
                                    <SelectTrigger className="border-slate-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="date_from" className="text-slate-700 font-bold">Period Date From *</Label>
                                <Input 
                                    id="date_from" 
                                    type="date"
                                    value={formData.date_from}
                                    onChange={e => setFormData({...formData, date_from: e.target.value})}
                                    className="border-slate-200"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="date_to" className="text-slate-700 font-bold">Period Date To *</Label>
                                <Input 
                                    id="date_to" 
                                    type="date"
                                    value={formData.date_to}
                                    onChange={e => setFormData({...formData, date_to: e.target.value})}
                                    className="border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-slate-100">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Project Configuration Defaults</h4>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[11px] font-bold text-slate-500">Salary Calc Days</Label>
                                    <Input 
                                        type="number" 
                                        value={formData.salary_calculation_days}
                                        onChange={e => setFormData({...formData, salary_calculation_days: parseInt(e.target.value) || 30})}
                                        className="h-9 border-slate-100"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[11px] font-bold text-slate-500">Weekly Off Override</Label>
                                    <Select 
                                        value={formData.weekly_off_override} 
                                        onValueChange={val => setFormData({...formData, weekly_off_override: val})}
                                    >
                                        <SelectTrigger className="h-9 border-slate-100 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="None">None (Default)</SelectItem>
                                            <SelectItem value="Sunday">Sunday</SelectItem>
                                            <SelectItem value="Friday">Friday</SelectItem>
                                            <SelectItem value="Saturday">Saturday</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[11px] font-medium text-slate-600">Carry Grace</Label>
                                    <Switch 
                                        checked={formData.use_carried_grace_minutes}
                                        onCheckedChange={val => setFormData({...formData, use_carried_grace_minutes: val})}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label className="text-[11px] font-medium text-slate-600">Ramadan Gift</Label>
                                    <Switch 
                                        checked={formData.use_gift_minutes}
                                        onCheckedChange={val => setFormData({...formData, use_gift_minutes: val})}
                                    />
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 text-white">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-bold">Dry Run Mode</Label>
                                    <p className="text-[10px] text-slate-400">Test trigger without creating records</p>
                                </div>
                                <Switch 
                                    checked={formData.is_dry_run}
                                    onCheckedChange={val => setFormData({...formData, is_dry_run: val})}
                                />
                            </div>
                        </div>

                        <DialogFooter className="pt-8 border-t border-slate-50">
                            <Button type="button" variant="ghost" onClick={handleCloseDialog} className="text-slate-500">Cancel</Button>
                            <Button 
                                type="submit" 
                                disabled={upsertMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px] shadow-lg shadow-indigo-100"
                            >
                                {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                {editingRow ? 'Update Row' : 'Save Row'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
