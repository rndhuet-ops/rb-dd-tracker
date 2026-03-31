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
  return {};
}

function saveDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

app.post("/webhook", (req, res) => {
  const { pair, result, rr } = req.body;
  if (!pair || !result) return res.status(400).json({ error: "pair et result requis" });
  if (!["TP","SL"].includes(result)) return res.status(400).json({ error: "result doit etre TP ou SL" });
  const db = loadDB();
  if (!db[pair]) db[pair] = [];
  db[pair].push({ result, rr: rr || 2.0, date: new Date().toISOString() });
  saveDB(db);
  console.log(`[TRADE] ${pair} => ${result} (RR ${rr})`);
  res.json({ ok: true, pair, result, total: db[pair].length });
});

app.get("/trades", (req, res) => {
  res.json(loadDB());
});

app.get("/trades/:pair", (req, res) => {
  const db = loadDB();
  res.json(db[req.params.pair] || []);
});

app.delete("/reset/:pair", (req, res) => {
  const db = loadDB();
  db[req.params.pair] = [];
  saveDB(db);
  res.json({ ok: true, pair: req.params.pair });
});

app.get("/", (req, res) => {
  res.json({ status: "RB DD Tracker online", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`RB DD Tracker running on port ${PORT}`);
});
