import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, UploadCloud, Info } from 'lucide-react';
import { fetchInternVL2Analysis } from '../lib/inference';
import { validateProductsList } from '../lib/validation';
import { supabase } from '../lib/supabase';

const AnalysisDashboardV3 = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [selectedImage, setSelectedImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');

    const [analysisData, setAnalysisData] = useState(null);

    // AI Insights Data
    const generateInsights = (validatedProducts) => {
        const brands = validatedProducts.filter(p => p.validation_status === 'Accept').map(p => p.brand);
        const uniqueBrands = [...new Set(brands)];

        let insights = [];
        if (uniqueBrands.length > 5) {
            insights.push({ title: "High Fragmentation", desc: "Multiple competing brands detected on the same shelf layout." });
        } else if (uniqueBrands.length > 0) {
            insights.push({ title: "Brand Consolidation", desc: "A few dominant brands control the shelf space." });
        }

        if (validatedProducts.length < 5) {
            insights.push({ title: "Sparse Inventory", desc: "Very few FMCG products detected. Shelf might be understocked or out-of-stock." });
        }

        return insights;
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result;
            setSelectedImage(base64Data);
            setPreviewUrl(base64Data);
            setErrorMsg('');
        };
        reader.readAsDataURL(file);
    };

    const runAnalysis = async () => {
        if (!selectedImage) {
            setErrorMsg("Please upload an image first.");
            return;
        }

        const replicateKey = localStorage.getItem('gravi_replicate_key');
        if (!replicateKey) {
            setErrorMsg("Replicate API Key is missing. Please configure it in the main page settings.");
            navigate('/app');
            return;
        }

        try {
            setLoading(true);
            setErrorMsg('');

            // Step 1: VLM Inference
            setStep('Running OpenGVLab InternVL2-8B Vision Analysis...');
            const vlmResult = await fetchInternVL2Analysis(selectedImage, replicateKey);

            if (!vlmResult.products || vlmResult.products.length === 0) {
                throw new Error("No products detected by the AI model. Try a clearer image.");
            }

            // Step 2: Strict Brand Validation
            setStep('Applying Brand Dictionary Validation Engine...');
            const validatedProducts = validateProductsList(vlmResult.products);

            // Generate Insights
            setStep('Generating Visual Insights...');
            const insights = generateInsights(validatedProducts);

            setAnalysisData({
                rawProducts: vlmResult.products,
                validatedProducts,
                insights
            });

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "An error occurred during analysis.");
        } finally {
            setLoading(false);
            setStep('');
        }
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
            <button className="btn btn-glass" onClick={() => navigate('/app')} style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <ArrowLeft size={16} /> Back
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>V3 Retail Audit Intelligence</h1>
                    <p style={{ color: 'var(--surface-300)', marginTop: '0.5rem' }}>Open-Vocabulary Zero-Shot Detection Dashboard</p>
                </div>
            </div>

            {errorMsg && (
                <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
                    {errorMsg}
                </div>
            )}

            {!analysisData && !loading && (
                <div className="card fade-in" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <UploadCloud size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                    <h3 style={{ marginBottom: '1rem' }}>Upload Store Image</h3>
                    <p style={{ color: 'var(--surface-300)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
                        Due to browser CORS restrictions, directly fetching images from Maps URLs requires a backend. Upload a local image of the retail store interior to test the V3 BYOK architecture.
                    </p>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                        id="image-upload"
                    />
                    <label htmlFor="image-upload" className="btn btn-glass" style={{ cursor: 'pointer', display: 'inline-block', marginBottom: '1.5rem', marginRight: '1rem' }}>
                        Browse Image
                    </label>

                    {previewUrl && (
                        <div style={{ marginTop: '2rem' }}>
                            <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                            <br />
                            <button className="btn btn-primary" onClick={runAnalysis} style={{ marginTop: '1.5rem' }}>
                                Run InternVL2-8B Analysis
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loading && (
                <div style={{ textAlign: 'center', padding: '5rem 0' }}>
                    <Loader2 size={48} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 1.5rem' }} />
                    <h3 className="pulse-animation">{step}</h3>
                </div>
            )}

            {analysisData && !loading && (
                <div className="fade-in">
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '1.5rem', alignItems: 'start' }}>

                        {/* Main Validation Panel */}
                        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>Validation Framework Panel</h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ color: 'var(--surface-300)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <th style={{ padding: '0.75rem 0' }}>Extracted Product</th>
                                            <th style={{ padding: '0.75rem 0' }}>Raw Brand</th>
                                            <th style={{ padding: '0.75rem 0' }}>VLM Conf.</th>
                                            <th style={{ padding: '0.75rem 0' }}>Dict Match</th>
                                            <th style={{ padding: '0.75rem 0' }}>Final Score</th>
                                            <th style={{ padding: '0.75rem 0' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysisData.validatedProducts.map((item, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{item.product_name}</td>
                                                <td style={{ padding: '0.75rem 0' }}>{item.brand}</td>
                                                <td style={{ padding: '0.75rem 0', color: 'rgba(255,255,255,0.6)' }}>{item.confidence}%</td>
                                                <td style={{ padding: '0.75rem 0', color: 'rgba(255,255,255,0.6)' }}>{Math.round(item.dictionary_match_score)}</td>
                                                <td style={{ padding: '0.75rem 0', fontWeight: 'bold' }}>{item.final_confidence}%</td>
                                                <td style={{ padding: '0.75rem 0' }}>
                                                    {item.validation_status === 'Accept' && <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> Accept</span>}
                                                    {item.validation_status === 'Medium confidence' && <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> Review</span>}
                                                    {item.validation_status === 'Unknown' && <span style={{ color: '#ef4444' }}>Unknown</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Image Preview */}
                            <div className="card" style={{ padding: '1rem' }}>
                                <img src={previewUrl} alt="Store Interior" style={{ width: '100%', borderRadius: '8px' }} />
                                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--surface-300)', textAlign: 'center' }}>Analyzed Source Image</div>
                            </div>

                            {/* AI Insights & Gaps */}
                            <div className="card">
                                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Info size={16} color="var(--primary)" /> AI Insights & Gaps</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {analysisData.insights.length > 0 ? (
                                        analysisData.insights.map((insight, i) => (
                                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                                                <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text)' }}>{insight.title}</strong>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--surface-300)', lineHeight: 1.4, display: 'block' }}>{insight.desc}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--surface-300)' }}>No specific layout insights generated for this image.</div>
                                    )}
                                </div>
                            </div>

                            {/* Store Overview Stub */}
                            <div className="card">
                                <h3>Store Overview</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--surface-300)', marginTop: '0.5rem' }}>
                                    Upload mode active. External API data (Maps/Reviews) unavailable for manual uploads.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisDashboardV3;
