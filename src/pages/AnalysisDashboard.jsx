import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Store, Tag, BarChart3, Info } from 'lucide-react';

export default function AnalysisDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);

    useEffect(() => {
        const rawData = localStorage.getItem(`gravi_analysis_${id}`);
        if (rawData) {
            setData(JSON.parse(rawData));
        }
    }, [id]);

    if (!data) {
        return <div style={{ textAlign: 'center', padding: '4rem' }}>Loading...</div>;
    }

    const { storeInfo, vision, image } = data;

    return (
        <div className="fade-in">
            <button className="btn btn-glass" style={{ marginBottom: '1.5rem', padding: '0.5rem 1rem' }} onClick={() => navigate('/app')}>
                <ArrowLeft size={16} /> Back to Upload
            </button>

            <div className="grid-2" style={{ marginBottom: '2rem' }}>
                {/* Store Summary Card */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <div>
                            <h2 style={{ marginBottom: '0.5rem' }}>{storeInfo.storeName || 'Unnamed Store'}</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--surface-300)' }}>
                                <MapPin size={16} />
                                <span>Location Auto-detected from Image</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                        <img src={image} style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} />
                        <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary-400)', marginBottom: '0.5rem' }}>AI Auto-Analysis Active</div>
                            <p style={{ fontSize: '0.875rem', color: 'var(--surface-300)' }}>Geo-validation and Store Type classification are now handled entirely by the vision model without manual data entry.</p>
                        </div>
                    </div>
                </div>

                {/* Store Type & Brands Section */}
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Store size={20} color="var(--primary-500)" /> Vision Intelligence
                    </h3>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--surface-100)' }}>
                        <div>
                            <div className="input-label">Detected Type</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, textTransform: 'capitalize' }}>{vision.store_type.replace('_', ' ')}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="input-label">Confidence</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary-500)' }}>{vision.store_type_confidence}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="input-label">Est. Size</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{vision.estimated_store_size}</div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <div className="input-label" style={{ marginBottom: '0.75rem' }}>Visible Brands ({vision.visible_brands.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {vision.visible_brands.map(brand => (
                                <span key={brand} className={`chip ${brand === vision.dominant_brand ? 'chip-primary' : ''}`}>
                                    {brand} {brand === vision.dominant_brand && '★'}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid-2">
                {/* Ads and Insights */}
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Tag size={20} color="var(--warning)" /> Advertisement Materials
                    </h3>
                    {vision.ad_materials_detected.length > 0 ? (
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {vision.ad_materials_detected.map(ad => (
                                <li key={ad} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface-50)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--warning)' }}></div>
                                    <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{ad.replace('_', ' ')}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div style={{ color: 'var(--surface-300)' }}>No advertisement materials detected.</div>
                    )}
                </div>

                {/* Shelf Insights */}
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BarChart3 size={20} color="var(--success)" /> Shelf & Category Insights
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <div className="input-label">Detected Category</div>
                            <div style={{ fontWeight: 500 }}>{vision.category_detected || 'N/A'}</div>
                        </div>
                        <div>
                            <div className="input-label">Shelf Density</div>
                            <div style={{ fontWeight: 500 }}>{vision.shelf_density_estimate || 'N/A'}</div>
                        </div>
                        <div>
                            <div className="input-label">Out of Stock Signals</div>
                            <div style={{ fontWeight: 500 }}>{vision.out_of_stock_signals || 'None'}</div>
                        </div>
                        <div>
                            <div className="input-label">Competitive Presence</div>
                            <div style={{ fontWeight: 500 }}>{vision.competitive_brand_presence || 'Unknown'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reasoning */}
            <div className="card" style={{ marginTop: '2rem', border: '1px solid var(--primary-500)', backgroundColor: 'transparent' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-400)' }}>
                    <Info size={20} /> AI Reasoning
                </h3>
                <p style={{ color: 'var(--surface-800)', lineHeight: 1.6 }}>
                    {vision.reasoning}
                </p>
            </div>

        </div>
    );
}
