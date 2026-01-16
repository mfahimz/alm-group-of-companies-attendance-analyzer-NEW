import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Wrench, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function MaintenanceSettingsPage() {
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: maintenanceMode, isLoading } = useQuery({
        queryKey: ['maintenanceMode'],
        queryFn: async () => {
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'MAINTENANCE_MODE' 
            });
            if (settings.length > 0) {
                return settings[0].setting_value === 'true';
            }
            return false;
        }
    });

    const toggleMaintenanceMutation = useMutation({
        mutationFn: async (enabled) => {
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'MAINTENANCE_MODE' 
            });
            
            if (settings.length > 0) {
                await base44.entities.SystemSettings.update(settings[0].id, {
                    setting_value: enabled.toString()
                });
            } else {
                await base44.entities.SystemSettings.create({
                    setting_key: 'MAINTENANCE_MODE',
                    setting_value: enabled.toString(),
                    description: 'Global maintenance mode for all non-admin users'
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['maintenanceMode']);
            toast.success('Maintenance mode updated successfully');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    if (currentUser?.role !== 'admin' && currentUser?.extended_role !== 'ceo') {
        return (
            <div className="p-6">
                <Card className="border-red-200">
                    <CardContent className="p-6">
                        <p className="text-red-600">Access denied. Admin only.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900">Maintenance Settings</h1>
                <p className="text-slate-600 mt-1">Control system-wide maintenance mode</p>
            </div>

            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-indigo-600" />
                        Global Maintenance Mode
                    </CardTitle>
                    <CardDescription>
                        When enabled, all non-admin users will see a maintenance page
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-4">
                            <Switch
                                checked={maintenanceMode || false}
                                onCheckedChange={(checked) => toggleMaintenanceMutation.mutate(checked)}
                                disabled={isLoading || toggleMaintenanceMutation.isPending}
                            />
                            <div>
                                <Label className="text-base font-semibold">
                                    Maintenance Mode
                                </Label>
                                <p className="text-sm text-slate-600 mt-1">
                                    {maintenanceMode 
                                        ? 'System is currently in maintenance mode' 
                                        : 'System is operational'}
                                </p>
                            </div>
                        </div>
                        <div>
                            {maintenanceMode ? (
                                <div className="flex items-center gap-2 text-amber-600">
                                    <AlertTriangle className="w-5 h-5" />
                                    <span className="font-medium">Active</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="font-medium">Inactive</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Warning Message */}
                    {maintenanceMode && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">Maintenance Mode Active</p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        All users except admins are currently seeing the maintenance page. 
                                        Regular operations are suspended.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Info */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <h3 className="font-semibold text-indigo-900 mb-2">How it works</h3>
                        <ul className="text-sm text-indigo-700 space-y-1">
                            <li>• When enabled, all non-admin users will be redirected to a branded maintenance page</li>
                            <li>• Admin users can still access all features normally</li>
                            <li>• Use this during system upgrades or critical maintenance</li>
                            <li>• Users will see information about all ALM Group companies</li>
                        </ul>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-3 pt-4">
                        <Button
                            variant={maintenanceMode ? "default" : "outline"}
                            onClick={() => toggleMaintenanceMutation.mutate(true)}
                            disabled={maintenanceMode || toggleMaintenanceMutation.isPending}
                        >
                            Enable Maintenance
                        </Button>
                        <Button
                            variant={!maintenanceMode ? "default" : "outline"}
                            onClick={() => toggleMaintenanceMutation.mutate(false)}
                            disabled={!maintenanceMode || toggleMaintenanceMutation.isPending}
                        >
                            Disable Maintenance
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}