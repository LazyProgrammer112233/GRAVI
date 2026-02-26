import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Download } from 'lucide-react';

export default function BulkAnalysisDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);

    useEffect(() => {
        const rawData = localStorage.getItem(`gravi_bulk_analysis_${id}`);
        if (rawData) {
            setData(JSON.parse(rawData));
        }
    }, [id]);

    if (!data) {
        return <div style={{ textAlign: 'center', padding: '4rem' }}>Loading Bulk Analysis...</div>;
    }

    const { sourceUrl, total_images_processed, results } = data;

    const downloadCSV = () => {
        // Define CSV Headers
        const headers = [
            "Serial Number",
            "Image Name",
            "Valid Grocery Store?",
            "Store Type",
            "Confidence (%)",
            "Estimated Size",
            "Visible Brands",
            "Dominant Brand",
            "Ad Materials Detected",
            "Category Detected",
            "Shelf Density",
            "Out of Stock Signals",
            "Competitive Presence",
            "AI Reasoning"
        ];

        // Format rows
        const rows = results.map((r, index) => [
            index + 1,
            r.image_name,
            r.is_valid_grocery_store ? 'Yes' : 'No',
            r.store_type.replace('_', ' '),
            r.store_type_confidence,
            r.estimated_store_size,
            `"${r.visible_brands}"`, // Quote strings that might contain commas
            r.dominant_brand,
            `"${r.ad_materials_detected}"`,
            r.category_detected,
            r.shelf_density_estimate,
            `"${r.out_of_stock_signals}"`,
            r.competitive_brand_presence,
            `"${r.reasoning}"`
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `GRAVI_Bulk_Analysis_${id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <button className="btn btn-glass" style={{ padding: '0.5rem 1rem' }} onClick={() => navigate('/app')}>
                    <ArrowLeft size={16} /> Back to Upload
                </button>
                <button className="btn btn-primary" onClick={downloadCSV}>
                    <Download size={18} /> Export to Excel (CSV)
                </button>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <h2>Bulk Analysis Complete</h2>
                <div style={{ color: 'var(--surface-300)', marginTop: '0.5rem' }}>
                    Successfully processed {total_images_processed} images from the provided Google Drive folder.
                </div>
                <div style={{ fontSize: '0.875rem', marginTop: '1rem', color: 'var(--primary-400)', wordBreak: 'break-all' }}>
                    Source: {sourceUrl}
                </div>
            </div>

            {/* Render a table of the results for quick preview */}
            <div className="card" style={{ overflowX: 'auto', padding: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--surface-300)' }}>
                            <th style={{ padding: '1rem' }}>S.No</th>
                            <th style={{ padding: '1rem' }}>Image Name</th>
                            <th style={{ padding: '1rem' }}>Status</th>
                            <th style={{ padding: '1rem' }}>Detected Type</th>
                            <th style={{ padding: '1rem' }}>Confidence</th>
                            <th style={{ padding: '1rem' }}>Brands</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '1rem', color: 'var(--surface-300)' }}>{i + 1}</td>
                                <td style={{ padding: '1rem', fontWeight: 500 }}>{r.image_name}</td>
                                <td style={{ padding: '1rem' }}>
                                    {r.is_valid_grocery_store
                                        ? <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={16} /> Valid</span>
                                        : <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><XCircle size={16} /> Invalid</span>
                                    }
                                </td>
                                <td style={{ padding: '1rem', textTransform: 'capitalize' }}>{r.store_type.replace('_', ' ')}</td>
                                <td style={{ padding: '1rem' }}>{r.store_type_confidence}%</td>
                                <td style={{ padding: '1rem', color: 'var(--surface-300)', fontSize: '0.875rem' }}>{Array.isArray(r.visible_brands) ? r.visible_brands.join(', ') : r.visible_brands}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
