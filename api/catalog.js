const HOOK = "ff2a7649-0fd3-4b19-a8d3-9b7578dc2c33";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const listRes = await fetch(`https://webhook.site/token/${HOOK}/requests?sorting=newest&per_page=8`);
    if (!listRes.ok) {
      res.status(502).json([]);
      return;
    }
    const list = await listRes.json();
    for (const item of list.data || []) {
      let body;
      try {
        body = JSON.parse(item.content || "");
      } catch {
        continue;
      }
      const url = body && body.url;
      if (!url || !String(url).startsWith("https://litter.catbox.moe/")) continue;
      const catRes = await fetch(url);
      if (!catRes.ok) continue;
      const products = await catRes.json();
      if (Array.isArray(products) && products.length && products.every((p) => p && p.name && p.price !== undefined)) {
        res.status(200).json(products);
        return;
      }
    }
    res.status(404).json([]);
  } catch {
    res.status(500).json([]);
  }
};
