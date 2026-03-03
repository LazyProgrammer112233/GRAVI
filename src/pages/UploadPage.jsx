import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon, Loader2, MapPin, Settings } from 'lucide-react';
import BackgroundParticles from '../components/BackgroundParticles';
import { fetchInternVL2Analysis } from '../lib/inference';

export default function UploadPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mapsUrl, setMapsUrl] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Settings modal state
    const [showSettings, setShowSettings] = useState(false);
    const [replicateKey, setReplicateKey] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [supabaseUrl, setSupabaseUrl] = useState('');

    useEffect(() => {
        const storedReplicate = localStorage.getItem('gravi_replicate_key') || '';
        const storedSupabaseKey = localStorage.getItem('gravi_supabase_key') || '';
        const storedSupabaseUrl = localStorage.getItem('gravi_supabase_url') || '';
        setReplicateKey(storedReplicate);
        setSupabaseKey(storedSupabaseKey);
        setSupabaseUrl(storedSupabaseUrl);
    }, []);

    const saveSettings = () => {
        localStorage.setItem('gravi_replicate_key', replicateKey);
        localStorage.setItem('gravi_supabase_key', supabaseKey);
        localStorage.setItem('gravi_supabase_url', supabaseUrl);
        setShowSettings(false);
    };

    const handleAnalyze = async () => {
        setErrorMsg('');
        setLoading(true);

        try {
            const token = localStorage.getItem('gravi_replicate_key');
            if (!token) {
                setErrorMsg("Please configure your Replicate API Key in Settings first.");
                setLoading(false);
                setShowSettings(true);
                return;
            }

            const isValidUrl = mapsUrl.includes('google.com/maps') ||
                mapsUrl.includes('goo.gl/maps') ||
                mapsUrl.includes('maps.app.goo.gl');

            if (!isValidUrl) {
                setErrorMsg("Please enter a valid Google Maps link.");
                setLoading(false);
                return;
            }

            // In V3 BYOK, since we do not have a backend, we need the image.
            // If the user submits a maps URL, we would normally fetch the image using Places API via backend.
            // Since we must be purely frontend, we might need a direct image upload or proxy.
            // For now, we simulate taking the maps URL to the analysis page where the real extraction happens,
            // or pass it along to DashboardV3 which handles it.

            const routeId = Math.random().toString(36).substring(7);
            localStorage.setItem(`gravi_v3_analysis_${routeId}`, JSON.stringify({
                mapsUrl: mapsUrl,
                status: 'pending'
            }));

            navigate(`/app/analysis-v3/${routeId}`);

        } catch (err) {
            console.error('handleAnalyze error:', err);
            setErrorMsg(`Something went wrong: ${err.message || 'Unknown error. Please try again.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', height: '100%', flex: 1 }}>
            <BackgroundParticles />

            {/* Top Right Settings Button */}
            <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 20 }}>
                <button
                    onClick={() => setShowSettings(true)}
                    className="btn btn-glass"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Settings size={16} /> API Settings
                </button>
            </div>

            <div className="card fade-in" style={{ maxWidth: '620px', margin: '4rem auto', textAlign: 'center', position: 'relative', zIndex: 10 }}>
                <h2 style={{ marginBottom: '0.5rem' }}>Open-Vocabulary Retail Audit (V3)</h2>
                <p style={{ color: 'var(--surface-300)', marginBottom: '2rem' }}>
                    Paste a Google Maps link. The V3 Architecture uses a single Vision-Language Model (InternVL2) for zero-shot detection.
                </p>

                {errorMsg && (
                    <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.875rem' }}>
                        {errorMsg}
                    </div>
                )}

                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label className="input-label">Google Maps URL</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <LinkIcon size={18} color="var(--surface-300)" style={{ position: 'absolute', left: '1rem' }} />
                        <input
                            type="url"
                            className="input-field"
                            style={{ paddingLeft: '2.75rem' }}
                            placeholder="https://maps.app.goo.gl/..."
                            value={mapsUrl}
                            onChange={e => setMapsUrl(e.target.value)}
                        />
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={loading || !mapsUrl}
                    style={{ width: '100%', marginTop: '1rem', padding: '1rem' }}
                >
                    {loading ? (
                        <><Loader2 className="animate-spin" size={20} /> Starting Analysis...</>
                    ) : (
                        <><MapPin size={16} /> Analyze Store</>
                    )}
                </button>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="card fade-in" style={{ width: '100%', maxWidth: '500px', textAlign: 'left' }}>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Settings size={20} /> Bring Your Own Key (BYOK)
                        </h3>

                        <div className="input-group" style={{ marginBottom: '1rem' }}>
                            <label className="input-label">Replicate API Key (InternVL2) <span style={{ color: 'red' }}>*</span></label>
                            <input
                                type="password"
                                className="input-field"
                                value={replicateKey}
                                onChange={(e) => setReplicateKey(e.target.value)}
                                placeholder="r8_..."
                            />
                        </div>

                        <div className="input-group" style={{ marginBottom: '1rem' }}>
                            <label className="input-label">Supabase URL (Optional for DB sync)</label>
                            <input
                                type="url"
                                className="input-field"
                                value={supabaseUrl}
                                onChange={(e) => setSupabaseUrl(e.target.value)}
                                placeholder="https://xyz.supabase.co"
                            />
                        </div>

                        <div className="input-group" style={{ marginBottom: '2rem' }}>
                            <label className="input-label">Supabase Anon Key (Optional)</label>
                            <input
                                type="password"
                                className="input-field"
                                value={supabaseKey}
                                onChange={(e) => setSupabaseKey(e.target.value)}
                                placeholder="eyJh..."
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-glass" onClick={() => setShowSettings(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
