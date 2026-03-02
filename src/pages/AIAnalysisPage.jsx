import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, MessageSquare, Package, Users, BarChart3,
    CheckCircle, AlertTriangle, Loader2, Sparkles, Star,
    TrendingDown, Eye, EyeOff, Navigation, ShoppingBag
} from 'lucide-react';
import { fetchAIAnalysis } from '../lib/api';

// ── Helpers ─────────────────────────────────────────────────────────────────
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
            {badge && (
                <span style={{ padding: '0.2rem 0.75rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700, backgroundColor: badge.bg, border: `1px solid ${badge.border}`, color: badge.color }}>
                    {badge.label}
                </span>
            )}
        </div>
    );
}

function Pill({ label, bg = 'rgba(255,255,255,0.07)', border = 'rgba(255,255,255,0.12)', color = '#e2e8f0' }) {
    return (
        <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600, backgroundColor: bg, border: `1px solid ${border}`, color }}>
            {label}
        </span>
    );
}

function Skeleton({ height = 20, width = '100%', style = {} }) {
    return (
        <div style={{
            height, width, borderRadius: 6,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            ...style,
        }} />
    );
}

function LoadingSkeleton({ rows = 4 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} height={18} width={i % 2 === 0 ? '80%' : '60%'} />
            ))}
        </div>
    );
}

function NoData({ message = 'Data Not Available' }) {
    return (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>
            <AlertTriangle size={24} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
            <div>{message}</div>
        </div>
    );
}

// ── SECTION 1: Review Insights ───────────────────────────────────────────────
function ReviewInsightsCard({ data, loading }) {
    const sentimentColor = data?.overall_sentiment?.toLowerCase().includes('positive') ? '#34d399'
        : data?.overall_sentiment?.toLowerCase().includes('negative') ? '#f87171' : '#fbbf24';

    return (
        <Panel glowColor='#a78bfa'>
            <PanelHeader icon={MessageSquare} title="Customer Review Insights" iconColor="#a78bfa"
                badge={data?.overall_sentiment ? {
                    label: data.overall_sentiment, bg: `${sentimentColor}18`,
                    border: `${sentimentColor}50`, color: sentimentColor
                } : null} />

            {loading && <LoadingSkeleton rows={5} />}
            {!loading && (data?.insufficient_data || !data) && (
                <NoData message={data?.message || 'Insufficient review data for analysis'} />
            )}
            {!loading && data && !data.insufficient_data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {data.positive_themes?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle size={12} /> Positive Themes
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {data.positive_themes.map((t, i) => (
                                    <Pill key={i} label={t} bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.3)" color="#34d399" />
                                ))}
                            </div>
                        </div>
                    )}
                    {data.negative_themes?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={12} /> Negative Themes
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {data.negative_themes.map((t, i) => (
                                    <Pill key={i} label={t} bg="rgba(248,113,113,0.1)" border="rgba(248,113,113,0.3)" color="#f87171" />
                                ))}
                            </div>
                        </div>
                    )}
                    {data.positive_themes?.length === 0 && data.negative_themes?.length === 0 && (
                        <NoData message="No distinct themes identified from available reviews" />
                    )}
                    {data.total_reviews_analyzed && (
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem' }}>
                            Based on {data.total_reviews_analyzed} reviews
                        </div>
                    )}
                </div>
            )}
        </Panel>
    );
}

// ── SECTION 2: FMCG Gap Analysis ────────────────────────────────────────────
function FMCGGapCard({ data, loading }) {
    return (
        <Panel glowColor='#f97316'>
            <PanelHeader icon={TrendingDown} title="Retail Execution Gaps" iconColor="#f97316"
                badge={data && !data.insufficient_data ? {
                    label: `${(data.gaps_detected?.length ?? 0) + (data.brand_gaps?.length ?? 0)} gaps found`,
                    bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', color: '#fb923c'
                } : null} />

            {loading && <LoadingSkeleton rows={5} />}
            {!loading && (data?.insufficient_data || !data) && (
                <NoData message={data?.message || 'No image analysis data available'} />
            )}
            {!loading && data && !data.insufficient_data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {data.gaps_detected?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                                Execution Gaps Detected
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {data.gaps_detected.map((gap, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.65rem 0.9rem', borderRadius: '0.6rem', backgroundColor: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)' }}>
                                        <AlertTriangle size={13} color="#f97316" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{gap}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {data.brand_gaps?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                                Key FMCG Brands (Not Visible in Images)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {data.brand_gaps.slice(0, 10).map((brand, i) => (
                                    <Pill key={i} label={brand} bg="rgba(107,114,128,0.1)" border="rgba(107,114,128,0.25)" color="#9ca3af" />
                                ))}
                            </div>
                        </div>
                    )}
                    {data.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            ℹ {data.notes}
                        </div>
                    )}
                </div>
            )}
        </Panel>
    );
}

