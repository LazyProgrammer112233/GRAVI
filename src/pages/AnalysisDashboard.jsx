import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Store, Star, ShoppingCart, MessageSquare,
    ShieldCheck, CheckCircle, AlertTriangle, Image, Hash,
    MapPin, Tag, TrendingUp, Package
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────
function StarRating({ rating }) {
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={13} fill={s <= Math.round(rating) ? '#fbbf24' : 'none'} color={s <= Math.round(rating) ? '#fbbf24' : '#4b5563'} />
            ))}
        </div>
    );
}

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

function PanelHeader({ icon: Icon, title, iconColor = '#3b82f6' }) {
    return (
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1.4rem', fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            <Icon size={16} color={iconColor} />
            {title}
        </h3>
    );
}

function Pill({ label, bg = 'rgba(255,255,255,0.07)', border = 'rgba(255,255,255,0.12)', color = '#e2e8f0' }) {
    return (
        <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600, backgroundColor: bg, border: `1px solid ${border}`, color }}>
            {label}
        </span>
    );
}

function AnimatedRing({ score }) {
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const [animated, setAnimated] = useState(0);
    useEffect(() => { const t = setTimeout(() => setAnimated(score), 120); return () => clearTimeout(t); }, [score]);
    const offset = circumference - (animated / 100) * circumference;
    const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';
    return (
        <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto' }}>
            <svg width="170" height="170" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="85" cy="85" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="11" />
                <circle cx="85" cy="85" r={radius} fill="none" stroke={color} strokeWidth="11"
                    strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color})` }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>Auth Score</div>
            </div>
        </div>
    );
}

function AnimatedBar({ label, score, max = 25 }) {
    const [w, setW] = useState(0);
    const pct = Math.round((score / max) * 100);
    const color = pct >= 70 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171';
    useEffect(() => { const t = setTimeout(() => setW(pct), 250); return () => clearTimeout(t); }, [pct]);
    return (
        <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.825rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{score}/{max}</span>
            </div>
            <div style={{ height: 7, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, backgroundColor: color, borderRadius: 9999, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)', boxShadow: `0 0 8px ${color}66` }} />
            </div>
        </div>
    );
}

// Category colour palette
const CAT_COLORS = {
    Snacks: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.35)', text: '#fb923c' },
    Beverages: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.35)', text: '#93c5fd' },
    Dairy: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
    Staples: { bg: 'rgba(107,114,128,0.15)', border: 'rgba(107,114,128,0.35)', text: '#d1d5db' },
    'Personal Care': { bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.35)', text: '#5eead4' },
};

function BrandChip({ name, category }) {
    const [hov, setHov] = useState(false);
    const c = CAT_COLORS[category] || CAT_COLORS['Staples'];
    return (
        <span onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.3rem 0.8rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600, backgroundColor: hov ? c.border : c.bg, border: `1px solid ${c.border}`, color: c.text, cursor: 'default', transition: 'all 0.2s', transform: hov ? 'translateY(-2px)' : 'none', boxShadow: hov ? `0 4px 12px ${c.border}` : 'none' }}>
            {name}
        </span>
    );
}

// ── V2 DASHBOARD ─────────────────────────────────────────────────────────────
function DashboardV2({ r }) {
    const [expandedReview, setExpandedReview] = useState(null);
    const totalBrands = Object.values(r.detected_brands || {}).flat().length;
    const verdictColor = r.authenticity_score >= 75 ? '#34d399' : r.authenticity_score >= 50 ? '#fbbf24' : '#f87171';
    const sentimentColor = r.review_intelligence?.sentiment === 'positive' ? '#34d399'
        : r.review_intelligence?.sentiment === 'mixed' ? '#fbbf24' : '#f87171';
    const confColor = r.store_type_confidence === 'HIGH' ? '#34d399' : '#fbbf24';

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
            <style>{`@keyframes shimmer { to { background-position: -200% 0; } }`}</style>

            {/* ── ROW 1: Verification Status Banner ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.4rem', borderRadius: '1rem', backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <CheckCircle size={18} color="#34d399" />
                <div>
                    <span style={{ fontWeight: 700, color: '#34d399', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VERIFIED</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', marginLeft: '0.75rem' }}>Session ID: {r.analysis_session_id}</span>
                </div>
            </div>

            {/* ── ROW 2: Identity Lock + Authenticity Ring ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={MapPin} title="Place Identity Lock" iconColor="#3b82f6" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                                {r.place_identity_lock.name}
                            </div>
                            {r.store_name_from_image && r.store_name_from_image !== 'Unknown' && r.store_name_from_image !== r.place_identity_lock.name && (
                                <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginTop: 4 }}>AI read from signboard: "{r.store_name_from_image}"</div>
                            )}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                            {r.place_identity_lock.address}
                        </div>
                        <div style={{ display: 'flex', gap: '1.75rem', marginTop: 4 }}>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Coordinates</div>
                                <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.82rem' }}>
                                    {r.place_identity_lock.lat?.toFixed(5)}, {r.place_identity_lock.lng?.toFixed(5)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Google Reviews</div>
                                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>{r.place_identity_lock.review_count?.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Rating</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <StarRating rating={r.ratings_data?.average_rating || 0} />
                                    <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.95rem' }}>{r.ratings_data?.average_rating || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }} glowColor={verdictColor}>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Authenticity Score</div>
                    <AnimatedRing score={r.authenticity_score} />
                    <div style={{ padding: '0.35rem 1.25rem', borderRadius: 9999, fontSize: '0.8rem', fontWeight: 700, backgroundColor: `${verdictColor}18`, border: `1px solid ${verdictColor}50`, color: verdictColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.authenticity_score >= 75 ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                        {r.authenticity_score >= 75 ? 'Authentic Retail Outlet' : r.authenticity_score >= 50 ? 'Possibly Authentic' : 'Suspicious / Low Score'}
                    </div>
                </Panel>
            </div>

            {/* ── ROW 3: Store Classification + FMCG Intelligence ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={Store} title="Store Classification" iconColor="#a78bfa" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>Detected Type</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#e2e8f0' }}>{r.store_type}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>Confidence</div>
                            <span style={{ padding: '0.25rem 0.9rem', borderRadius: 9999, fontWeight: 700, fontSize: '0.8rem', backgroundColor: `${confColor}18`, border: `1px solid ${confColor}50`, color: confColor }}>
                                {r.store_type_confidence}
                            </span>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>Google Types</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {(r.place_identity_lock.google_types || []).slice(0, 4).map(t => (
                                    <Pill key={t} label={t.replace(/_/g, ' ')} />
                                ))}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6 }}>Images Analyzed</div>
                            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '1.4rem' }}>{r.images_analyzed}</div>
                        </div>
                    </div>
                </Panel>

                <Panel>
                    <PanelHeader icon={ShoppingCart} title="FMCG Intelligence" iconColor="#f97316" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <div>
                            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#f97316' }}>{totalBrands}</div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Brands Detected</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#60a5fa' }}>{r.shelf_density_score}%</div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Shelf Density</div>
                        </div>
                    </div>
                    {totalBrands > 0 ? (
                        Object.entries(r.detected_brands || {}).map(([cat, brands]) =>
                            Array.isArray(brands) && brands.length > 0 ? (
                                <div key={cat} style={{ marginBottom: '0.9rem' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>{cat}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {brands.map(b => <BrandChip key={b} name={b} category={cat} />)}
                                    </div>
                                </div>
                            ) : null
                        )
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1.5rem', fontSize: '0.875rem' }}>
                            No FMCG brands detected — images may be exterior-only.
                        </div>
                    )}
                </Panel>
            </div>

            {/* ── ROW 4: Review Intelligence + Risk Flags ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={MessageSquare} title="Review Intelligence" iconColor="#a78bfa" />
                    {r.review_intelligence?.sentiment && r.review_intelligence.sentiment !== 'unknown' && (
                        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ padding: '0.2rem 0.8rem', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700, backgroundColor: `${sentimentColor}18`, border: `1px solid ${sentimentColor}50`, color: sentimentColor, textTransform: 'uppercase' }}>
                                {r.review_intelligence.sentiment}
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {r.review_intelligence.common_themes?.map(theme => (
                                    <Pill key={theme} label={theme} bg="rgba(167,139,250,0.1)" border="rgba(167,139,250,0.25)" color="#c4b5fd" />
                                ))}
                            </div>
                        </div>
                    )}
                    {r.recent_reviews?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                            {r.recent_reviews.map((rev, i) => (
                                <div key={i} onClick={() => setExpandedReview(expandedReview === i ? null : i)}
                                    style={{ padding: '0.8rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.2s' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.83rem' }}>{rev.author}</span>
                                            <StarRating rating={rev.rating} />
                                        </div>
                                        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.45rem', borderRadius: 4 }}>{rev.date}</span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5, overflow: 'hidden', maxHeight: expandedReview === i ? 'none' : 44 }}>
                                        {rev.text || 'No text provided.'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '1.5rem', fontSize: '0.875rem' }}>No reviews available.</div>
                    )}
                </Panel>

                <Panel glowColor={r.risk_flags?.length > 0 ? '#f87171' : undefined}>
                    <PanelHeader icon={ShieldCheck} title="Risk Assessment" iconColor={r.risk_flags?.length > 0 ? '#f87171' : '#34d399'} />
                    {r.risk_flags?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {r.risk_flags.map(flag => (
                                <div key={flag} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 1rem', borderRadius: '0.625rem', backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                                    <AlertTriangle size={14} color="#f87171" />
                                    <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{flag}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: '0.75rem', paddingTop: '1rem' }}>
                            <CheckCircle size={36} color="#34d399" />
                            <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>No Risk Flags</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.5 }}>All validation checks passed cleanly.</div>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}

// ── V1 LEGACY FALLBACK DASHBOARD ──────────────────────────────────────────────
function DashboardV1Legacy({ r }) {
    const { store_intelligence, ratings_data, recent_reviews, review_summary, fmcg_analysis, validation_framework } = r;
    const [expandedReview, setExpandedReview] = useState(null);
    const verdictColor = validation_framework?.verdict === 'Authentic Retail Outlet' ? '#34d399'
        : validation_framework?.verdict === 'Possibly Authentic' ? '#fbbf24' : '#f87171';
    const sentimentColor = review_summary?.sentiment === 'positive' ? '#34d399'
        : review_summary?.sentiment === 'mixed' ? '#fbbf24' : '#f87171';
    const brandCategory = {};
    Object.entries(fmcg_analysis?.brand_category_distribution || {}).forEach(([cat, brands]) => {
        if (Array.isArray(brands)) brands.forEach(b => { brandCategory[b] = cat; });
    });

    const CAT_COLORS_V1 = {
        BEVERAGES: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.35)', text: '#93c5fd' },
        SNACKS: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.35)', text: '#fb923c' },
        BISCUITS: { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.35)', text: '#fde047' },
        DAIRY: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
        PERSONAL_CARE: { bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.35)', text: '#5eead4' },
        HOME_CARE: { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.35)', text: '#86efac' },
        STAPLES: { bg: 'rgba(107,114,128,0.15)', border: 'rgba(107,114,128,0.35)', text: '#d1d5db' },
    };

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: '0.8rem', color: '#fbbf24' }}>
                ⚠ Legacy Analysis (v1) — Run a new analysis to get v2.0 insights.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
                <Panel>
                    <PanelHeader icon={Store} title="Outlet Profile" iconColor="#3b82f6" />
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem' }}>{store_intelligence?.store_name_from_google}</div>
                    {store_intelligence?.store_name_from_image && store_intelligence.store_name_from_image !== 'Unknown' && (
                        <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginBottom: '0.75rem' }}>AI read: "{store_intelligence.store_name_from_image}"</div>
                    )}
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: 8 }}>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>RATING</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <StarRating rating={ratings_data?.average_rating || 0} />
                                <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: '1rem' }}>{ratings_data?.average_rating || 'N/A'}</span>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>AI STORE TYPE</div>
                            <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>{store_intelligence?.ai_predicted_store_type}</div>
                        </div>
                    </div>
                </Panel>
                <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                    <AnimatedRing score={validation_framework?.overall_authenticity_score || 0} />
                    <div style={{ padding: '0.35rem 1.25rem', borderRadius: 9999, fontSize: '0.8rem', fontWeight: 700, backgroundColor: `${verdictColor}18`, border: `1px solid ${verdictColor}50`, color: verdictColor }}>
                        {validation_framework?.verdict}
                    </div>
                </Panel>
            </div>
            <Panel>
                <PanelHeader icon={ShoppingCart} title="FMCG Intelligence" iconColor="#f97316" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {fmcg_analysis?.detected_brands?.map(b => {
                        const cat = brandCategory[b] || 'STAPLES';
                        const c = CAT_COLORS_V1[cat] || CAT_COLORS_V1['STAPLES'];
                        return <span key={b} style={{ display: 'inline-block', padding: '0.28rem 0.75rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600, backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text }}>{b}</span>;
                    })}
                </div>
            </Panel>
            <Panel>
                <PanelHeader icon={MessageSquare} title="Review Intelligence" iconColor="#a78bfa" />
                {review_summary?.summary_text && (
                    <div style={{ marginBottom: '1rem', padding: '0.9rem', borderRadius: '0.7rem', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                        <span style={{ padding: '0.15rem 0.65rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700, backgroundColor: `${sentimentColor}18`, border: `1px solid ${sentimentColor}50`, color: sentimentColor, marginRight: 8, textTransform: 'uppercase' }}>{review_summary.sentiment}</span>
                        <span style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{review_summary.summary_text}</span>
                    </div>
                )}
                {(recent_reviews || []).slice(0, 5).map((rev, i) => (
                    <div key={i} onClick={() => setExpandedReview(expandedReview === i ? null : i)}
                        style={{ padding: '0.75rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.5rem', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.82rem' }}>{rev.author}</span>
                                <StarRating rating={rev.rating} />
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>{rev.date}</span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', margin: 0, overflow: 'hidden', maxHeight: expandedReview === i ? 'none' : 40 }}>{rev.text}</p>
                    </div>
                ))}
            </Panel>
        </div>
    );
}

// ── MAIN SHELL ────────────────────────────────────────────────────────────────
export default function AnalysisDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [payload, setPayload] = useState(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        // Try v2 key first, then v1 legacy key
        const v2Raw = localStorage.getItem(`gravi_v2_analysis_${id}`);
        if (v2Raw) { setPayload(JSON.parse(v2Raw)); return; }
        const v1Raw = localStorage.getItem(`gravi_analysis_${id}`);
        if (v1Raw) { setPayload(JSON.parse(v1Raw)); return; }
        setNotFound(true);
    }, [id]);

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <button className="btn btn-glass" style={{ width: 'fit-content', padding: '0.5rem 1.2rem', fontSize: '0.875rem' }} onClick={() => navigate('/app')}>
                <ArrowLeft size={16} /> Back to Upload
            </button>

            {notFound && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(255,255,255,0.4)' }}>
                    Analysis not found. Please re-analyze the store URL.
                </div>
            )}

            {payload && payload.v2 && payload.results && (
                <DashboardV2 r={payload.results} />
            )}

            {payload && !payload.v2 && payload.results && (
                <DashboardV1Legacy r={payload.results} />
            )}
        </div>
    );
}
