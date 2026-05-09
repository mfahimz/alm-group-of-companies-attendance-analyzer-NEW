import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CompanyContext = createContext();

export const useCompanyFilter = () => {
    const context = useContext(CompanyContext);
    if (!context) {
        // Return safe defaults instead of throwing — prevents HMR cascade crashes
        return {
            selectedCompany: null,
            setSelectedCompany: () => {},
            clearCompanyFilter: () => {},
            canSwitchCompany: false,
            userCompany: null,
            isLoading: true
        };
    }
    return context;
};

export const CompanyFilterProvider = ({ children }) => {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Get selected company from localStorage only
    const [selectedCompany, setSelectedCompanyState] = useState(() => {
        return localStorage.getItem('selectedCompany');
    });

    // Use extended_role for accurate role checks
    const userRole = currentUser?.extended_role || currentUser?.role;

    // HR Manager, admin, ceo, supervisor can access all companies (switch freely)
    const canSwitchCompany = userRole === 'admin' || 
                            userRole === 'ceo' || 
                            userRole === 'supervisor' ||
                            userRole === 'hr_manager';

    // Update when user data loads or role changes
    useEffect(() => {
        if (!currentUser) return;

        if (!selectedCompany) {
            setSelectedCompanyState(currentUser.company);
        }

        if (!canSwitchCompany && selectedCompany !== currentUser.company) {
            setSelectedCompanyState(currentUser.company);
        }
    }, [currentUser, selectedCompany, userRole]);

    const setSelectedCompany = (company) => {
        setSelectedCompanyState(company);
        if (company) {
            localStorage.setItem('selectedCompany', company);
        } else {
            localStorage.removeItem('selectedCompany');
        }
    };

    const clearCompanyFilter = () => {
        setSelectedCompanyState(null);
        localStorage.removeItem('selectedCompany');
    };

    // Effective company for filtering (for non-privileged users, always use their assigned company)
    const effectiveCompany = canSwitchCompany ? (selectedCompany || currentUser?.company || null) : currentUser?.company;

    const value = {
        selectedCompany: effectiveCompany,
        setSelectedCompany: canSwitchCompany ? setSelectedCompany : () => {},
        clearCompanyFilter: canSwitchCompany ? clearCompanyFilter : () => {},
        canSwitchCompany,
        userCompany: currentUser?.company,
        isLoading: !currentUser
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
};