import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function IPAccessControl({ children }) {
    const [currentIP, setCurrentIP] = useState(null);
    const [checking, setChecking] = useState(true);
    const [blocked, setBlocked] = useState(false);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: settings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        const checkIP = async () => {
            try {
                // Get current IP
                const ipResponse = await fetch('https://api.ipify.org?format=json');
                const { ip } = await ipResponse.json();
                setCurrentIP(ip);

                // Find IP whitelist setting
                const ipWhitelistSetting = settings.find(s => s.setting_key === 'ip_whitelist');
                
                if (!ipWhitelistSetting || !ipWhitelistSetting.setting_value) {
                    // No whitelist configured - allow all
                    setBlocked(false);
                    setChecking(false);
                    return;
                }

                const allowedIPs = ipWhitelistSetting.setting_value.split(',').map(ip => ip.trim()).filter(Boolean);
                
                // If whitelist is empty, allow all
                if (allowedIPs.length === 0) {
                    setBlocked(false);
                    setChecking(false);
                    return;
                }

                // Check if current IP is in whitelist (supports wildcards)
                const isAllowed = allowedIPs.some(allowedIP => {
                    if (allowedIP === '*') return true;
                    if (allowedIP.endsWith('.*')) {
                        const prefix = allowedIP.slice(0, -2);
                        return ip.startsWith(prefix);
                    }
                    return ip === allowedIP;
                });

                setBlocked(!isAllowed);
                setChecking(false);

                // Log access attempt
                if (!isAllowed) {
                    await base44.functions.invoke('logAudit', {
                        action: 'ACCESS',
                        entity_type: 'System',
                        entity_name: 'IP Blocked Access',
                        details: `Blocked access attempt from IP: ${ip}`,
                        success: false,
                        error_message: 'IP address not in whitelist'
                    });
                }
            } catch (error) {
                console.error('IP check failed:', error);
                // On error, allow access (fail open)
                setBlocked(false);
                setChecking(false);
            }
        };

        if (currentUser && settings.length > 0) {
            checkIP();
        }
    }, [currentUser, settings]);

    if (checking) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <Shield className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-pulse" />
                    <p className="text-slate-600">Verifying access...</p>
                </div>
            </div>
        );
    }

    if (blocked) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-slate-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border-red-200 shadow-xl">
                    <CardContent className="p-8 text-center">
                        <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
                        <p className="text-slate-600 mb-4">
                            Your IP address is not authorized to access this system.
                        </p>
                        <div className="bg-slate-50 rounded-lg p-4 mb-4">
                            <p className="text-sm text-slate-500 mb-1">Your IP Address:</p>
                            <p className="text-lg font-mono font-semibold text-slate-900">{currentIP}</p>
                        </div>
                        <p className="text-sm text-slate-500">
                            Please contact your system administrator if you believe this is an error.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return <>{children}</>;
}