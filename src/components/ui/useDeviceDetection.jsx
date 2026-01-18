import { useState, useEffect } from 'react';

export function useDeviceDetection() {
    const [isDesktop, setIsDesktop] = useState(true);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const checkDevice = () => {
            // Check 1: Screen width must be >= 1024px
            const isWidthDesktop = window.innerWidth >= 1024;

            // Check 2: User agent check
            const userAgent = navigator.userAgent.toLowerCase();
            const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent);

            // Check 3: Pointer type (fine = mouse/trackpad, coarse = touch)
            const hasFinePrimaryPointer = window.matchMedia('(pointer: fine)').matches;

            // Device is desktop ONLY if all checks pass
            const isDesktopDevice = isWidthDesktop && !isMobileUA && hasFinePrimaryPointer;

            setIsDesktop(isDesktopDevice);
            setIsChecking(false);
        };

        // Initial check
        checkDevice();

        // Listen for resize events
        const handleResize = () => {
            checkDevice();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return { isDesktop, isChecking };
}