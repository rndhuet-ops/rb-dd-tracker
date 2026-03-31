const express = require("express");
const cors    = require("cors");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = "trades.json";

app.use(cors());
app.use(express.json());

function loadDB() {
  try {
    if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch(e) {}
  return { trades: [], pairs: {} };
}

function saveDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// POST /webhook
// Body: { pair, result, rr, rRealized, account, direction, entry, sl, tp, comment }
app.post("/webhook", (req, res) => {
  const { pair, result, rr, rRealized, account, direction, entry, sl, tp, comment } = req.body;
  if (!pair || !result) return res.status(400).json({ error: "pair et result requis" });
  if (!["TP","SL","20h"].includes(result)) return res.status(400).json({ error: "result doit etre TP, SL ou 20h" });

  const db = loadDB();
  if (!db.trades) db.trades = [];
  if (!db.pairs)  db.pairs  = {};
  if (!db.pairs[pair]) db.pairs[pair] = [];

  const rReal = rRealized !== undefined ? rRealized : (result === "TP" ? rr : result === "SL" ? -1.0 : 0);
  const trade = {
    id:        Date.now(),
    date:      new Date().toISOString(),
    pair:      pair,
    account:   account || "---",
    direction: direction || "---",
    entry:     entry || 0,
    sl:        sl || 0,
    tp:        tp || 0,
    result:    result,
    rr:        rr || 2.0,
    rRealized: rReal,
    comment:   comment || ""
  };

  db.trades.push(trade);
  db.pairs[pair].push({ result, rr: rr||2.0, rRealized: rReal, date: trade.date });
  saveDB(db);

  console.log(`[TRADE] ${pair} ${account} ${direction} -> ${result} (${rReal}R)`);
  res.json({ ok: true, trade });
});

// GET /trades — toutes les donnees
app.get("/trades", (req, res) => {
  const db = loadDB();
  res.json(db);
});

// GET /journal — liste des trades
app.get("/journal", (req, res) => {
  const db = loadDB();
  res.json(db.trades || []);
});

// GET /pairs — donnees DD par paire
app.get("/pairs", (req, res) => {
  const db = loadDB();
  res.json(db.pairs || {});
});

// DELETE /reset/:pair
app.delete("/reset/:pair", (req, res) => {
  const db = loadDB();
  if (db.pairs) db.pairs[req.params.pair] = [];
  if (db.trades) db.trades = db.trades.filter(t => t.pair !== req.params.pair);
  saveDB(db);
  res.json({ ok: true, pair: req.params.pair });
});

// DELETE /reset-all
app.delete("/reset-all", (req, res) => {
  saveDB({ trades: [], pairs: {} });
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.json({ status: "RB DD Tracker online", time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`RB DD Tracker running on port ${PORT}`));
