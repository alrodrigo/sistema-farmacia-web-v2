import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();
    const setUser = useAuthStore((state) => state.setUser);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            setError('Credenciales incorrectas');
            setIsLoading(false);
            return;
        }

        if (authData.user) {
            // Cargar rol y estado activo inmediatamente para evitar parpadeos o accesos no autorizados
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role_id, is_active, roles(name)')
                .eq('id', authData.user.id)
                .single();

            // Si el usuario está suspendido por un administrador:
            if (profile && profile.is_active === false) {
                await supabase.auth.signOut();
                useAuthStore.getState().clearUser();
                setError('Acceso denegado: Esta cuenta se encuentra suspendida. Contacta al administrador.');
                setIsLoading(false);
                return;
            }

            const roleData = profile?.roles as any;
            const roleName = (Array.isArray(roleData) ? roleData[0]?.name : roleData?.name) ?? null;

            setUser(authData.user, roleName);
            navigate('/');
        }

        setIsLoading(false);
    };

    return (
        <div className="h-screen w-full bg-gray-200 flex items-center justify-center font-sans">
            <div className="bg-white p-8 rounded-lg shadow-xl w-96">
                <h1 className="text-2xl font-bold text-gray-800 text-center mb-6">Farmacia POS</h1>

                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm text-center">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Usuario</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors mt-4 disabled:bg-gray-400"
                    >
                        {isLoading ? 'Iniciando sesión...' : 'Entrar al Sistema'}
                    </button>
                </form>
            </div>
        </div>
    );
}