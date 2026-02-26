import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon, Loader2, MapPin, FolderSync } from 'lucide-react';
import { analyzeImage, analyzeDriveFolder } from '../lib/api';
import BackgroundParticles from '../components/BackgroundParticles';

export default function UploadPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('single'); // 'single' or 'bulk'
    const [mapsUrl, setMapsUrl] = useState('');
    const [driveUrl, setDriveUrl] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleAnalyze = async () => {
        setErrorMsg('');
        setLoading(true);

        if (mode === 'single') {
            const isValidUrl = mapsUrl.includes('google.com/maps') ||
                mapsUrl.includes('goo.gl/maps') ||
                mapsUrl.includes('maps.app.goo.gl');

            if (!isValidUrl) {
                setErrorMsg("Please enter a valid Google Maps link.");
                setLoading(false);
                return;
            }

            const vision = await analyzeImage(mapsUrl);

            if (!vision.is_valid_grocery_store) {
                setErrorMsg(vision.reasoning);
                setLoading(false);
                return;
            }

            const mockId = Math.random().toString(36).substring(7);
            localStorage.setItem(`gravi_analysis_${mockId}`, JSON.stringify({
                storeInfo: { sourceUrl: mapsUrl, storeName: 'Extracted from Maps' },
                vision,
                image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
            }));

            setLoading(false);
            navigate(`/app/analysis/${mockId}`);
        } else {
            // Bulk Mode
            if (!driveUrl.includes('drive.google.com/drive/folders/')) {
                setErrorMsg("Please enter a valid Google Drive Folder link (must include /drive/folders/).");
                setLoading(false);
                return;
            }

            const bulkAnalysis = await analyzeDriveFolder(driveUrl);

            if (!bulkAnalysis.is_valid_source) {
                setErrorMsg(bulkAnalysis.reasoning);
                setLoading(false);
                return;
            }

            const mockId = Math.random().toString(36).substring(7);
            localStorage.setItem(`gravi_bulk_analysis_${mockId}`, JSON.stringify({
                sourceUrl: driveUrl,
                ...bulkAnalysis
            }));

            setLoading(false);
            navigate(`/app/bulk-analysis/${mockId}`);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', height: '100%', flex: 1 }}>
            <BackgroundParticles />

            <div className="card fade-in" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
                    <button
                        className={`btn ${mode === 'single' ? 'btn-primary' : 'btn-glass'}`}
                        onClick={() => { setMode('single'); setErrorMsg(''); }}
                    >
                        <MapPin size={18} /> Single Store
                    </button>
                    <button
                        className={`btn ${mode === 'bulk' ? 'btn-primary' : 'btn-glass'}`}
                        onClick={() => { setMode('bulk'); setErrorMsg(''); }}
                    >
                        <FolderSync size={18} /> Bulk Process
                    </button>
                </div>

                <h2 style={{ marginBottom: '0.5rem' }}>
                    {mode === 'single' ? 'Analyze Maps Listing' : 'Bulk Process Images'}
                </h2>
                <p style={{ color: 'var(--surface-300)', marginBottom: '2rem' }}>
                    {mode === 'single'
                        ? 'Paste the Google Maps link of the grocery store. Our AI will automatically retrieve street views, photos, and extract intelligence.'
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
                    style={{ width: '100%', marginTop: '1rem', padding: '1rem' }}
                >
                    {loading ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            {mode === 'single' ? 'Extracting & Analyzing...' : 'Processing Folder...'}
                        </>
                    ) : (
                        mode === 'single' ? 'Analyze Store' : 'Start Bulk Analysis'
                    )}
                </button>
            </div>
        </div>
    );
}
