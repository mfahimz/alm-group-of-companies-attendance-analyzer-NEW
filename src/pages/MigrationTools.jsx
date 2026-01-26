import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function MigrationTools() {
    const [migrationResult, setMigrationResult] = useState(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [fixingAttendance, setFixingAttendance] = useState(false);
    const [fixResult, setFixResult] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const runMigration = async () => {
        if (!confirm('⚠️ WARNING: This will DELETE ALL existing quarterly minutes records and create fresh calendar-based records for Q1 2026. This cannot be undone. Continue?')) {
            return;
        }

        setIsMigrating(true);
        try {
            const response = await base44.functions.invoke('migrateToCalendarQuarters', {
                confirm_delete_all: true
            });

            if (response.data.success) {
                setMigrationResult(response.data);
                toast.success('Migration completed successfully');
            } else {
                toast.error(response.data.error || 'Migration failed');
            }
        } catch (error) {
            toast.error('Migration error: ' + error.message);
        } finally {
            setIsMigrating(false);
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Migration Tools' }
            ]} />

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-4">
                    <Database className="w-8 h-8 text-red-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">Migration Tools</h1>
                <p className="text-lg text-slate-600 mt-3">One-time data migration utilities (Admin only)</p>
            </div>

            {/* Migration Card */}
            <Card className="border-2 border-red-300 bg-red-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-900">
                        <AlertTriangle className="w-6 h-6" />
                        Migrate to Calendar-Based Quarterly Minutes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="bg-white border border-red-200 rounded-lg p-4">
                            <h3 className="font-semibold text-red-900 mb-2">⚠️ CRITICAL WARNING</h3>
                            <p className="text-sm text-red-800 mb-3">
                                This migration will <strong>DELETE ALL</strong> existing quarterly minutes records 
                                (both calendar-based and project-based) and create fresh calendar-based records for Q1 2026.
                            </p>
                            <p className="text-sm text-red-800 mb-3">
                                <strong>What this does:</strong>
                            </p>
                            <ul className="text-sm text-red-700 space-y-1 ml-4">
                                <li>✗ Deletes all existing EmployeeQuarterlyMinutes records</li>
                                <li>✓ Creates new records for Q1 2026 (Jan-Mar 2026)</li>
                                <li>✓ One record per active employee per company</li>
                                <li>✓ Initializes with 120 minutes (or employee's custom limit)</li>
                                <li>✓ Sets used_minutes = 0, remaining_minutes = total</li>
                            </ul>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h3 className="font-semibold text-amber-900 mb-2">📋 Before Running:</h3>
                            <ul className="text-sm text-amber-800 space-y-1">
                                <li>1. Backup your database (if possible)</li>
                                <li>2. Ensure all active employees have correct company assignments</li>
                                <li>3. Verify employee profiles have approved_other_minutes_limit set</li>
                                <li>4. Run this ONCE - do not run multiple times</li>
                            </ul>
                        </div>

                        <Button
                            onClick={runMigration}
                            disabled={isMigrating}
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isMigrating ? 'Migrating...' : 'Run Migration (Delete & Recreate)'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Migration Result */}
            {migrationResult && (
                <Card className="border-2 border-green-300 bg-green-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-900">
                            <CheckCircle className="w-6 h-6" />
                            Migration Complete
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="bg-white border border-green-200 rounded-lg p-4">
                                <p className="font-semibold text-green-900 mb-3">{migrationResult.message}</p>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-slate-600">Deleted Old Records</p>
                                        <p className="font-bold text-slate-900">{migrationResult.migration_summary.deleted_old_records}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-600">Created New Records</p>
                                        <p className="font-bold text-slate-900">{migrationResult.migration_summary.created_new_records}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-600">Active Employees</p>
                                        <p className="font-bold text-slate-900">{migrationResult.migration_summary.active_employees}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-600">Quarter Initialized</p>
                                        <p className="font-bold text-slate-900">{migrationResult.migration_summary.quarter_initialized}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-slate-600">Period</p>
                                        <p className="font-bold text-slate-900">{migrationResult.migration_summary.quarter_period}</p>
                                    </div>
                                </div>

                                {migrationResult.migration_summary.duplicates_found > 0 && (
                                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-3">
                                        <p className="text-sm text-amber-900">
                                            ⚠️ Found {migrationResult.migration_summary.duplicates_found} duplicate records after migration. 
                                            Run cleanup to remove them.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-semibold text-blue-900 mb-2">✓ Next Steps:</h4>
                                <ol className="text-sm text-blue-800 space-y-1">
                                    <li>1. Go to Quarterly Minutes Management page to verify records</li>
                                    <li>2. Test department head approval workflow</li>
                                    <li>3. Run a test analysis on a project to confirm approvals work</li>
                                    <li>4. Monitor for any issues in the next few days</li>
                                </ol>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}