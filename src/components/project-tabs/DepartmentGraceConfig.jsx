import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

const DEPARTMENTS = ['Admin', 'Operations', 'Front Office', 'Housekeeping'];

export default function DepartmentGraceConfig({ project }) {
    const [config, setConfig] = useState({});
    const queryClient = useQueryClient();

    useEffect(() => {
        if (project.grace_minutes_config) {
            try {
                setConfig(JSON.parse(project.grace_minutes_config));
            } catch (e) {
                console.error('Failed to parse grace minutes config', e);
                setConfig({});
            }
        }
    }, [project]);

    const updateMutation = useMutation({
        mutationFn: (newConfig) => base44.entities.Project.update(project.id, {
            grace_minutes_config: JSON.stringify(newConfig)
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            toast.success('Grace minutes configuration saved');
        },
        onError: () => {
            toast.error('Failed to save configuration');
        }
    });

    const handleSave = () => {
        updateMutation.mutate(config);
    };

    const handleChange = (dept, value) => {
        setConfig(prev => ({
            ...prev,
            [dept]: parseInt(value) || 0
        }));
    };

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader>
                <CardTitle className="text-lg font-semibold">Department Grace Minutes</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {DEPARTMENTS.map(dept => (
                        <div key={dept} className="space-y-2">
                            <Label>{dept}</Label>
                            <div className="relative">
                                <Input
                                    type="number"
                                    min="0"
                                    value={config[dept] ?? 15} // Default to 15 if not set
                                    onChange={(e) => handleChange(dept, e.target.value)}
                                    className="pr-12"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                                    min
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end">
                    <Button 
                        onClick={handleSave} 
                        disabled={updateMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}