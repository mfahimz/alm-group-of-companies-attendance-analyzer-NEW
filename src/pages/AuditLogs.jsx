import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, RefreshCw } from 'lucide-react';
import { formatInUAE } from '@/components/ui/timezone';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/components/ui/PageTitle';

export default function AuditLogs() {
    usePageTitle('Audit Logs');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('all');
    const [entityFilter, setEntityFilter] = useState('all');

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: auditLogs = [], isLoading, refetch } = useQuery({
        queryKey: ['auditLogs'],
        queryFn: () => base44.entities.AuditLog.list('-created_date', 500),
        staleTime: 30 * 1000
    });

    // Filter logs
    const filteredLogs = auditLogs.filter(log => {
        const matchesSearch = searchTerm === '' || 
            log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.action_type?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
        const matchesEntity = entityFilter === 'all' || log.entity_name === entityFilter;

        return matchesSearch && matchesAction && matchesEntity;
    });

    // Get unique action types and entity names for filters
    const actionTypes = ['all', ...new Set(auditLogs.map(log => log.action_type).filter(Boolean))];
    const entityNames = ['all', ...new Set(auditLogs.map(log => log.entity_name).filter(Boolean))];

    const getActionBadgeVariant = (action) => {
        if (action?.includes('create')) return 'default';
        if (action?.includes('update') || action?.includes('edit')) return 'secondary';
        if (action?.includes('delete')) return 'destructive';
        if (action?.includes('approve')) return 'default';
        return 'outline';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-[#6B7280]">Loading audit logs...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Audit Logs</h1>
                    <p className="text-[#6B7280] mt-1">Complete audit trail of all system actions</p>
                </div>
                <Button onClick={() => refetch()} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filter Logs</CardTitle>
                    <CardDescription>Search and filter audit trail entries</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6B7280] w-4 h-4" />
                            <Input
                                placeholder="Search user, entity, action..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={actionFilter} onValueChange={setActionFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by action" />
                            </SelectTrigger>
                            <SelectContent>
                                {actionTypes.map(action => (
                                    <SelectItem key={action} value={action}>
                                        {action === 'all' ? 'All Actions' : action}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={entityFilter} onValueChange={setEntityFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by entity" />
                            </SelectTrigger>
                            <SelectContent>
                                {entityNames.map(entity => (
                                    <SelectItem key={entity} value={entity}>
                                        {entity === 'all' ? 'All Entities' : entity}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Audit Trail</CardTitle>
                    <CardDescription>Showing {filteredLogs.length} of {auditLogs.length} entries</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Timestamp</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Entity</TableHead>
                                    <TableHead>Entity ID</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center text-[#6B7280] py-8">
                                            <FileText className="w-12 h-12 mx-auto mb-2 opacity-40" />
                                            No audit logs found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-sm">
                                                {formatInUAE(new Date(log.created_date), 'MMM dd, yyyy HH:mm:ss')}
                                            </TableCell>
                                            <TableCell className="text-sm font-medium">
                                                {log.user_email}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {log.user_role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getActionBadgeVariant(log.action_type)}>
                                                    {log.action_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.entity_name || '-'}
                                            </TableCell>
                                            <TableCell className="text-sm font-mono text-xs">
                                                {log.entity_id ? log.entity_id.substring(0, 8) + '...' : '-'}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {log.company || '-'}
                                            </TableCell>
                                            <TableCell>
                                                {log.changes && (
                                                    <details className="cursor-pointer">
                                                        <summary className="text-xs text-blue-600 hover:text-blue-800">
                                                            View changes
                                                        </summary>
                                                        <pre className="text-xs mt-2 p-2 bg-slate-50 rounded border max-w-md overflow-auto">
                                                            {(() => { try { return JSON.stringify(JSON.parse(log.changes), null, 2); } catch { return log.changes; } })()}
                                                        </pre>
                                                    </details>
                                                )}
                                                {log.context && (
                                                    <details className="cursor-pointer mt-1">
                                                        <summary className="text-xs text-green-600 hover:text-green-800">
                                                            View context
                                                        </summary>
                                                        <pre className="text-xs mt-2 p-2 bg-slate-50 rounded border max-w-md overflow-auto">
                                                            {(() => { try { return JSON.stringify(JSON.parse(log.context), null, 2); } catch { return log.context; } })()}
                                                        </pre>
                                                    </details>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}