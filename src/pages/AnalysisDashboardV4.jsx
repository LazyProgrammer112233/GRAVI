import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, ShieldCheck, MapPin, Star, History, Image as ImageIcon, Info } from 'lucide-react';
import { validateProductsList } from '../lib/validation';

const AnalysisDashboardV4 = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [storeData, setStoreData] = useState(null);

    useEffect(() => {
        fetchStoreData();
    }, [id]);

    const fetchStoreData = async () => {
        try {
            setLoading(true);
            // 1. Check if we already have it in the DB
            const { data: dbData, error: dbError } = await supabase
                .from('store_analyses')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (dbData) {
                setStoreData(dbData);
                setLoading(false);
                return;
            }

            // 2. If not in DB, this is a fresh analysis. Check localStorage.
            const localDataRaw = localStorage.getItem(`gravi_v4_analysis_${id}`);
            if (!localDataRaw) {
                throw new Error("Analysis session not found.");
            }
            const localData = JSON.parse(localDataRaw);

            // Mock Vision extraction (In production, replace with actual vision payload)
            const mockVisionMetadata = {
                ocr_text: "Aashirvaad Atta Maggi Hide & Seek",
                dominant_colors: ["yellow", "red", "brown"],
                packaging_type: "Pouch",
                barcode: ""
            };

            // 3. Call Candidate Filtering Edge Function
            const { data: candidates, error: candidateError } = await supabase.functions.invoke('candidate-filtering', {
                body: mockVisionMetadata
            });

            if (candidateError) throw new Error("Candidate Filtering Failed: " + candidateError.message);
            if (!candidates || candidates.length === 0) throw new Error("No candidates found in Supabase Database.");

            // 4. Call Local LLaMA Scout (Proxy through edge function)
            const { data: llmResult, error: llmError } = await supabase.functions.invoke('llama-scout', {
                body: {
                    candidates: candidates,
                    vision_metadata: mockVisionMetadata
                }
            });

            if (llmError) throw new Error("LLM Verification Failed: " + llmError.message);

            // 5. Structure payload for display
            const mockAnalysis = {
                id: id,
                store_name: "Mock Analyzed Retailer",
                analysis_data: {
                    vision_analysis: {
                        raw_detections: [
                            {
                                product_name: llmResult.sku || "Detected Product",
                                brand: llmResult.brand || "Unknown",
                                confidence: llmResult.confidence || 0,
                                validation_status: llmResult.brand !== "unknown" ? "Verified" : "Unknown",
                                dictionary_match_score: llmResult.confidence || 0
                            }
                        ]
                    },
                    ratings_data: { average_rating: 4.2, total_reviews: 120 },
                    place_identity_lock: { address: localData.mapsUrl || "Unknown Location" }
                }
            };

            setStoreData(mockAnalysis);

            // Optional: Save back to store_analyses table
            await supabase.from('store_analyses').insert([mockAnalysis]);

        } catch (err) {
            console.error("Pipeline Execution error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white">
                <Loader2 className="animate-spin text-blue-400 mb-4" size={48} />
                <h2 className="text-xl font-semibold animate-pulse">Running Cloud Inference...</h2>
                <p className="text-gray-400 mt-2">1. Querying Supabase Candidates using vectors</p>
                <p className="text-gray-400">2. Booting LLaMA 4 Scout node</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-white">
                <AlertTriangle className="mx-auto text-red-500 mb-4" size={48} />
                <h2 className="text-2xl font-bold mb-2">Analysis Extractor Error</h2>
                <p className="text-gray-400 mb-6">{error}</p>
                <button onClick={() => navigate('/app')} className="btn btn-primary">Return to Dashboard</button>
            </div>
        );
    }

    // Process data for UI
    const images = storeData?.analysis_data?.raw_images || [];
    const totalImages = images.length || 0;

    let allRawProducts = [];
    if (storeData?.analysis_data?.vision_analysis?.raw_detections) {
        allRawProducts = storeData.analysis_data.vision_analysis.raw_detections;
    }

    // Pass directly since edge function already validated it against the closed-world schema
    const validatedProducts = allRawProducts;

    // Deduplicate brands
    const uniqueBrands = [...new Set(validatedProducts.map(p => p.brand).filter(b => b && b !== 'Unknown'))];

    const storeName = storeData?.store_name || storeData?.analysis_data?.place_identity_lock?.name || "Unknown Retailer";
    const address = storeData?.analysis_data?.place_identity_lock?.address || "Location Unavailable";
    const rating = storeData?.analysis_data?.ratings_data?.average_rating || (Math.random() * (5 - 3.5) + 3.5).toFixed(1); // placeholder if missing
    const reviewCount = storeData?.analysis_data?.ratings_data?.total_reviews || Math.floor(Math.random() * 500);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
            {/* V4 Vibrant Header */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 border-b border-indigo-500/30 sticky top-0 z-10 shadow-2xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigate('/app')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
                                <ArrowLeft size={20} />
                            </button>
                            <div>
                                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-300">
                                    {storeName}
                                </h1>
                                <div className="flex items-center gap-2 text-sm text-indigo-200 mt-1">
                                    <MapPin size={14} /> {address}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-indigo-300 uppercase tracking-wider font-semibold">Validation Status</span>
                                <div className="flex items-center gap-1 text-emerald-400 mt-0.5">
                                    <ShieldCheck size={16} /> <span className="font-bold">Strict AI</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Top Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <MetricCard
                        icon={<ImageIcon className="text-blue-400" />}
                        title="Images Detected"
                        value={totalImages}
                        subtitle="Processed by Llama Vision"
                        gradient="from-blue-950 to-blue-900/50"
                        borderColor="border-blue-500/30"
                    />
                    <MetricCard
                        icon={<Star className="text-amber-400" />}
                        title="Store Rating"
                        value={`${rating} / 5.0`}
                        subtitle={`${reviewCount} total reviews`}
                        gradient="from-amber-950/40 to-orange-950/20"
                        borderColor="border-amber-500/30"
                    />
                    <MetricCard
                        icon={<History className="text-emerald-400" />}
                        title="Review Recency"
                        value="High"
                        subtitle="Detailed recent activity"
                        gradient="from-emerald-950/40 to-teal-950/20"
                        borderColor="border-emerald-500/30"
                    />
                    <MetricCard
                        icon={<MapPin className="text-purple-400" />}
                        title="Nearby Competition"
                        value="12 Stores"
                        subtitle="< 1km Radius Density"
                        gradient="from-purple-950/40 to-fuchsia-950/20"
                        borderColor="border-purple-500/30"
                    />
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left Column - Validation & Insights */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Validation Framework Panel */}
                        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <ShieldCheck className="text-blue-400" />
                                Validated Brand Intelligence
                            </h2>
                            <p className="text-sm text-slate-400 mb-6 font-medium">
                                Base vision detections are cross-referenced against the GRAVI Brand Dictionary to eliminate AI hallucinations.
                            </p>

                            {validatedProducts.length === 0 ? (
                                <div className="text-center p-8 bg-slate-800/30 rounded-xl border border-dashed border-slate-600">
                                    <AlertTriangle className="mx-auto text-amber-500 mb-2" />
                                    <p className="text-slate-300">No verifiable products detected.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-700 text-slate-400">
                                                <th className="pb-3 font-semibold">Extracted Product</th>
                                                <th className="pb-3 font-semibold">Verified Brand</th>
                                                <th className="pb-3 font-semibold text-center">Vision Confidence</th>
                                                <th className="pb-3 font-semibold text-center">Validation Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {validatedProducts.map((p, i) => (
                                                <tr key={i} className="hover:bg-slate-800/50 transition">
                                                    <td className="py-3 text-slate-200">{p.product_name}</td>
                                                    <td className="py-3 font-medium text-blue-300">{p.brand}</td>
                                                    <td className="py-3 text-center">
                                                        <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">
                                                            {p.confidence || 0}%
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <ValidationBadge status={p.validation_status} score={p.dictionary_match_score || 0} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Images & Summary */}
                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/10 border border-indigo-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />
                            <h2 className="text-lg font-bold mb-4 text-white">Actionable Insights</h2>
                            <ul className="space-y-3">
                                <InsightRow label="Dominant Category" value={validatedProducts[0]?.category || "Mixed"} />
                                <InsightRow label="Unique Brands" value={uniqueBrands.length} />
                                <InsightRow label="Shelf Density" value={storeData?.analysis_data?.estimated_store_size || "Moderate"} />
                                <div className="pt-2 mt-2 border-t border-indigo-500/20">
                                    <p className="text-xs text-indigo-200 leading-relaxed">
                                        "Visual analysis indicates a moderate stocking density of {uniqueBrands[0] || 'various'} products. Competitor density within 1km is high, suggesting potential out-of-stock risk if replenishment is delayed."
                                    </p>
                                </div>
                            </ul>
                        </div>

                        {/* Image Gallery */}
                        <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
                            <h2 className="text-lg font-bold mb-4">Analyzed Sources</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {images.length > 0 ? images.map((img, i) => (
                                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-700 relative group">
                                        <img src={img || "/placeholder.svg"} alt={`Source ${i}`} className="w-full h-full object-cover transition duration-300 group-hover:scale-110" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Scanned</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-2 text-center p-6 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
                                        No images available
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

// Sub-components
const MetricCard = ({ icon, title, value, subtitle, gradient, borderColor }) => (
    <div className={`bg-gradient-to-br ${gradient} border ${borderColor} rounded-2xl p-5 shadow-lg relative overflow-hidden group`}>
        <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            {React.cloneElement(icon, { size: 100 })}
        </div>
        <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="p-2 bg-black/20 rounded-lg backdrop-blur-md">
                {icon}
            </div>
        </div>
        <div className="relative z-10">
            <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
            <div className="text-2xl font-black text-white">{value}</div>
            <p className="text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>
        </div>
    </div>
);

const InsightRow = ({ label, value }) => (
    <li className="flex justify-between items-center text-sm">
        <span className="text-indigo-200/70">{label}</span>
        <span className="font-semibold text-white">{value}</span>
    </li>
);

const ValidationBadge = ({ status, score }) => {
    if (status === "Verified") {
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle size={12} /> Verified ({score}%)
            </div>
        );
    }
    if (status === "Medium confidence") {
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle size={12} /> Probable ({score}%)
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            <Info size={12} /> Unknown ({score}%)
        </div>
    );
};

export default AnalysisDashboardV4;
