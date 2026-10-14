import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuthStore } from './stores/authStore';
import { router } from './routes/router';
import { registerOnlineListener, flushPendingSales } from './features/pos/services/sales';

export default function App() {
    const { setUser } = useAuthStore();
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user ?? null;
            
            if (user) {
                // Obtener rol desde user_profiles
                const { data: profile, error } = await supabase
                    .from('user_profiles')
                    .select('role_id, roles(name)')
                    .eq('id', user.id)
                    .single();
                
                if (error) {
                    console.warn("Error cargando perfil de usuario:", error.message);
                }

                const roleData = profile?.roles as any;
                const roleName = (Array.isArray(roleData) ? roleData[0]?.name : roleData?.name) ?? null;
                console.log("👤 Sesión iniciada:", user.email, "| Rol detectado:", roleName);
                setUser(user, roleName);
            } else {
                setUser(null, null);
            }
            setIsInitializing(false);
        };

        loadUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const user = session?.user ?? null;
            
            if (user) {
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('role_id, roles(name)')
                    .eq('id', user.id)
                    .single();
                
                const roleData = profile?.roles as any;
                const roleName = (Array.isArray(roleData) ? roleData[0]?.name : roleData?.name) ?? null;
                setUser(user, roleName);
            } else {
                setUser(null, null);
            }
        });

        registerOnlineListener(async () => {
            console.log("🌐 Internet restaurado. Sincronizando BD...");
            await flushPendingSales();
        });

        return () => subscription.unsubscribe();
    }, [setUser]);

    if (isInitializing) {
        return <div className="h-screen flex items-center justify-center bg-background text-on-surface">Inicializando PharmaCore...</div>;
    }

    return <RouterProvider router={router} />;
}