const url = "https://api.replicate.com/v1/models/lucataco/internvl2-8b";
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    .then(res => res.json())
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
