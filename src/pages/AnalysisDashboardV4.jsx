import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Layers, Star, CheckCircle,
    Package, BarChart3, ScanLine, Activity,
    TrendingUp, MessageSquare, Sparkles
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

function Pill({ label, bg = 'rgba(255,255,255,0.07)', border = 'rgba(255,255,255,0.12)', color = '#e2e8f0' }) {
    return <span style={{ display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600, backgroundColor: bg, border: `1px solid ${border}`, color }}>{label}</span>;
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

function AnimatedRing({ score = 0, size = 140, label = 'Score' }) {
    const r = size * 0.41;
    const circ = 2 * Math.PI * r;
    const [animated, setAnimated] = useState(0);
    useEffect(() => { const t = setTimeout(() => setAnimated(score), 120); return () => clearTimeout(t); }, [score]);
    const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';
    return (
        <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={size * 0.065} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={size * 0.065}
                    strokeDasharray={circ} strokeDashoffset={circ - (animated / 100) * circ}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color})` }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: size * 0.17, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: size * 0.08, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
            </div>
        </div>
    );
}

function ProgressBar({ label, value = 0, max = 100, color }) {
    const pct = Math.min(100, Math.round((value / max) * 100));
    const c = color || (pct >= 70 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171');
    const [w, setW] = useState(0);
    useEffect(() => { const t = setTimeout(() => setW(pct), 250); return () => clearTimeout(t); }, [pct]);
    return (
        <div style={{ marginBottom: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{label}</span>
                <span style={{ color: c, fontWeight: 700 }}>{value}/{max}</span>
            </div>
            <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, background: c, borderRadius: 9999, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)', boxShadow: `0 0 8px ${c}66` }} />
            </div>
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
        const raw = localStorage.getItem(`gravi_v4_analysis_${id}`);
        if (raw) { setPayload(JSON.parse(raw)); return; }

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
    const va = r.vision_analysis || {};
    const ra = r.review_analysis || {};
    const ab = r.authenticity_breakdown || {};

    const sentimentColor = ra.sentiment?.sentiment_label?.toLowerCase().includes('positive') ? '#34d399'
        : ra.sentiment?.sentiment_label?.toLowerCase().includes('negative') ? '#f87171' : '#fbbf24';
    const scoreColor = r.authenticity_score >= 75 ? '#34d399' : r.authenticity_score >= 50 ? '#fbbf24' : '#f87171';

    // Group raw detections by category
    const categoryGroups = (r.raw_detections || []).reduce((acc, obj) => {
        const cat = obj.category || "Unknown";
        if (!acc[cat]) { acc[cat] = []; }
        acc[cat].push(obj);
        return acc;
    }, {});

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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

            {/* ROW 1: Identity + Auth Score */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={Activity} title="Store Location Data" iconColor="#34d399" />
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2, marginBottom: 6 }}>
                        {r.place_name || "Unknown Store"}
                    </div>
                    {r.store_name_from_image && r.store_name_from_image !== placeName && r.store_name_from_image !== 'Unknown' && (
                        <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginBottom: 10 }}>Signboard OCR: "{r.store_name_from_image}"</div>
                    )}
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

                <Panel glowColor={scoreColor} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                    <AnimatedRing score={r.authenticity_score || 0} size={150} label="Auth Score" />
                    <div style={{ padding: '0.3rem 1.1rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 700, background: `${scoreColor}18`, border: `1px solid ${scoreColor}50`, color: scoreColor }}>
                        {(r.authenticity_score || 0) >= 75 ? 'Authentic' : (r.authenticity_score || 0) >= 50 ? 'Possibly Authentic' : 'Low Authenticity'}
                    </div>
                </Panel>
            </div>

            {/* ROW 2: Authenticity Score Breakdown + Review Sentiment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <Panel glowColor="#a78bfa">
                    <PanelHeader icon={TrendingUp} title="Authenticity Architecture Breakdown" iconColor="#a78bfa" />
                    <ProgressBar label="Review Sentiment (25%)" value={ab.review_sentiment ?? 0} max={25} color="#34d399" />
                    <ProgressBar label="Google Rating (20%)" value={ab.rating_score ?? 0} max={20} color="#fbbf24" />
                    <ProgressBar label="Brand Consistency (25%)" value={ab.brand_consistency ?? 0} max={25} color="#60a5fa" />
                    <ProgressBar label="Shelf Quality (15%)" value={ab.shelf_quality ?? 0} max={15} color="#a78bfa" />
                    <ProgressBar label="Image Presence (15%)" value={ab.image_presence ?? 0} max={15} color="#f97316" />
                </Panel>

                <Panel glowColor={sentimentColor}>
                    <PanelHeader icon={MessageSquare} title="Review Sentiment Analysis" iconColor="#a78bfa"
                        badge={{ label: ra.sentiment?.sentiment_label || 'Unknown', bg: `${sentimentColor}18`, border: `${sentimentColor}50`, color: sentimentColor }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div style={{ textAlign: 'center', padding: '0.75rem', borderRadius: '0.6rem', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399' }}>{ra.sentiment?.positive_pct ?? 0}%</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Positive</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.75rem', borderRadius: '0.6rem', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24' }}>{ra.sentiment?.neutral_pct ?? 0}%</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Neutral</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.75rem', borderRadius: '0.6rem', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>{ra.sentiment?.negative_pct ?? 0}%</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Negative</div>
                        </div>
                    </div>
                    {ra.recent_reviews?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 180, overflowY: 'auto' }}>
                            {ra.recent_reviews.slice(0, 5).map((rev, i) => (
                                <div key={i} style={{ padding: '0.65rem 0.8rem', borderRadius: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{rev.author}</span>
                                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>★ {rev.rating}</span>
                                    </div>
                                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, overflow: 'hidden', maxHeight: 36 }}>{rev.text || 'No text.'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            {/* ROW 3: AI Insights */}
            {r.ai_insights?.length > 0 && (
                <Panel glowColor="#38bdf8">
                    <PanelHeader icon={Sparkles} title="Intelligence Engine Insights" iconColor="#38bdf8" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {r.ai_insights.map((insight, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.7rem 0.9rem', borderRadius: '0.6rem', background: 'rgba(56, 189, 248,0.07)', border: '1px solid rgba(56, 189, 248,0.2)' }}>
                                <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.75rem', minWidth: 20 }}>{i + 1}.</span>
                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{insight}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            {/* ROW 4: Aggregated Brands + Category Presence */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel glowColor="#34d399">
                    <PanelHeader icon={Package} title="Deduplicated FMCG Brands" iconColor="#34d399"
                        badge={{ label: `${r.brands?.length || 0} valid brands`, bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', color: '#34d399' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <StatBox label="Total Products Detections" value={r.total_products_detected} color="#34d399" />
                        <div style={{ flex: 1 }}></div>
                        {r.store_footprint_index && (
                            <div style={{ padding: '0.3rem 1.1rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 700, background: `rgba(56, 189, 248, 0.1)`, border: `1px solid rgba(56, 189, 248, 0.3)`, color: '#38bdf8' }}>
                                Est. Store Footprint: {r.store_footprint_index}
                            </div>
                        )}
                    </div>

                    {r.brands && r.brands.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {r.brands.map((brandObj, idx) => (
                                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', borderRadius: 9999, fontSize: '0.85rem', fontWeight: 600, background: `rgba(52,211,153,0.1)`, border: `1px solid rgba(52,211,153,0.3)`, color: '#6ee7b7' }}>
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

                <Panel>
                    <PanelHeader icon={BarChart3} title="Category Presence" iconColor="#38bdf8" />
                    {va.category_presence && Object.keys(va.category_presence).length > 0 ? (
                        Object.entries(va.category_presence).map(([cat, present]) => (
                            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>{cat}</span>
                                <span style={{ padding: '0.15rem 0.55rem', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700, background: present ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.1)', border: `1px solid ${present ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.25)'}`, color: present ? '#34d399' : '#f87171' }}>
                                    {present ? '✓ Present' : '✗ Absent'}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.3)', padding: '1rem 0', fontSize: '0.8rem', textAlign: 'center' }}>No category analysis available</div>
                    )}
                    {va.missing_categories?.length > 0 && (
                        <div style={{ marginTop: '1rem', padding: '0.65rem 0.9rem', borderRadius: '0.6rem', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', fontSize: '0.79rem' }}>
                            <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 5 }}>Missing Categories</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {va.missing_categories.map((c) => (
                                    <Pill key={c} label={c} bg="rgba(248,113,113,0.08)" border="rgba(248,113,113,0.2)" color="#f87171" />
                                ))}
                            </div>
                        </div>
                    )}
                </Panel>
            </div>

            {/* ROW 5: Raw Detections by Category */}
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
