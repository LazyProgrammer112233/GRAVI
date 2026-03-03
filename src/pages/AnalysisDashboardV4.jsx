import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Layers, Star, CheckCircle,
    Package, BarChart3, ScanLine, Activity
} from 'lucide-react';

// ── Design helpers ────────────────────────────────────────────────────────────
function Panel({ children, style = {}, glowColor }) {
    return (
        <div style={{
            background: 'rgba(15,23,42,0.72)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${glowColor ? glowColor + '40' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '1.25rem',
            padding: '1.75rem',
            boxShadow: glowColor ? `0 8px 32px ${glowColor}18` : '0 8px 32px rgba(0,0,0,0.3)',
            ...style,
        }}>
            {children}
        </div>
    );
}

function PanelHeader({ icon: Icon, title, iconColor = '#3b82f6', badge }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                <Icon size={16} color={iconColor} />
                {title}
            </h3>
            {badge && <span style={{ padding: '0.2rem 0.7rem', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700, backgroundColor: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>{badge.label}</span>}
        </div>
    );
}

function StatBox({ label, value, color = '#f8fafc', sub }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
            {sub && <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// Pipeline badge
function LayerBadge({ layer, name, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.7rem', borderRadius: '0.5rem', background: `${color}12`, border: `1px solid ${color}35` }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color, textTransform: 'uppercase' }}>L{layer}</span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>{name}</span>
        </div>
    );
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function AnalysisDashboardV4() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [payload, setPayload] = useState(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        // v4 results are saved under the same key as the v2 payload because they originate from analyzeImageV2
        const raw = localStorage.getItem(`gravi_v4_analysis_${id}`);
        if (raw) { setPayload(JSON.parse(raw)); return; }

        // Fallback backward compatibility for when we were temporarily mapping it to v2_3layer
        const legacyRaw = localStorage.getItem(`gravi_v2_3layer_analysis_${id}`);
        if (legacyRaw) { setPayload(JSON.parse(legacyRaw)); return; }

        setNotFound(true);
    }, [id]);

    if (notFound) {
        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <button className="btn btn-glass" style={{ width: 'fit-content', padding: '0.5rem 1.2rem', fontSize: '0.875rem' }} onClick={() => navigate('/app')}>
                    <ArrowLeft size={16} /> Back
                </button>
                <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(255,255,255,0.4)' }}>Analysis not found. Please re-analyze.</div>
            </div>
        );
    }

    if (!payload?.results) return null;

    const r = payload.results;

    // Group raw detections by category
    const categoryGroups = (r.raw_detections || []).reduce((acc, obj) => {
        const cat = obj.category || "Unknown";
        if (!acc[cat]) { acc[cat] = []; }
        acc[cat].push(obj);
        return acc;
    }, {});

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-glass" style={{ width: 'fit-content', padding: '0.5rem 1.2rem', fontSize: '0.875rem' }} onClick={() => navigate('/app')}>
                    <ArrowLeft size={16} /> Back to Upload
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={16} color="#34d399" />
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem' }}>GRAVI Vision Engine (v4.0)</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <LayerBadge layer={1} name="Gemini Dense Audit" color="#34d399" />
                        <LayerBadge layer={2} name="Spatial OCR" color="#f97316" />
                        <LayerBadge layer={3} name="Llama Text Aggregation" color="#38bdf8" />
                    </div>
                </div>
                {r.verification_status === 'VERIFIED' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: '0.6rem', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', fontSize: '0.75rem', fontWeight: 700, color: '#34d399' }}>
                        <CheckCircle size={12} /> VERIFIED
                    </div>
                )}
            </div>

            {/* ROW 1: Identity + Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={Activity} title="Store Location Data" iconColor="#34d399" />
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, marginBottom: 6 }}>
                        {r.place_name || "Unknown Store"}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, marginBottom: '1rem' }}>
                        {r.address}
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Rating</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Star size={13} fill="#fbbf24" color="#fbbf24" />
                                <span style={{ fontWeight: 700, color: '#fbbf24' }}>{r.rating || "N/A"}</span>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Reviews</div>
                            <div style={{ fontWeight: 700, color: '#f8fafc' }}>{(r.total_reviews || 0).toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Indoor Images</div>
                            <div style={{ fontWeight: 700, color: '#38bdf8' }}>{r.total_images_analyzed}</div>
                        </div>
                    </div>
                </Panel>

                <Panel glowColor="#38bdf8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <StatBox label="Total Products" value={r.total_products_detected} color="#38bdf8" />
                        <StatBox label="Unique Brands" value={r.unique_brands_detected} color="#34d399" />
                    </div>
                    {r.store_footprint_index && (
                        <div style={{ marginTop: 10, padding: '0.3rem 1.1rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 700, background: `rgba(56, 189, 248, 0.1)`, border: `1px solid rgba(56, 189, 248, 0.3)`, color: '#38bdf8' }}>
                            Footprint: {r.store_footprint_index}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ROW 2: Aggregated Brands */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <Panel glowColor="#a78bfa">
                    <PanelHeader icon={Package} title="Deduplicated FMCG Brands" iconColor="#a78bfa"
                        badge={{ label: `${r.brands?.length || 0} brands`, bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', color: '#a78bfa' }} />

                    {r.brands && r.brands.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {r.brands.map((brandObj, idx) => (
                                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', borderRadius: 9999, fontSize: '0.85rem', fontWeight: 600, background: `rgba(167,139,250,0.1)`, border: `1px solid rgba(167,139,250,0.3)`, color: '#c4b5fd' }}>
                                    {brandObj.brand_name || brandObj}
                                    {brandObj.product_count && (
                                        <span style={{ fontSize: '0.65rem', opacity: 0.7, paddingLeft: 4, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>{brandObj.product_count} items</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1.5rem', fontSize: '0.875rem' }}>No readable product brands detected in the interior images.</div>
                    )}
                </Panel>
            </div>

            {/* ROW 3: Raw Detections by Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={ScanLine} title="Dense Raw Detections (Grouped by Gemini Category)" iconColor="#f97316" />

                    {Object.keys(categoryGroups).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {Object.entries(categoryGroups).map(([cat, items]) => (
                                <div key={cat} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: 0, marginBottom: '0.75rem', color: '#f97316', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 700 }}>
                                        {cat} ({items.length})
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {items.map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: 6, padding: '0.25rem 0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.4rem', fontSize: '0.75rem' }}>
                                                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{item.label}</span>
                                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', alignSelf: 'center' }}>{Math.round((item.ocr_confidence || 0) * 100)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1.5rem', fontSize: '0.875rem' }}>No raw bounding boxes detected.</div>
                    )}
                </Panel>
            </div>

        </div>
    );
}
