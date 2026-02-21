import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function PendingApprovals({ userRole }) {
    const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';

    const { data: pendingCount = 0 } = useQuery({
        queryKey: ['pendingExceptionsCount'],
        queryFn: async () => {
            if (!isAdminOrSupervisor) return 0;
            const exceptions = await base44.entities.Exception.list();
            return exceptions.filter(e => e.approval_status === 'pending').length;
        },
        enabled: isAdminOrSupervisor
    });

    if (!isAdminOrSupervisor || pendingCount === 0) return null;

    return (
        <Link to={createPageUrl('ExceptionApprovals')}>
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer bg-gradient-to-br from-amber-50 to-white">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-amber-100 p-3 rounded-xl">
                                <AlertTriangle className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-600 font-medium">Pending Approvals</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{pendingCount}</p>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-xs text-amber-700 mt-3">
                        {pendingCount} exception{pendingCount !== 1 ? 's' : ''} awaiting review
                    </p>
                </CardContent>
            </Card>
        </Link>
    );
}