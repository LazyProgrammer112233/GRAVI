import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Loader2, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
                if (authError) throw authError;
                navigate('/app');
            } else {
                const { error: authError } = await supabase.auth.signUp({ email, password });
                if (authError) throw authError;
                alert('Check your email for the confirmation link!');
            }
        } catch (err) {
            const rawMsg = err.message || '';

            // Detect network timeouts / unreachable endpoints
            if (
                err.name === 'AbortError' ||
                rawMsg.toLowerCase().includes('failed to fetch') ||
                rawMsg.toLowerCase().includes('network error') ||
                rawMsg.toLowerCase().includes('timeout')
            ) {
                setError('Network error: Unable to reach the authentication server. Please check your internet connection or try again later.');
            } else {
                setError(rawMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-bg-blob"></div>

            <button className="btn btn-glass" style={{ position: 'absolute', top: '2rem', left: '2rem' }} onClick={() => navigate('/')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Home
            </button>

            <div className="glass-card auth-card">
                <h2 className="auth-title">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="auth-subtitle">
                    {isLogin ? 'Enter your details to access GRAVI.' : 'Sign up to start analyzing retail intelligence.'}
                </p>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleAuth} className="auth-form">
                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <div className="input-with-icon">
                            <Mail className="input-icon" size={18} />
                            <input
                                type="email"
                                className="input-field pl-10"
                                placeholder="you@company.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Password</label>
                        <div className="input-with-icon">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                className="input-field pl-10"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary auth-btn" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Sign In' : 'Sign Up')}
                    </button>
                </form>

                <div className="auth-switch">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button className="btn-link" type="button" onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </div>
            </div>
        </div>
    );
}
