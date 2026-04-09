const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ejdagfskxzfikxkthuyb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZGFnZnNreHpmaWt4a3RodXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzA1MDgsImV4cCI6MjA5MDU0NjUwOH0.aMA-cMofE1yJrFjrYMtPu5AfUKcIj_c9g2FLX-fdZsI";

app.use(cors());
app.use(express.json());

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// POST /webhook
app.post("/webhook", async (req, res) => {
  const { pair, result, rr, rRealized, account, direction, entry, sl, tp, comment } = req.body;
  if (!pair || !result) return res.status(400).json({ error: "pair et result requis" });

  const rReal = rRealized !== undefined ? rRealized : (result === "TP" ? rr : result === "SL" ? -1.0 : 0);
  // Utiliser profitUSD reel si disponible sinon calculer
  const profitUSD = req.body.profitUSD !== undefined ? req.body.profitUSD : null;
  const trade = {
    id:         Date.now(),
    date:       req.body.date || new Date().toISOString(),
    pair,
    account:    account || "---",
    direction:  direction || "---",
    entry:      entry || 0,
    sl:         sl || 0,
    tp:         tp || 0,
    result,
    rr:         rr || 2.0,
    r_realized: rReal,
    profit_usd: profitUSD,
    comment:    comment || ""
  };

  try {
    await sbFetch("/trades", { method: "POST", body: JSON.stringify(trade) });
    console.log(`[TRADE] ${pair} ${account} ${direction} -> ${result} (${rReal}R)`);
    res.json({ ok: true, trade });
  } catch(e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /trades
app.get("/trades", async (req, res) => {
  try {
    const trades = await sbFetch("/trades?order=date.asc", { prefer: "return=representation" });
    // Reformater pour compatibilite avec le dashboard
    const pairs = {};
    trades.forEach(t => {
      if (!pairs[t.pair]) pairs[t.pair] = [];
      pairs[t.pair].push({ result: t.result, rr: t.rr, rRealized: t.r_realized, date: t.date });
    });
    res.json({ trades, pairs });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /journal
app.get("/journal", async (req, res) => {
  try {
    const trades = await sbFetch("/trades?order=date.desc");
    res.json(trades);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /reset/:pair
app.delete("/reset/:pair", async (req, res) => {
  try {
    await sbFetch(`/trades?pair=eq.${req.params.pair}`, { method: "DELETE", prefer: "return=minimal" });
    res.json({ ok: true, pair: req.params.pair });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /
// PUT /update/:id
app.put("/update/:id", async (req, res) => {
  const { pair, result, rr, rRealized, account, direction, entry, sl, tp, comment, date } = req.body;
  const updates = {};
  if (pair      !== undefined) updates.pair      = pair;
  if (result    !== undefined) updates.result    = result;
  if (rr        !== undefined) updates.rr        = rr;
  if (rRealized !== undefined) updates.r_realized = rRealized;
  if (account   !== undefined) updates.account   = account;
  if (direction !== undefined) updates.direction = direction;
  if (entry     !== undefined) updates.entry     = entry;
  if (sl        !== undefined) updates.sl        = sl;
  if (tp        !== undefined) updates.tp        = tp;
  if (comment   !== undefined) updates.comment   = comment;
  if (date      !== undefined) updates.date      = date;
  try {
    await sbFetch(`/trades?id=eq.${req.params.id}`, { method:"PATCH", body: JSON.stringify(updates), prefer:"return=minimal", headers:{"Content-Type":"application/json"} });
    console.log(`[UPDATE] trade ${req.params.id}`);
    res.json({ ok: true });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// DELETE /delete/:id
app.delete("/delete/:id", async (req, res) => {
  try {
    await sbFetch(`/trades?id=eq.${req.params.id}`, { method:"DELETE", prefer:"return=minimal" });
    console.log(`[DELETE] trade ${req.params.id}`);
    res.json({ ok: true });
  } catch(e) { console.error(e.message); res.status(500).json({ error: e.message }); }
});

// POST /dd-update — reçoit les stats d une paire depuis Pine Script
app.post("/dd-update", async (req, res) => {
  const data = req.body;
  if (!data || data.type !== "dd_update") return res.status(400).json({ error: "type dd_update requis" });

  const PAIRS = ["GBPJPY","EURJPY","CADJPY","USDJPY","NZDJPY","AUDJPY","GBPCHF","EURCHF","USDCHF","EURUSD","BTCUSD","DE30EUR"];
  const updated = [];

  for (const pair of PAIRS) {
    if (data[pair]) {
      const row = {
        pair,
        sl:         data[pair].sl  || 0,
        dd:         data[pair].dd  || 0,
        cr:         data[pair].cr  || 0,
        wr:         data[pair].wr  || 0,
        total:      data[pair].t   || 0,
        updated_at: new Date().toISOString()
      };
      try {
        await sbFetch("/dd_observer", {
          method: "POST",
          body: JSON.stringify(row),
          prefer: "resolution=merge-duplicates,return=minimal",
          headers: { "Content-Type": "application/json" }
        });
        updated.push(pair);
        console.log(`[DD_UPDATE] ${pair} sl:${row.sl} dd:${row.dd} cr:${row.cr} wr:${row.wr}`);
      } catch(e) {
        console.error(`dd_observer ${pair}:`, e.message);
      }
    }
  }

  res.json({ ok: true, updated });
});

// GET /dd-observer — toutes les paires
app.get("/dd-observer", async (req, res) => {
  try {
    const rows = await sbFetch("/dd_observer?order=pair.asc");
    const pairs = {};
    rows.forEach(r => {
      pairs[r.pair] = { sl: r.sl, dd: r.dd, cr: r.cr, wr: r.wr, t: r.total };
    });
    const lastUpdate = rows.length > 0 ? rows.sort((a,b) => new Date(b.updated_at)-new Date(a.updated_at))[0].updated_at : null;
    res.json({ date: lastUpdate, pairs });
  } catch(e) {
    res.json({ date: null, pairs: {} });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "RB DD Tracker online", db: "Supabase", time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`RB DD Tracker (Supabase) running on port ${PORT}`));
