const url = "https://maps.app.goo.gl/rYsvwWFHLxotZfrA8"; // Flick2know Retail

async function testFetch() {
    console.log("Fetching URL:", url)
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Maps page: ${response.status}`);
    }

    const html = await response.text();
    console.log("Got HTML length:", html.length);

    // Parse og:title
    const titleMatch = html.match(/<meta content="([^"]+)" property="og:title">/i) || html.match(/<meta property="og:title" content="([^"]+)">/i) || html.match(/<title>([^<]+)<\/title>/i);
    let rawTitle = titleMatch ? titleMatch[1] : "Unknown Store";
    console.log("Raw Title:", rawTitle);

    let storeName = rawTitle.split('·')[0].trim();
    storeName = storeName.replace(' - Google Maps', '').trim();
    const address = rawTitle.includes('·') ? rawTitle.split('·')[1].trim() : "Unknown Address";

    console.log("Store Name:", storeName);
    console.log("Address:", address);

    // Parse og:image
    const imageMatch = html.match(/<meta content="([^"]+)" property="og:image">/i) || html.match(/<meta property="og:image" content="([^"]+)">/i);
    let imageUrl = imageMatch ? imageMatch[1] : null;
    console.log("Image URL:", imageUrl);

    // Parse og:description
    const descMatch = html.match(/<meta content="([^"]+)" property="og:description">/i) || html.match(/<meta property="og:description" content="([^"]+)">/i);
    let rawDesc = descMatch ? descMatch[1] : "";
    console.log("Raw Desc:", rawDesc);

    let rating = "0.0";
    let reviewCount = 0;

    const ratingNumMatch = rawDesc.match(/([0-9]\.[0-9])/);
    if (ratingNumMatch) {
        rating = ratingNumMatch[1];
    } else if (rawDesc.includes('★')) {
        const stars = (rawDesc.match(/★/g) || []).length;
        const halfStar = rawDesc.includes('☆') ? 0.5 : 0;
        rating = (stars + halfStar).toString();
    }

    const statsMatch = rawDesc.match(/([0-9,]+)\s+reviews?/i);
    if (statsMatch) {
        reviewCount = parseInt(statsMatch[1].replace(/,/g, ''), 10);
    }
    console.log("Rating:", rating, "Reviews:", reviewCount);

    if (!imageUrl) {
        const inlineImageMatch = html.match(/(https:\/\/lh5\.googleusercontent\.com\/p\/[a-zA-Z0-9_-]+)/);
        if (inlineImageMatch) imageUrl = inlineImageMatch[1];
        console.log("Fallback Image URL:", imageUrl);
    }
}

testFetch().catch(console.error);
