import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon, Loader2, MapPin, FolderSync, Layers, Zap } from 'lucide-react';
import { analyzeImage, analyzeImageV2, analyzeDriveFolder } from '../lib/api';
import BackgroundParticles from '../components/BackgroundParticles';

export default function UploadPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('single'); // 'single' or 'bulk'
    const [pipeline, setPipeline] = useState('standard'); // 'standard' or 'deep'
    const [mapsUrl, setMapsUrl] = useState('');
    const [driveUrl, setDriveUrl] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleAnalyze = async () => {
        setErrorMsg('');
        setLoading(true);

        try {
            if (mode === 'single') {
                const isValidUrl = mapsUrl.includes('google.com/maps') ||
                    mapsUrl.includes('goo.gl/maps') ||
                    mapsUrl.includes('maps.app.goo.gl');

                if (!isValidUrl) {
                    setErrorMsg("Please enter a valid Google Maps link.");
                    return;
                }

                if (pipeline === 'deep') {
                    const data = await analyzeImageV2(mapsUrl);
                    if (!data || !data.results) {
                        setErrorMsg('Deep Vision analysis failed. Please try a different Google Maps link.');
                        return;
                    }
                    const routeId = data.results.analysis_session_id || Math.random().toString(36).substring(7);
                    localStorage.setItem(`gravi_v2_3layer_analysis_${routeId}`, JSON.stringify({ v2_3layer: true, results: data.results }));
                    navigate(`/app/analysis-v2/${routeId}`);
                } else {
                    const data = await analyzeImage(mapsUrl);
                    if (!data || !data.results) {
                        setErrorMsg('Analysis failed — the AI could not process this URL. Please try a different Google Maps link.');
                        return;
                    }
                    const routeId = data.v2
                        ? data.results.analysis_session_id
                        : Math.random().toString(36).substring(7);
                    const storageKey = data.v2
                        ? `gravi_v2_analysis_${routeId}`
                        : `gravi_analysis_${routeId}`;
                    localStorage.setItem(storageKey, JSON.stringify({ v2: data.v2, results: data.results }));
                    navigate(`/app/analysis/${routeId}`);
                }

            } else {
                if (!driveUrl.includes('drive.google.com/drive/folders/')) {
                    setErrorMsg("Please enter a valid Google Drive Folder link (must include /drive/folders/).");
                    return;
                }

                const bulkAnalysis = await analyzeDriveFolder(driveUrl);

                if (!bulkAnalysis || !bulkAnalysis.is_valid_source) {
                    setErrorMsg(bulkAnalysis?.reasoning || 'Bulk analysis failed. Please check the folder link.');
                    return;
                }

                const mockId = Math.random().toString(36).substring(7);
                localStorage.setItem(`gravi_bulk_analysis_${mockId}`, JSON.stringify({
                    sourceUrl: driveUrl,
                    ...bulkAnalysis
                }));
                navigate(`/app/bulk-analysis/${mockId}`);
            }
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

            <div className="card fade-in" style={{ maxWidth: '620px', margin: '4rem auto', textAlign: 'center', position: 'relative', zIndex: 10 }}>
                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <button
                        className={`btn ${mode === 'single' ? 'btn-primary' : 'btn-glass'}`}
                        onClick={() => { setMode('single'); setErrorMsg(''); }}
                    >
                        <MapPin size={18} /> Single Store
                    </button>
                    <button
                        className={`btn ${mode === 'bulk' ? 'btn-primary' : 'btn-glass'}`}
                        onClick={() => { setMode('bulk'); setErrorMsg(''); setPipeline('standard'); }}
                    >
                        <FolderSync size={18} /> Bulk Process
                    </button>
                </div>

                {/* Pipeline toggle (only for single mode) */}
                {mode === 'single' && (
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.75rem' }}>
                        <button
                            onClick={() => setPipeline('standard')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7, padding: '0.45rem 1.1rem',
                                borderRadius: '0.65rem', border: `1px solid ${pipeline === 'standard' ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                background: pipeline === 'standard' ? 'rgba(96,165,250,0.12)' : 'transparent',
                                color: pipeline === 'standard' ? '#60a5fa' : 'rgba(255,255,255,0.35)',
                                fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            <Zap size={13} /> Standard Analysis
                        </button>
                        <button
                            onClick={() => setPipeline('deep')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7, padding: '0.45rem 1.1rem',
                                borderRadius: '0.65rem', border: `1px solid ${pipeline === 'deep' ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                background: pipeline === 'deep' ? 'rgba(124,58,237,0.15)' : 'transparent',
                                color: pipeline === 'deep' ? '#a78bfa' : 'rgba(255,255,255,0.35)',
                                fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            <Layers size={13} /> Deep Vision (v2) ✦
                        </button>
                    </div>
                )}

                {pipeline === 'deep' && mode === 'single' && (
                    <div style={{ marginBottom: '1.25rem', padding: '0.65rem 0.9rem', borderRadius: '0.75rem', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(167,139,250,0.2)', fontSize: '0.75rem', color: 'rgba(167,139,250,0.8)', textAlign: 'left', lineHeight: 1.5 }}>
                        <strong style={{ color: '#a78bfa' }}>3-Layer Pipeline:</strong> YOLO object detection → OCR text extraction → Qwen 2.5-VL reasoning. Deeper analysis with brand source attribution. May take 30–90 seconds.
                    </div>
                )}

                <h2 style={{ marginBottom: '0.5rem' }}>
                    {mode === 'single' ? (pipeline === 'deep' ? 'Deep Vision Analysis' : 'Analyze Maps Listing') : 'Bulk Process Images'}
                </h2>
                <p style={{ color: 'var(--surface-300)', marginBottom: '2rem' }}>
                    {mode === 'single'
                        ? pipeline === 'deep'
                            ? 'Run the 3-layer YOLO + Qwen-VL + OCR pipeline for maximum brand detection accuracy.'
                            : 'Paste the Google Maps link of the grocery store. Our AI will automatically retrieve street views, photos, and extract intelligence.'
                        : 'Paste a Google Drive Folder link containing images of stores. We will parse every image and generate a structured Excel export.'}
                </p>

                {errorMsg && (
                    <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.875rem' }}>
                        {errorMsg}
                    </div>
                )}

                <div className="input-group" style={{ textAlign: 'left' }}>
                    <label className="input-label">
                        {mode === 'single' ? 'Google Maps URL' : 'Google Drive Folder URL'}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <LinkIcon size={18} color="var(--surface-300)" style={{ position: 'absolute', left: '1rem' }} />
                        <input
                            type="url"
                            className="input-field"
                            style={{ paddingLeft: '2.75rem' }}
                            placeholder={mode === 'single' ? "https://maps.app.goo.gl/..." : "https://drive.google.com/drive/folders/..."}
                            value={mode === 'single' ? mapsUrl : driveUrl}
                            onChange={e => mode === 'single' ? setMapsUrl(e.target.value) : setDriveUrl(e.target.value)}
                        />
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={loading || (mode === 'single' ? !mapsUrl : !driveUrl)}
                    style={{
                        width: '100%', marginTop: '1rem', padding: '1rem',
                        background: pipeline === 'deep' && mode === 'single'
                            ? 'linear-gradient(135deg, #7c3aed, #3b82f6)'
                            : undefined,
                    }}
                >
                    {loading ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            {pipeline === 'deep' ? 'Running 3-Layer Pipeline...' : mode === 'single' ? 'Extracting & Analyzing...' : 'Processing Folder...'}
                        </>
                    ) : (
                        pipeline === 'deep' && mode === 'single'
                            ? <><Layers size={16} /> Run Deep Vision Analysis</>
                            : mode === 'single' ? 'Analyze Store' : 'Start Bulk Analysis'
                    )}
                </button>
            </div>
        </div>
    );
}
