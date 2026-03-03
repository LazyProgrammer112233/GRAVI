const test = async () => {
    try {
        console.log("Fetching...");
        const res = await fetch("https://iwdxokuakjshsagazjvu.supabase.co/functions/v1/analyze-maps-url-v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mapsUrl: "https://www.google.com/maps/place/28-29,+Bapu+Bazar+Main+Rd,+Bapu+Bazar,+Nada+Khadak,+Udaipur,+Rajasthan+313001" })
        });
        console.log("Status:", res.status);
        console.log("Body snippet:", (await res.text()).substring(0, 1000));
    } catch (e) {
        console.error("Fetch Error:", e);
    }
};
test();
