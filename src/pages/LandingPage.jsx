import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Activity, ShieldCheck, Zap } from 'lucide-react';
import logoImg from '../assets/logo11.png';

export default function LandingPage() {
    const navigate = useNavigate();
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="landing-container">
            {/* Dynamic Cursor Blob */}
            <div
                className="cursor-blob"
                style={{
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                }}
            />

            {/* Navigation */}
            <nav className="glass-nav">
                <div className="nav-content">
                    <div className="logo">
                        <img src={logoImg} alt="GRAVI Logo" style={{ height: '36px', objectFit: 'contain', borderRadius: '8px' }} />
                        <span>GRAVI</span>
                    </div>
                    <button className="btn btn-glass" onClick={() => navigate('/login')}>
                        Login
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="hero">
                <div className="hero-content fade-in-up">
                    <div className="badge-glass fade-in-up" style={{ animationDelay: '0.1s' }}>
                        ✨ Version 1.0 is now live
                    </div>
                    <h1 className="hero-title fade-in-up" style={{ animationDelay: '0.2s' }}>
                        General Retail Artificial Vision Intelligence <br />
                        <span className="text-gradient">For the Indian Market</span>
                    </h1>
                    <p className="hero-desc fade-in-up" style={{ animationDelay: '0.3s' }}>
                        GRAVI analyzes Kirana store exteriors and shelves with unprecedented accuracy.
                        Detect brands, estimate shelf density, and validate geo-authenticity in seconds.
                    </p>
                    <div className="hero-actions fade-in-up" style={{ animationDelay: '0.4s' }}>
                        <button className="btn btn-primary btn-large" onClick={() => navigate('/login')}>
                            Get Started <ArrowRight size={18} />
                        </button>
                    </div>
                </div>

                {/* Feature Cards Setup */}
                <div className="features-grid">
                    <div className="feature-card glass-card fade-in-up" style={{ animationDelay: '0.5s' }}>
                        <div className="feature-icon"><Zap size={24} /></div>
                        <h3>Qwen2.5-VL Powered</h3>
                        <p>State-of-the-art vision models engineered to understand complex, cluttered retail environments.</p>
                    </div>
                    <div className="feature-card glass-card fade-in-up" style={{ animationDelay: '0.6s' }}>
                        <div className="feature-icon"><ShieldCheck size={24} /></div>
                        <h3>Geo-Validation</h3>
                        <p>Automatically cross-checks store names against real-world coordinates via OpenStreetMap APIs.</p>
                    </div>
                    <div className="feature-card glass-card fade-in-up" style={{ animationDelay: '0.7s' }}>
                        <div className="feature-icon"><Activity size={24} /></div>
                        <h3>Actionable Insights</h3>
                        <p>Extract shelf share, out-of-stock signals, and category dominance instantly.</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
