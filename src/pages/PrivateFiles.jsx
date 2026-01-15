import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertCircle } from 'lucide-react';
import PrivateFileManager from '@/components/ui/PrivateFileManager';

export default function PrivateFilesPage() {
    const { data: currentUser, isLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-red-600">Authentication required</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                    <Lock className="w-8 h-8" />
                    Private Files
                </h1>
                <p className="text-slate-600 mt-1">Securely store and share sensitive reports with expiring access links</p>
            </div>

            {/* Info Alert */}
            <Alert className="border-blue-200 bg-blue-50">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                    Private files are encrypted and stored securely. You can generate expiring download links to share with team members.
                </AlertDescription>
            </Alert>

            {/* File Manager */}
            <PrivateFileManager company={currentUser.company} />
        </div>
    );
}