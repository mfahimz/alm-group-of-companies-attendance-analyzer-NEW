import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Trash2, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function IPManagement() {
    const [newIP, setNewIP] = useState('');
    const [currentUserIP, setCurrentUserIP] = useState(null);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: settings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list()
    });

    // Get current IP
    React.useEffect(() => {
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => setCurrentUserIP(data.ip))
            .catch(() => setCurrentUserIP('Unknown'));
    }, []);

    const ipWhitelistSetting = settings.find(s => s.setting_key === 'ip_whitelist');
    const allowedIPs = ipWhitelistSetting?.setting_value 
        ? ipWhitelistSetting.setting_value.split(',').map(ip => ip.trim()).filter(Boolean)
        : [];

    const updateMutation = useMutation({
        mutationFn: async (newIPList) => {
            if (ipWhitelistSetting) {
                await base44.entities.SystemSettings.update(ipWhitelistSetting.id, {
                    setting_value: newIPList.join(', ')
                });
            } else {
                await base44.entities.SystemSettings.create({
                    setting_key: 'ip_whitelist',
                    setting_value: newIPList.join(', '),
                    description: 'Comma-separated list of allowed IP addresses. Supports wildcards (e.g., 192.168.*)'
                });
            }
            
            // Log the change
            await base44.functions.invoke('logAudit', {
                action: 'UPDATE',
                entity_type: 'SystemSettings',
                entity_name: 'IP Whitelist',
                old_data: { ips: allowedIPs },
                new_data: { ips: newIPList },
                details: 'Updated IP whitelist configuration'
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['systemSettings']);
            toast.success('IP whitelist updated');
        },
        onError: () => {
            toast.error('Failed to update IP whitelist');
        }
    });

    const handleAddIP = () => {
        if (!newIP.trim()) {
            toast.error('Please enter an IP address');
            return;
        }

        // Basic validation
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^(\d{1,3}\.){2}\d{1,3}\.\*$|^(\d{1,3}\.){1}\d{1,3}\.\*\.\*$|^\*$/;
        if (!ipPattern.test(newIP.trim())) {
            toast.error('Invalid IP format. Use format like 192.168.1.1 or 192.168.* or *');
            return;
        }

        if (allowedIPs.includes(newIP.trim())) {
            toast.error('This IP is already in the whitelist');
            return;
        }

        const newList = [...allowedIPs, newIP.trim()];
        updateMutation.mutate(newList);
        setNewIP('');
    };

    const handleRemoveIP = (ipToRemove) => {
        const newList = allowedIPs.filter(ip => ip !== ipToRemove);
        updateMutation.mutate(newList);
    };

    const handleDisableWhitelist = () => {
        updateMutation.mutate([]);
    };

    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-900">Access Denied</h2>
                    <p className="text-slate-600 mt-2">This page is only accessible to System Administrators</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'IP Access Management' }]} />
            
            <div>
                <h1 className="text-3xl font-bold text-slate-900">IP Access Management</h1>
                <p className="text-slate-600 mt-2">Control which IP addresses can access the system</p>
            </div>

            {/* Current IP */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-indigo-50 to-white">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600 mb-1">Your Current IP Address</p>
                            <p className="text-2xl font-mono font-bold text-slate-900">{currentUserIP || 'Loading...'}</p>
                        </div>
                        <Shield className="w-12 h-12 text-indigo-600" />
                    </div>
                </CardContent>
            </Card>

            {/* Warning */}
            <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="font-semibold text-amber-900">Warning</p>
                            <p className="text-sm text-amber-800 mt-1">
                                Be careful when configuring IP whitelist. Make sure to add your current IP before enabling restrictions, 
                                or you may lock yourself out of the system.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Add IP */}
            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Add Allowed IP Address</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            placeholder="e.g., 192.168.1.1 or 192.168.* or * (allow all)"
                            value={newIP}
                            onChange={(e) => setNewIP(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddIP()}
                        />
                        <Button 
                            onClick={handleAddIP}
                            disabled={updateMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add IP
                        </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold">Supported formats:</p>
                                <ul className="list-disc list-inside mt-1 space-y-1">
                                    <li><span className="font-mono">192.168.1.1</span> - Specific IP address</li>
                                    <li><span className="font-mono">192.168.1.*</span> - All IPs starting with 192.168.1</li>
                                    <li><span className="font-mono">192.168.*</span> - All IPs starting with 192.168</li>
                                    <li><span className="font-mono">*</span> - Allow all IPs (disables whitelist)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Whitelist Status */}
            <Card className="border-0 shadow-md">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>IP Whitelist Status</CardTitle>
                        {allowedIPs.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDisableWhitelist}
                                disabled={updateMutation.isPending}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                Disable Whitelist
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {allowedIPs.length === 0 ? (
                        <div className="text-center py-8">
                            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No IP restrictions configured</p>
                            <p className="text-sm text-slate-400 mt-1">All IP addresses can access the system</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-slate-600">
                                    <span className="font-semibold">{allowedIPs.length}</span> IP address{allowedIPs.length !== 1 ? 'es' : ''} allowed
                                </p>
                                <Badge className="bg-green-100 text-green-800">Active</Badge>
                            </div>
                            <div className="space-y-2">
                                {allowedIPs.map((ip, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span className="font-mono text-sm font-medium text-slate-900">{ip}</span>
                                            {ip === currentUserIP && (
                                                <Badge className="bg-indigo-100 text-indigo-800 text-xs">Your IP</Badge>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveIP(ip)}
                                            disabled={updateMutation.isPending}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}