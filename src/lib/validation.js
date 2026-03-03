// Simple Brand Dictionary (can be expanded later via Supabase or user input)
export const BRAND_DICTIONARY = [
    "Coca-Cola", "Pepsi", "Lays", "Kurkure", "Britannia", "Parle",
    "Surf Excel", "Tide", "Dove", "Pears", "Lifebuoy", "Lux",
    "Pepsodent", "Colgate", "Maggi", "Sunfeast", "Bingo",
    "Haldirams", "Amul", "Mother Dairy", "Nestle", "Cadbury",
    "Kinder", "Gillette", "Head & Shoulders", "Pantene",
    "Sunsilk", "Clinic Plus", "Nivea", "Garnier", "Loreal"
];

// Basic Levenshtein distance for fuzzy matching
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateMatchScore(str1, str2) {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (s1 === s2) return 100;

    // Check partial matches
    if (s1.includes(s2) || s2.includes(s1)) {
        return 90;
    }

    const distance = getLevenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 0;

    const score = Math.max(0, 100 - (distance / maxLength) * 100);
    return score;
}

export function validateProduct(product) {
    let bestMatch = null;
    let highestScore = 0;

    const extractedBrand = product.brand || "Unknown";

    if (extractedBrand === "Unknown") {
        return {
            ...product,
            brand: "Unknown",
            dictionary_match_score: 0,
            final_confidence: 0,
            validation_status: "Unknown"
        };
    }

    BRAND_DICTIONARY.forEach(dictBrand => {
        const score = calculateMatchScore(extractedBrand, dictBrand);
        if (score > highestScore) {
            highestScore = score;
            bestMatch = dictBrand;
        }
    });

    const modelConfidence = parseFloat(product.confidence) || 0;
    const dictScore = highestScore;

    const finalConfidence = Math.round((modelConfidence * 0.6) + (dictScore * 0.4));

    let status = "Unknown";
    let finalBrandName = extractedBrand;

    if (finalConfidence >= 85) {
        status = "Accept";
        finalBrandName = bestMatch || extractedBrand; // Normalize to dictionary if matched highly
    } else if (finalConfidence >= 70 && finalConfidence <= 84) {
        status = "Medium confidence";
        finalBrandName = bestMatch || extractedBrand;
    } else {
        status = "Unknown";
        finalBrandName = "Unknown";
    }

    return {
        brand: finalBrandName,
        product_name: product.product_name || "Unknown",
        category: product.category || "Unknown",
        confidence: modelConfidence,
        dictionary_match_score: dictScore,
        final_confidence: finalConfidence,
        reason: product.reason || "",
        validation_status: status
    };
}

export function validateProductsList(productsArray) {
    return productsArray.map(p => validateProduct(p));
}