// ── SECTION 3: Competition Analysis ──────────────────────────────────────────
function CompetitionCard({ data, loading }) {
    const densityColor = data?.competition_density === 'High' ? '#f87171'
        : data?.competition_density === 'Medium' ? '#fbbf24' : '#34d399';

    return (
        <Panel glowColor='#60a5fa'>
            <PanelHeader icon={Navigation} title="Competition Analysis (1km Radius)" iconColor="#60a5fa"
                badge={data?.competition_density ? {
                    label: `${data.competition_density} Density`,
                    bg: `${densityColor}18`, border: `${densityColor}50`, color: densityColor
                } : null} />

            {loading && <LoadingSkeleton rows={6} />}
            {!loading && (data?.insufficient_data || !data) && (
                <NoData message={data?.message || 'Competition data not available'} />
            )}
            {!loading && data && !data.insufficient_data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Competitors Found</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa' }}>{data.total_competitors_found ?? 0}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Radius</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#94a3b8' }}>{(data.radius_meters / 1000).toFixed(1)}km</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>Density</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: densityColor }}>{data.competition_density}</div>
                        </div>
                    </div>

                    {data.nearby_competitors?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 280, overflowY: 'auto' }}>
                            {data.nearby_competitors.map((comp, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.85rem' }}>{comp.name}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                                            {comp.reviews?.toLocaleString() ?? 0} reviews
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Star size={11} fill="#fbbf24" color="#fbbf24" />
                                        <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.82rem' }}>{comp.rating ?? 'N/A'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {comp.distance_meters}m
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <NoData message="No nearby competitors found within 1km radius" />
                    )}
                </div>
            )}
        </Panel>
    );
}

// ── SECTION 4: Brand Visibility Report ───────────────────────────────────────
function BrandVisibilityCard({ data, loading }) {
    const [showAll, setShowAll] = useState(false);
    const notVisible = data?.not_visible_brands ?? [];
    const displayedNotVisible = showAll ? notVisible : notVisible.slice(0, 12);

    return (
        <Panel glowColor='#34d399'>
            <PanelHeader icon={Eye} title="Brand Presence Analysis" iconColor="#34d399"
                badge={data && !data.insufficient_data ? {
                    label: `${data.visible_count ?? 0} visible`,
                    bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', color: '#34d399'
                } : null} />

            {loading && <LoadingSkeleton rows={5} />}
            {!loading && (data?.insufficient_data || !data) && (
                <NoData message={data?.message || 'No brand detection data available'} />
            )}
            {!loading && data && !data.insufficient_data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {data.visible_brands?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Eye size={12} /> Visible in Images
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {data.visible_brands.map((b, i) => (
                                    <Pill key={i} label={b} bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.3)" color="#34d399" />
                                ))}
                            </div>
                        </div>
                    )}
                    {data.visible_brands?.length === 0 && (
                        <div style={{ padding: '0.75rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.03)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>
                            No identifiable FMCG brands detected in analysed images
                        </div>
                    )}
                    {notVisible.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <EyeOff size={12} /> Not Visible in Analysed Images
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {displayedNotVisible.map((b, i) => (
                                    <Pill key={i} label={b} bg="rgba(107,114,128,0.07)" border="rgba(107,114,128,0.2)" color="#6b7280" />
                                ))}
                            </div>
                            {notVisible.length > 12 && (
                                <button onClick={() => setShowAll(!showAll)} style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.78rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                                    {showAll ? '▲ Show fewer' : `▼ Show ${notVisible.length - 12} more`}
                                </button>
                            )}
                        </div>
                    )}
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', paddingTop: '0.25rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {data.note}
                    </div>
                </div>
            )}
        </Panel>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function AIAnalysisPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [analysisData, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [storeName, setStoreName] = useState('');

    useEffect(() => {
        // Get store name from cache for display
        const cached = localStorage.getItem(`gravi_v2_analysis_${id}`);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setStoreName(parsed.results?.place_identity_lock?.name ?? '');
            } catch { /* ignore */ }
        }

        const run = async () => {
            try {
                setLoading(true);
                setError(null);
                const result = await fetchAIAnalysis(id);
                setAnalysisData(result.sections);
            } catch (err) {
                setError(err.message || 'AI analysis failed. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        run();
    }, [id]);

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
            <style>{`@keyframes shimmer { to { background-position: -200% 0; } }`}</style>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-glass" style={{ width: 'fit-content', padding: '0.5rem 1.2rem', fontSize: '0.875rem' }} onClick={() => navigate(`/app/analysis/${id}`)}>
                    <ArrowLeft size={16} /> Back to Results
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Sparkles size={18} color="#a78bfa" />
                        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>AI Driven Analysis</span>
                        {storeName && <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>— {storeName}</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                        Insights based only on: Google Listing · Customer Reviews · Uploaded Images · Places API
                    </div>
                </div>
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Analysing…
                    </div>
                )}
            </div>

            {/* Error state */}
            {error && (
                <div style={{ padding: '1.25rem', borderRadius: '1rem', backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            {/* 4 Section Cards */}
            {!error && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <ReviewInsightsCard data={analysisData?.review_insights} loading={loading} />
                    <FMCGGapCard data={analysisData?.fmcg_gap_analysis} loading={loading} />
                    <CompetitionCard data={analysisData?.competition_analysis} loading={loading} />
                    <BrandVisibilityCard data={analysisData?.brand_visibility} loading={loading} />
                </div>
            )}

            {/* Disclaimer */}
            {!error && (
                <div style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShoppingBag size={12} />
                    All insights are derived strictly from real data sources (Google Places API, customer reviews, and image analysis). No assumptions, predictions, or fabricated data are included.
                </div>
            )}
        </div>
    );
}
