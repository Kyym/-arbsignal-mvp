import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

let settings = { minProfitPct: 1, bankroll: 1000 };
let opportunities = [];

function cleanText(value, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}

function calculateArbitrage({ overOdds, underOdds, bankroll }) {
  const over = Number(overOdds);
  const under = Number(underOdds);
  const totalStake = Number(bankroll);
  if (![over, under, totalStake].every(Number.isFinite)) {
    throw new Error("Odds and bankroll must be valid numbers.");
  }
  if (over <= 1 || under <= 1) throw new Error("Decimal odds must both be greater than 1.00.");
  if (totalStake <= 0) throw new Error("Bankroll must be greater than zero.");

  const inverseSum = (1 / over) + (1 / under);
  const isArbitrage = inverseSum < 1;
  const profitPct = ((1 / inverseSum) - 1) * 100;
  const overStake = totalStake * (1 / over) / inverseSum;
  const underStake = totalStake * (1 / under) / inverseSum;
  const equalizedPayout = totalStake / inverseSum;

  return {
    inverseSum,
    isArbitrage,
    profitPct,
    overStake,
    underStake,
    totalStake,
    overReturn: overStake * over,
    underReturn: underStake * under,
    equalizedPayout,
    profitAmount: equalizedPayout - totalStake
  };
}

function validatePayload(body) {
  const fixture = cleanText(body.fixture, 120);
  const market = cleanText(body.market, 30);
  const line = Number(body.line);
  const overBookmaker = cleanText(body.overBookmaker, 80);
  const underBookmaker = cleanText(body.underBookmaker, 80);
  const source = body.source === "live" ? "live" : "manual";
  const overOdds = Number(body.overOdds);
  const underOdds = Number(body.underOdds);

  if (!fixture) throw new Error("Enter the fixture or match name.");
  if (market !== "goals_over_under") throw new Error("This MVP supports Goals Over/Under only.");
  if (!Number.isFinite(line) || line <= 0 || line > 20) throw new Error("Enter a valid goals line, such as 2.5.");
  if (!overBookmaker || !underBookmaker) throw new Error("Enter both bookmaker names.");
  if (overBookmaker.toLowerCase() === underBookmaker.toLowerCase()) {
    throw new Error("Choose two different bookmakers for the two sides.");
  }
  if (![overOdds, underOdds].every(Number.isFinite) || overOdds <= 1 || underOdds <= 1) {
    throw new Error("Both decimal odds must be numbers greater than 1.00.");
  }
  return {
    id: crypto.randomUUID(),
    fixture,
    market,
    line,
    overBookmaker,
    underBookmaker,
    overOdds,
    underOdds,
    source,
    createdAt: new Date().toISOString()
  };
}

app.get("/api/state", (_req, res) => {
  res.json({ settings, opportunities });
});

app.put("/api/settings", (req, res) => {
  const minProfitPct = Number(req.body?.minProfitPct);
  const bankroll = Number(req.body?.bankroll);
  if (!Number.isFinite(minProfitPct) || minProfitPct < 0 || minProfitPct > 100) {
    return res.status(400).json({ error: "Minimum profit threshold must be between 0 and 100%." });
  }
  if (!Number.isFinite(bankroll) || bankroll <= 0 || bankroll > 1_000_000_000) {
    return res.status(400).json({ error: "Bankroll must be greater than zero and within the supported range." });
  }
  settings = { minProfitPct, bankroll };
  io.emit("state:update", { settings, opportunities });
  res.json({ settings });
});

app.post("/api/scan", (req, res) => {
  try {
    const item = validatePayload(req.body);
    const result = calculateArbitrage({
      overOdds: item.overOdds,
      underOdds: item.underOdds,
      bankroll: settings.bankroll
    });
    item.calculation = result;
    item.qualifies = result.isArbitrage && result.profitPct >= settings.minProfitPct;
    opportunities = [item, ...opportunities].slice(0, 50);
    io.emit("state:update", { settings, opportunities });
    res.status(201).json({ item, settings });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not scan those odds." });
  }
});

app.delete("/api/opportunities/:id", (req, res) => {
  opportunities = opportunities.filter((item) => item.id !== req.params.id);
  io.emit("state:update", { settings, opportunities });
  res.json({ opportunities });
});

app.delete("/api/opportunities", (_req, res) => {
  opportunities = [];
  io.emit("state:update", { settings, opportunities });
  res.json({ opportunities });
});

io.on("connection", (socket) => {
  socket.emit("state:update", { settings, opportunities });
});

server.listen(PORT, () => {
  console.log(`ArbSignal MVP running at http://localhost:${PORT}`);
});
