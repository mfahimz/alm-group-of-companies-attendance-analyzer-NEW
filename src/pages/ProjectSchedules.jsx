import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
    Tabs, 
    TabsList, 
    TabsTrigger 
} from '@/components/ui/tabs';
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
  Loader2,
  Search,
  Filter,
  ArrowRight,
  CalendarDays,
  Target
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
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-100 text-rose-700 border-rose-200',
    inactive: 'bg-slate-100 text-slate-700 border-slate-200'
};

export default function ProjectSchedules() {
    usePageTitle('Project Automation');
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // PART A - New State
    const [activeCompany, setActiveCompany] = useState('All Companies');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showDueOnly, setShowDueOnly] = useState(false);

    const [formData, setFormData] = useState({
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

    const { data: schedules = [], isLoading } = useQuery({
        queryKey: ['projectSchedules'],
        queryFn: () => base44.entities.ProjectSchedule.list('-trigger_date')
    });

    const { data: auditLogs = [] } = useQuery({
        queryKey: ['auditLogs', 'ProjectSchedule'],
        queryFn: () => base44.entities.AuditLog.filter({ entity_name: 'ProjectSchedule' }, '-created_date', 10)
    });

    // PART A - Logic
    const todayStr = useMemo(() => formatInUAE(new Date().toISOString(), 'yyyy-MM-dd'), []);

    const stats = useMemo(() => {
        const pending = schedules.filter(s => s.status === 'pending');
        const due = pending.filter(s => s.trigger_date <= todayStr);
        const upcoming = pending.filter(s => s.trigger_date > todayStr);
        const completed = schedules.filter(s => s.status === 'completed');
        
        const sortedPending = [...pending].sort((a, b) => a.trigger_date.localeCompare(b.trigger_date));
        const nextTrigger = sortedPending[0]?.trigger_date || null;

        return {
            attention: due.length,
            upcoming: upcoming.length,
            completed: completed.length,
            nextTrigger
        };
    }, [schedules, todayStr]);

    const filteredSchedules = useMemo(() => {
        return schedules.filter(s => {
            if (activeCompany !== 'All Companies' && s.company !== activeCompany) return false;
            if (statusFilter !== 'all' && s.status !== statusFilter) return false;
            if (showDueOnly && !(s.status === 'pending' && s.trigger_date <= todayStr)) return false;
            
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                return (
                    s.project_name.toLowerCase().includes(searchLower) ||
                    s.company.toLowerCase().includes(searchLower) ||
                    s.label?.toLowerCase().includes(searchLower)
                );
            }
            return true;
        });
    }, [schedules, activeCompany, statusFilter, showDueOnly, searchTerm, todayStr]);

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
            toast.success(editingRow ? 'Schedule updated successfully' : 'New schedule created');
            handleCloseDialog();
        },
        onError: (err) => {
            toast.error('Could not save schedule. Please check your connection.');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.ProjectSchedule.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['projectSchedules']);
            toast.success('Schedule has been deleted');
        },
        onError: () => {
            toast.error('Could not delete schedule');
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
            
            toast.success(`Process finished: ${created} projects created, ${skipped} skipped.`);
            setIsProcessing(false);
        },
        onError: (err) => {
            toast.error('The automation process failed. Please try again or contact support.');
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
            setFormData({
                company: activeCompany === 'All Companies' ? COMPANIES[0] : activeCompany,
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
        if (confirm('Start automation check? This will process all pending rows for today.')) {
            setIsProcessing(true);
            runNowMutation.mutate();
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-slate-500 font-medium">Loading project automation data...</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4 md:px-6">
            <Breadcrumb items={[
                { label: 'Admin' },
                { label: 'Project Automation' }
            ]} />

            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
                        Project Automation
                    </h1>
                    <p className="text-slate-500">Scheduled payroll periods for automatic project creation.</p>
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

            {/* PART A - Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-slate-100 shadow-sm bg-amber-50/30 border-l-4 border-l-amber-400">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Attention Required</p>
                            <h3 className="text-2xl font-black text-slate-900">{stats.attention}</h3>
                        </div>
                        <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-100 shadow-sm bg-indigo-50/30 border-l-4 border-l-indigo-400">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">Upcoming</p>
                            <h3 className="text-2xl font-black text-slate-900">{stats.upcoming}</h3>
                        </div>
                        <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-100 shadow-sm bg-emerald-50/30 border-l-4 border-l-emerald-400">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Completed</p>
                            <h3 className="text-2xl font-black text-slate-900">{stats.completed}</h3>
                        </div>
                        <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-100 shadow-sm bg-slate-50/50 border-l-4 border-l-slate-400">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Next Trigger</p>
                            <h3 className="text-xl font-bold text-slate-900">
                                {stats.nextTrigger ? formatInUAE(parseDateInUAE(stats.nextTrigger), 'dd/MM/yyyy') : 'None'}
                            </h3>
                        </div>
                        <div className="p-3 bg-slate-100 rounded-xl text-slate-400">
                            <CalendarDays className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* PART A - Tabs & Filters */}
            <div className="space-y-6">
                <Tabs value={activeCompany} onValueChange={setActiveCompany} className="w-full">
                    <TabsList className="bg-slate-200 p-1 rounded-xl h-auto flex-wrap justify-start">
                        <TabsTrigger value="All Companies" className="rounded-lg py-2 px-4 font-semibold text-slate-600 hover:text-slate-900 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">All Companies</TabsTrigger>
                        {COMPANIES.map(company => (
                            <TabsTrigger key={company} value={company} className="rounded-lg py-2 px-4 font-semibold text-slate-600 hover:text-slate-900 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                                {company}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input 
                            placeholder="Search projects..."
                            className="pl-10 bg-slate-50/50 border-slate-100 focus:bg-white transition-all h-11"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                            <Filter className="w-4 h-4 text-slate-400" />
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="border-0 bg-transparent shadow-none focus:ring-0 h-8 text-sm font-medium w-[130px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 ml-auto md:ml-0">
                            <Label htmlFor="due-only" className="text-xs font-bold text-slate-500 uppercase cursor-pointer">Due Only</Label>
                            <Switch 
                                id="due-only"
                                checked={showDueOnly}
                                onCheckedChange={setShowDueOnly}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Main List */}
                <div className="lg:col-span-3 space-y-4">
                    {filteredSchedules.length === 0 ? (
                        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50 rounded-2xl">
                            <CardContent className="py-20 text-center">
                                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4">
                                    <Target className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900">No schedules match your filters</h3>
                                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                                    Try adjusting your search terms or filters to find what you're looking for.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredSchedules.map((row) => {
                                const isDue = row.status === 'pending' && row.trigger_date <= todayStr;
                                return (
                                    <Card key={row.id} className={`group border-slate-100 hover:border-indigo-200 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden ${isDue ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}>
                                        <CardContent className="p-0">
                                            <div className="flex flex-col sm:flex-row">
                                                {/* Status Indicator Bar */}
                                                <div className={`w-1.5 ${
                                                    row.status === 'completed' ? 'bg-emerald-500' : 
                                                    row.status === 'pending' ? (isDue ? 'bg-amber-500 animate-pulse' : 'bg-amber-400') : 
                                                    row.status === 'failed' ? 'bg-rose-500' : 'bg-slate-300'
                                                }`} />
                                                
                                                <div className="flex-1 p-5 md:p-6">
                                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                                        <div className="space-y-3 flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <Badge variant="outline" className={`font-bold uppercase tracking-wider text-[10px] ${STATUS_COLORS[row.status]}`}>
                                                                    {row.status}
                                                                </Badge>
                                                                
                                                                {isDue && (
                                                                    <Badge className="bg-amber-500 text-white font-black text-[10px] uppercase">
                                                                        Due Now
                                                                    </Badge>
                                                                )}

                                                                {row.is_dry_run && (
                                                                    <Badge className="bg-slate-900 text-white text-[10px] font-bold uppercase">
                                                                        Dry Run
                                                                    </Badge>
                                                                )}

                                                                {row.label && (
                                                                    <span className="text-indigo-600 font-black text-sm bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                                                        {row.label}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div>
                                                                <h3 className="text-xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                                    {row.project_name}
                                                                </h3>
                                                                <div className="flex items-center gap-2 mt-1 text-slate-500">
                                                                    <Building2 className="w-4 h-4 text-slate-400" />
                                                                    <span className="font-semibold text-sm">{row.company}</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-slate-50">
                                                                <div className="flex items-center gap-2 text-sm">
                                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                                    <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                                        <span>{formatInUAE(parseDateInUAE(row.date_from), 'MMM d')}</span>
                                                                        <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                        <span>{formatInUAE(parseDateInUAE(row.date_to), 'MMM d, yyyy')}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 lg:pl-8 lg:border-l border-slate-100">
                                                            <div className="text-left lg:text-right">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Trigger Date</p>
                                                                <div className={`flex items-center gap-2 font-mono font-bold text-lg ${isDue ? 'text-amber-600' : 'text-indigo-600'}`}>
                                                                    <CalendarDays className="w-5 h-5 opacity-50" />
                                                                    {formatInUAE(parseDateInUAE(row.trigger_date), 'dd/MM/yyyy')}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex items-center gap-1">
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    className="h-10 w-10 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                                                                    onClick={() => handleOpenDialog(row)}
                                                                >
                                                                    <Edit className="w-5 h-5" />
                                                                </Button>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    className="h-10 w-10 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                                                                    onClick={() => {
                                                                        if (confirm('Delete this automation row?')) deleteMutation.mutate(row.id);
                                                                    }}
                                                                >
                                                                    <Trash2 className="w-5 h-5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Sidebar - Logs */}
                <div className="space-y-6">
                    <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden border-t-4 border-t-indigo-600">
                        <CardHeader className="pb-3 border-b border-slate-50 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                                <History className="w-4 h-4 text-indigo-600" />
                                Activity Logs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
                                {auditLogs.length === 0 ? (
                                    <div className="p-12 text-center text-slate-400 text-sm italic">No recent activity</div>
                                ) : (
                                    auditLogs.map((log) => (
                                        <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 p-1 rounded-lg ${
                                                    log.action_type === 'create' ? 'bg-emerald-100 text-emerald-600' : 
                                                    log.action_type === 'error' ? 'bg-rose-100 text-rose-600' :
                                                    'bg-indigo-100 text-indigo-600'
                                                }`}>
                                                    {log.action_type === 'create' ? <Plus className="w-3.5 h-3.5" /> : 
                                                     log.action_type === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> :
                                                     <FileText className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-slate-800 leading-snug">{log.context}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                                            {formatInUAE(log.created_date?.endsWith('Z') ? log.created_date : log.created_date + 'Z', 'MMM d, hh:mm a')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full group-hover:scale-150 transition-transform duration-700" />
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500 rounded-xl">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <h4 className="font-bold">System Info</h4>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                Automation runs daily at <span className="text-indigo-400 font-bold">2:00 AM UAE</span>. It processes all "Pending" rows whose trigger date is today or earlier.
                            </p>
                            <div className="pt-2 border-t border-white/10">
                                <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Server Time (UAE)</p>
                                <p className="text-lg font-mono font-bold text-indigo-400">{formatInUAE(new Date().toISOString(), 'hh:mm a')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-[2rem] border-0 shadow-2xl p-0">
                    <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <CalendarDays className="w-24 h-24 rotate-12" />
                        </div>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-3 text-2xl font-black">
                                <div className="p-2 bg-indigo-500 rounded-xl">
                                    {editingRow ? <Edit className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                                </div>
                                {editingRow ? 'Edit Automation Row' : 'Add Automation Period'}
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-slate-400 mt-2 text-sm font-medium">Configure the exact dates and rules for this automated payroll project.</p>
                    </div>

                    <form onSubmit={handleSave} className="p-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="project_name" className="text-slate-900 font-bold flex items-center gap-2">
                                    Project Name <span className="text-rose-500">*</span>
                                </Label>
                                <Input 
                                    id="project_name" 
                                    placeholder="e.g. October 2026 Payroll" 
                                    value={formData.project_name}
                                    onChange={e => setFormData({...formData, project_name: e.target.value})}
                                    className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-900 font-bold flex items-center gap-2">
                                    Target Company <span className="text-rose-500">*</span>
                                </Label>
                                <Select 
                                    value={formData.company} 
                                    onValueChange={val => setFormData({...formData, company: val})}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="label" className="text-slate-900 font-bold">Label / Month</Label>
                                <Input 
                                    id="label" 
                                    placeholder="e.g. Oct-2026" 
                                    value={formData.label}
                                    onChange={e => setFormData({...formData, label: e.target.value})}
                                    className="h-12 border-slate-200 rounded-xl"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="trigger_date" className="text-indigo-600 font-black flex items-center gap-2">
                                    Trigger Date <span className="text-rose-500">*</span>
                                </Label>
                                <Input 
                                    id="trigger_date" 
                                    type="date"
                                    value={formData.trigger_date}
                                    onChange={e => setFormData({...formData, trigger_date: e.target.value})}
                                    className="h-12 border-indigo-200 bg-indigo-50/50 rounded-xl focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-900 font-bold">Status</Label>
                                <Select 
                                    value={formData.status} 
                                    onValueChange={val => setFormData({...formData, status: val})}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 rounded-xl">
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
                                <Label htmlFor="date_from" className="text-slate-900 font-bold flex items-center gap-2">
                                    Period From <span className="text-rose-500">*</span>
                                </Label>
                                <Input 
                                    id="date_from" 
                                    type="date"
                                    value={formData.date_from}
                                    onChange={e => setFormData({...formData, date_from: e.target.value})}
                                    className="h-12 border-slate-200 rounded-xl"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="date_to" className="text-slate-900 font-bold flex items-center gap-2">
                                    Period To <span className="text-rose-500">*</span>
                                </Label>
                                <Input 
                                    id="date_to" 
                                    type="date"
                                    value={formData.date_to}
                                    onChange={e => setFormData({...formData, date_to: e.target.value})}
                                    className="h-12 border-slate-200 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-slate-100">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Project Configuration Defaults</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase">Salary Calc Days</Label>
                                    <Input 
                                        type="number" 
                                        value={formData.salary_calculation_days}
                                        onChange={e => setFormData({...formData, salary_calculation_days: parseInt(e.target.value) || 30})}
                                        className="h-11 border-slate-100 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase">Weekly Off Override</Label>
                                    <Select 
                                        value={formData.weekly_off_override} 
                                        onValueChange={val => setFormData({...formData, weekly_off_override: val})}
                                    >
                                        <SelectTrigger className="h-11 border-slate-100 rounded-xl">
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-bold text-slate-900">Carry Grace</Label>
                                        <p className="text-[10px] text-slate-500 uppercase font-medium">Use carried grace minutes</p>
                                    </div>
                                    <Switch 
                                        checked={formData.use_carried_grace_minutes}
                                        onCheckedChange={val => setFormData({...formData, use_carried_grace_minutes: val})}
                                    />
                                </div>
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-bold text-slate-900">Ramadan Gift</Label>
                                        <p className="text-[10px] text-slate-500 uppercase font-medium">Apply gift minutes</p>
                                    </div>
                                    <Switch 
                                        checked={formData.use_gift_minutes}
                                        onCheckedChange={val => setFormData({...formData, use_gift_minutes: val})}
                                    />
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between p-6 rounded-[1.5rem] bg-indigo-600 text-white shadow-lg shadow-indigo-100">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-black">Dry Run Mode</Label>
                                    <p className="text-xs text-indigo-100 font-medium">Test automation without creating any projects</p>
                                </div>
                                <Switch 
                                    className="data-[state=checked]:bg-white data-[state=checked]:text-indigo-600"
                                    checked={formData.is_dry_run}
                                    onCheckedChange={val => setFormData({...formData, is_dry_run: val})}
                                />
                            </div>
                        </div>

                        <DialogFooter className="pt-4 gap-3">
                            <Button type="button" variant="ghost" onClick={handleCloseDialog} className="h-12 px-6 rounded-xl font-bold text-slate-500 hover:bg-slate-50">
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={upsertMutation.isPending}
                                className="h-12 min-w-[160px] rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 transition-all hover:-translate-y-0.5"
                            >
                                {upsertMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                                {editingRow ? 'Update Row' : 'Save Automation'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}