import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Home,
  Gauge,
  Activity,
  MoveHorizontal,
  AlertTriangle,
  Ruler,
  Thermometer,
  Waves,
  Bell,
  Settings as SettingsIcon,
  CheckCircle2,
  Zap,
  RotateCcw,
  ChevronLeft,
  Sun,
  Moon,
  Search,
  Wrench,
  Sparkles,
  Cpu,
  Download,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  RefreshCw,
  Copy,
  Check,
  Globe,
  ShieldCheck,
  Play,
  HelpCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 5 Official Sensors Schema (Mapped to ESP32 Telemetry)
// ---------------------------------------------------------------------------
const SENSOR_DEFS = [
  {
    id: "misalignment",
    label: "Misalignment",
    abbCode: "ET01",
    hardware: "Infrared (IR) Optical Sensor",
    hardwareType: "IR Sensor",
    method: "Lateral Edge Displacement (Left/Right)",
    icon: MoveHorizontal,
    unit: "mm",
    decimals: 1,
    nominal: 5.4,
    volatility: 0.8,
    reversion: 0.14,
    scaleMin: 0,
    scaleMax: 45,
    nodeX: 280,
    nodeUp: true,
    zones: [
      { from: 0, to: 12, sev: "good" },
      { from: 12, to: 25, sev: "warn" },
      { from: 25, to: 45, sev: "crit" },
    ],
  },
  {
    id: "magnetic_hall",
    label: "Thickness / Wear",
    abbCode: "ET02",
    hardware: "Hall Effect Sensor Array",
    hardwareType: "Hall Effect Sensor",
    method: "Embedded Magnetic Loop & Rip Integrity",
    icon: Ruler,
    unit: "% int.",
    decimals: 1,
    nominal: 96.5,
    volatility: 0.4,
    reversion: 0.08,
    scaleMin: 40,
    scaleMax: 100,
    nodeX: 430,
    nodeUp: false,
    zones: [
      { from: 40, to: 70, sev: "crit" },
      { from: 70, to: 88, sev: "warn" },
      { from: 88, to: 100, sev: "good" },
    ],
  },
  {
    id: "proximity_speed",
    label: "Speed / Slippage",
    abbCode: "S1/S2",
    hardware: "Inductive Proximity Sensor",
    hardwareType: "Proximity Sensor",
    method: "Pulley Rotation & Belt Running Motion",
    icon: Gauge,
    unit: "m/s",
    decimals: 2,
    nominal: 2.35,
    volatility: 0.04,
    reversion: 0.1,
    scaleMin: 0,
    scaleMax: 3.5,
    nodeX: 860,
    nodeUp: false,
    zones: [
      { from: 0, to: 1.5, sev: "crit" },
      { from: 1.5, to: 1.9, sev: "warn" },
      { from: 1.9, to: 2.7, sev: "good" },
      { from: 2.7, to: 3.0, sev: "warn" },
      { from: 3.0, to: 3.5, sev: "crit" },
    ],
  },
  {
    id: "vibration",
    label: "Vibration Condition",
    abbCode: "ET03",
    hardware: "Piezoelectric Vibration Sensor",
    hardwareType: "Vibrator Sensor",
    method: "Pulley Bearing RMS Velocity",
    icon: Waves,
    unit: "mm/s",
    decimals: 2,
    nominal: 2.1,
    volatility: 0.35,
    reversion: 0.12,
    scaleMin: 0,
    scaleMax: 12,
    nodeX: 740,
    nodeUp: true,
    zones: [
      { from: 0, to: 3.5, sev: "good" },
      { from: 3.5, to: 6.0, sev: "warn" },
      { from: 6.0, to: 12.0, sev: "crit" },
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    abbCode: "ET04",
    hardware: "Thermal RTD / DS18B20 Temp Sensor",
    hardwareType: "Temperature Sensor",
    method: "Drive Motor & Bearing Housing Thermal",
    icon: Thermometer,
    unit: "°C",
    decimals: 1,
    nominal: 43.8,
    volatility: 0.6,
    reversion: 0.07,
    scaleMin: 20,
    scaleMax: 100,
    nodeX: 920,
    nodeUp: true,
    zones: [
      { from: 20, to: 58, sev: "good" },
      { from: 58, to: 75, sev: "warn" },
      { from: 75, to: 100, sev: "crit" },
    ],
  },
];

const SEV_LABEL = { good: "Normal", warn: "Warning", crit: "Critical" };
const SCORE_MAP = { good: 100, warn: 55, crit: 10 };

function severityOf(sensor, value) {
  const zone = sensor.zones.find((z) => value >= z.from && value < z.to);
  if (zone) return zone.sev;
  return value < sensor.zones[0].from ? sensor.zones[0].sev : sensor.zones[sensor.zones.length - 1].sev;
}

function makeHistory(nominal, n = 30) {
  return Array.from({ length: n }, (_, i) => ({
    time: `${i * 2}s`,
    v: +(nominal + (Math.random() - 0.5) * 0.3).toFixed(2),
  }));
}

// Chime synthesizer for critical alarms
function playAlertChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Analog Speedometer Dial Gauge (Pure SVG & CSS)
// ---------------------------------------------------------------------------
function AnalogDialGauge({ value, min = 0, max = 3.5, unit = "m/s", title = "Speed Sensor" }) {
  const norm = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const angle = -120 + norm * 240;
  const isWarn = value >= 2.8 && value < 3.1;
  const isCrit = value >= 3.1 || value < 1.0;
  const gaugeColor = isCrit ? "var(--color-crit)" : isWarn ? "var(--color-warn)" : "var(--color-good)";

  return (
    <div className="abb-dial-gauge-card">
      <span className="abb-dial-title">{title}</span>
      <div className="abb-gauge-svg-wrap">
        <svg viewBox="0 0 160 160" style={{ width: "100%", height: "100%" }}>
          {/* Background Arc */}
          <path d="M 30 130 A 65 65 0 1 1 130 130" fill="none" stroke="var(--border-color)" strokeWidth="10" strokeLinecap="round" />
          {/* Safe Green Zone */}
          <path d="M 30 130 A 65 65 0 0 1 118 42" fill="none" stroke="var(--color-good)" strokeWidth="10" strokeLinecap="round" opacity="0.3" />
          {/* Danger Red Zone */}
          <path d="M 118 42 A 65 65 0 0 1 130 130" fill="none" stroke="var(--color-crit)" strokeWidth="10" strokeLinecap="round" opacity="0.3" />
          {/* Active Arc */}
          <path
            d="M 30 130 A 65 65 0 1 1 130 130"
            fill="none"
            stroke={gaugeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="270"
            strokeDashoffset={270 - norm * 270}
            style={{ transition: "stroke-dashoffset 0.35s ease, stroke 0.25s ease" }}
          />
          {/* Center Hub */}
          <circle cx="80" cy="80" r="7" fill="var(--text-main)" />
          {/* Animated Needle */}
          <g transform={`rotate(${angle} 80 80)`} className="abb-gauge-needle">
            <line x1="80" y1="80" x2="80" y2="30" stroke={gaugeColor} strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="80" cy="80" r="3.5" fill="#FFFFFF" />
          </g>
        </svg>
        <div className="abb-gauge-center-readout">
          <span className="abb-gauge-val" style={{ color: gaugeColor }}>{value.toFixed(2)}</span>
          <span className="abb-gauge-unit">{unit}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 1: Home Screen (ABB Conveyor Schematic & Overall Health)
// ---------------------------------------------------------------------------
function HomeView({ sensorState, goTo, healthScore, goodCount, warnCount, critCount, total, donutCirc, segGood, segWarn, segCrit, isEspConnected, espEndpoint }) {
  const speedVal = sensorState.proximity_speed?.value || 2.35;
  const isRunning = speedVal > 0.4;
  const speedNorm = Math.min(1, Math.max(0, speedVal / 3.5));
  const beltDuration = Math.max(0.6, 2.2 - speedNorm * 1.5);
  const flowDots = [0, 1, 2, 3, 4, 5];

  return (
    <div>
      {/* Top Conveyor Status Strip */}
      <div className="abb-card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "var(--abb-red-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity size={22} color="var(--abb-red)" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Conveyor Line 04 — Overland Section (2.4 km)</h1>
                <span className={`abb-status-badge ${isRunning ? "good" : "crit"}`}>
                  {isRunning ? "● RUNNING" : "■ STOPPED"}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Real-time ESP32 edge telemetry · 5 condition monitoring channels active
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => goTo("settings")}
              className="abb-btn"
              style={{
                backgroundColor: isEspConnected ? "var(--color-good-bg)" : "var(--color-warn-bg)",
                borderColor: isEspConnected ? "var(--color-good)" : "var(--color-warn)",
                color: isEspConnected ? "var(--color-good)" : "var(--color-warn)",
              }}
            >
              {isEspConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isEspConnected ? "ESP32 Live Stream" : "Simulation Mode"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main ABB Schematic Drawing Canvas */}
      <div className="abb-card">
        <div className="abb-card-header">
          <div className="abb-card-title-group">
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--abb-red)" }} />
            <span className="abb-card-title">Info X Conveyor Layout &amp; Sensor Callouts</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Click any sensor badge to open deep analytics
          </span>
        </div>

        {/* Industrial 2D Vector Schematic */}
        <div className="abb-schematic-wrapper">
          <svg viewBox="0 0 1000 280" className="abb-schematic-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="driveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
            </defs>

            {/* Drive Station Frame (Right) */}
            <rect x="880" y="95" width="105" height="155" fill="none" stroke="var(--border-color)" strokeWidth="3" rx="4" />
            <line x1="880" y1="180" x2="985" y2="180" stroke="var(--border-color)" strokeWidth="2" />
            <line x1="930" y1="180" x2="930" y2="250" stroke="var(--border-color)" strokeWidth="2" />
            <rect x="915" y="120" width="55" height="44" rx="4" fill="url(#driveGrad)" stroke="var(--abb-red)" strokeWidth="2" />
            <text x="942" y="147" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="bold">MOTOR</text>

            {/* Gravity Take-up Tower (Center) */}
            <rect x="520" y="115" width="60" height="135" fill="none" stroke="var(--border-color)" strokeWidth="2.5" />
            <circle cx="550" cy="180" r="16" fill="var(--bg-surface)" stroke="var(--text-dim)" strokeWidth="2.5" />
            <rect x="542" y="200" width="16" height="24" fill="var(--text-dim)" rx="2" />
            <line x1="550" y1="196" x2="550" y2="200" stroke="var(--text-main)" strokeWidth="2" />

            {/* Tail Pulley & Loading Chute (Left) */}
            <rect x="20" y="125" width="70" height="125" fill="none" stroke="var(--border-color)" strokeWidth="3" rx="4" />
            <polygon points="35,65 75,65 65,110 45,110" fill="var(--bg-surface)" stroke="var(--border-color)" strokeWidth="2" />
            <text x="55" y="90" textAnchor="middle" fill="var(--text-dim)" fontSize="8" fontWeight="bold">CHUTE</text>

            {/* Pulleys */}
            <circle cx="60" cy="155" r="28" fill="var(--bg-surface)" stroke="var(--text-dim)" strokeWidth="4" />
            <circle cx="915" cy="145" r="30" fill="var(--bg-surface)" stroke="var(--abb-red)" strokeWidth="4" />
            <circle cx="830" cy="185" r="18" fill="var(--bg-surface)" stroke="var(--text-dim)" strokeWidth="3" />
            <circle cx="480" cy="160" r="16" fill="var(--bg-surface)" stroke="var(--text-dim)" strokeWidth="2.5" />
            <circle cx="620" cy="160" r="16" fill="var(--bg-surface)" stroke="var(--text-dim)" strokeWidth="2.5" />

            {/* Carrying Rollers */}
            {[170, 270, 370, 460, 660, 750, 840].map((cx) => (
              <g key={cx}>
                <line x1={cx} y1="120" x2={cx} y2="155" stroke="var(--border-color)" strokeWidth="2" />
                <circle cx={cx} cy="120" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="2" />
              </g>
            ))}

            {/* Main Belt Loop Path */}
            <path
              d="M 60 127 L 480 127 L 534 165 L 550 180 L 566 165 L 620 127 L 915 115"
              fill="none"
              stroke="var(--text-main)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M 915 175 L 830 203 L 620 185 L 566 185 L 550 180 L 534 185 L 480 185 L 60 183"
              fill="none"
              stroke="var(--text-dim)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Material Flow Particle Dots */}
            {isRunning &&
              flowDots.map((i) => (
                <circle
                  key={`dot-${i}`}
                  cx="60"
                  cy="127"
                  r="3.5"
                  fill="var(--abb-red)"
                  style={{
                    animation: `flow-right ${beltDuration * 1.5}s linear infinite`,
                    animationDelay: `${-(i * (beltDuration * 1.5)) / flowDots.length}s`,
                  }}
                />
              ))}

            {/* Sensor Line Indicators */}
            {SENSOR_DEFS.map((s) => {
              const st = sensorState[s.id];
              const sev = st?.severity || "good";
              const nodeY = s.nodeUp ? 127 : 185;
              const sevColor = sev === "good" ? "var(--color-good)" : sev === "warn" ? "var(--color-warn)" : "var(--color-crit)";
              return (
                <g key={s.id}>
                  <line x1={s.nodeX} y1={nodeY} x2={s.nodeX} y2={s.nodeUp ? 75 : 230} stroke={sevColor} strokeWidth="2" strokeDasharray="3 3" />
                  {sev !== "good" && <circle cx={s.nodeX} cy={nodeY} r="9" fill="none" stroke={sevColor} strokeWidth="2" className="pin-ring" />}
                  <circle cx={s.nodeX} cy={nodeY} r="6" fill={sevColor} className={sev !== "good" ? "pin-pulse" : ""} />
                </g>
              );
            })}
          </svg>

          {/* 5 Callout Sensor Cards Positioned Exactly Over the Conveyor */}
          {SENSOR_DEFS.map((s) => {
            const st = sensorState[s.id];
            const sev = st?.severity || "good";
            const Icon = s.icon;
            const leftPct = (s.nodeX / 1000) * 100;
            return (
              <div
                key={s.id}
                className={`abb-callout-node ${sev}`}
                style={{
                  left: `${leftPct}%`,
                  top: s.nodeUp ? 10 : undefined,
                  bottom: s.nodeUp ? undefined : 10,
                }}
                onClick={() => goTo(s.id)}
              >
                <div className="abb-callout-header">
                  <span className="abb-callout-title">{s.label}</span>
                  <span className="abb-callout-code">{s.abbCode}</span>
                </div>
                <div className="abb-callout-val-row">
                  <span className={`abb-callout-val ${sev}`}>{st?.value?.toFixed(s.decimals)}</span>
                  <span className="abb-callout-unit">{s.unit}</span>
                </div>
                <div className="abb-callout-sub">{s.hardwareType}</div>
              </div>
            );
          })}
        </div>

        {/* Bottom Health Gauge and AI Telemetry Strip */}
        <div className="abb-grid-3" style={{ borderTop: "1px solid var(--border-color)", paddingTop: 20 }}>
          {/* Conveyor Belt Health Donut */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 100, height: 100, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="var(--border-color)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="var(--color-good)"
                  strokeWidth="10"
                  strokeDasharray={`${segGood} ${donutCirc - segGood}`}
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="var(--color-warn)"
                  strokeWidth="10"
                  strokeDasharray={`${segWarn} ${donutCirc - segWarn}`}
                  strokeDashoffset={-segGood}
                  transform="rotate(-90 50 50)"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="var(--color-crit)"
                  strokeWidth="10"
                  strokeDasharray={`${segCrit} ${donutCirc - segCrit}`}
                  strokeDashoffset={-(segGood + segWarn)}
                  transform="rotate(-90 50 50)"
                />
                <text x="50" y="48" textAnchor="middle" fontSize="18" className="mono" fill="var(--text-main)" fontWeight="800">
                  {healthScore}%
                </text>
                <text x="50" y="62" textAnchor="middle" fontSize="7" fill="var(--text-muted)" fontWeight="700">
                  HEALTH
                </text>
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Conveyor Belt Health</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-good)" }} /> Normal <strong className="mono">{goodCount}/{total}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-warn)" }} /> Warning <strong className="mono">{warnCount}/{total}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-crit)" }} /> Critical <strong className="mono">{critCount}/{total}</strong>
              </div>
            </div>
          </div>

          {/* ESP32 Telemetry Status */}
          <div style={{ backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={16} color="var(--abb-red)" />
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>ESP32 Ingest Status</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, margin: "6px 0" }}>
              {isEspConnected ? `Polling active at ${espEndpoint}` : "Running standalone simulation. Ready for ESP32 Wi-Fi telemetry packet stream."}
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", borderTop: "1px solid var(--border-color)", paddingTop: 6 }}>
              <span>5 Hardware Pins</span>
              <span style={{ fontWeight: 700, color: isEspConnected ? "var(--color-good)" : "var(--color-warn)" }}>
                {isEspConnected ? "ONLINE (18ms)" : "STANDALONE SIM"}
              </span>
            </div>
          </div>

          {/* AI Condition Monitoring Advisor */}
          <div style={{ backgroundColor: "var(--abb-red-soft)", border: "1px solid var(--abb-red-border)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} color="var(--abb-red)" />
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--abb-red)", textTransform: "uppercase" }}>Info X Condition Advisor</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-main)", lineHeight: 1.4, margin: "6px 0", fontWeight: 500 }}>
              {healthScore >= 90
                ? "All 5 field sensors nominal. Thermal, lateral drift, and magnetic splices operating within ISO 5048 parameters."
                : healthScore >= 65
                ? "Minor threshold deviations detected. Verify IR misalignment tracking and motor bearing thermal trends."
                : "Critical alarm: Immediate inspection recommended on affected sensor channels."}
            </p>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--abb-red)", fontFamily: "var(--font-mono)" }}>
              ISO 5048 / DIN 22101 COMPLIANT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 2: Misalignment (IR Sensor)
// ---------------------------------------------------------------------------
function MisalignmentView({ sensorState, goTo, onInjectFault }) {
  const st = sensorState.misalignment;
  const s = SENSOR_DEFS.find((x) => x.id === "misalignment");
  const chartData = useMemo(() => {
    return st.history.map((h) => ({
      time: h.time,
      left: +(h.v * 0.92).toFixed(1),
      right: +(h.v * 1.08).toFixed(1),
    }));
  }, [st.history]);

  return (
    <div>
      <div className="abb-card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => goTo("home")} className="abb-btn" style={{ padding: "6px 10px" }}>
              <ChevronLeft size={16} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800 }}>Misalignment Status</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Infrared (IR) Optical Edge Beam Sensors — ET01 &amp; ET02</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`abb-status-badge ${st.severity}`}>{SEV_LABEL[st.severity]}</span>
            <button onClick={() => onInjectFault("misalignment")} className="abb-btn warn">
              <Zap size={13} /> Simulate Drift Spike
            </button>
          </div>
        </div>
      </div>

      <div className="abb-grid-3">
        <div className="abb-card">
          <span className="abb-card-title">Lateral Drift Reading</span>
          <div style={{ margin: "16px 0" }}>
            <span className="mono" style={{ fontSize: 36, fontWeight: 900, color: st.severity === "good" ? "var(--color-good)" : "var(--color-crit)" }}>
              {st.value.toFixed(1)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-dim)", marginLeft: 6 }}>mm offset</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border-color)", paddingTop: 12, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Left IR Sensor:</span>
              <strong className="mono" style={{ color: "#3B82F6" }}>{(st.value * 0.92).toFixed(1)} mm</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Right IR Sensor:</span>
              <strong className="mono" style={{ color: "#EF4444" }}>{(st.value * 1.08).toFixed(1)} mm</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Warning Trip Limit:</span>
              <strong className="mono" style={{ color: "var(--color-crit)" }}>25.0 mm</strong>
            </div>
          </div>
        </div>

        {/* Belt Centering Visualizer */}
        <div className="abb-card" style={{ gridColumn: "span 2" }}>
          <span className="abb-card-title">Belt Centering Visualizer</span>
          <div style={{ padding: "30px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", height: 6, backgroundColor: "var(--border-color)", borderRadius: 3 }} />
            <div
              style={{
                width: "60%",
                height: 24,
                backgroundColor: "var(--text-main)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                transform: `translateX(${(st.value - s.nominal) * 4}px) translateY(-15px)`,
                border: `2px solid ${st.severity === "good" ? "var(--color-good)" : "var(--color-crit)"}`,
                transition: "transform 0.3s ease",
              }}
            >
              CONVEYOR BELT STRAND
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 8 }}>
              <span style={{ color: "#3B82F6" }}>● Left IR Beam (ET01)</span>
              <span style={{ color: "#EF4444" }}>● Right IR Beam (ET02)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Trend Line */}
      <div className="abb-card">
        <div className="abb-card-header">
          <span className="abb-card-title">Misalignment Trend (Left vs Right IR Sensors)</span>
          <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: "#3B82F6" }}>— Left Sensor (mm)</span>
            <span style={{ color: "#EF4444" }}>— Right Sensor (mm)</span>
          </div>
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--text-dim)" fontSize={11} domain={[0, 45]} unit="mm" tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)", borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine y={25} stroke="var(--color-crit)" strokeDasharray="4 4" label={{ value: "Alarm (25mm)", fill: "var(--color-crit)", fontSize: 10 }} />
              <Line type="monotone" dataKey="left" stroke="#3B82F6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="right" stroke="#EF4444" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 3: Thickness / Wear & Magnetic (Hall Effect Sensor)
// ---------------------------------------------------------------------------
function ThicknessMagneticView({ sensorState, goTo, onInjectFault }) {
  const st = sensorState.magnetic_hall;
  const transponders = useMemo(() => {
    return [
      { id: "ET01", integrity: Math.min(100, Math.max(50, st.value + 1.2)) },
      { id: "ET02", integrity: Math.min(100, Math.max(50, st.value - 0.8)) },
      { id: "ET03", integrity: Math.min(100, Math.max(50, st.value + 0.5)) },
      { id: "ET04", integrity: Math.min(100, Math.max(50, st.value - 3.2)) },
      { id: "ET05", integrity: Math.min(100, Math.max(50, st.value + 2.1)) },
      { id: "ET06", integrity: Math.min(100, Math.max(50, st.value - 1.5)) },
      { id: "ET07", integrity: Math.min(100, Math.max(50, st.value + 0.2)) },
      { id: "ET08", integrity: Math.min(100, Math.max(50, st.value - 0.4)) },
    ];
  }, [st.value]);

  return (
    <div>
      <div className="abb-card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => goTo("home")} className="abb-btn" style={{ padding: "6px 10px" }}>
              <ChevronLeft size={16} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800 }}>Thickness / Wear &amp; Magnetic Monitoring</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Hall-Effect Sensor Array · Magnetic Loop Splice &amp; Rip Detection</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`abb-status-badge ${st.severity}`}>{SEV_LABEL[st.severity]}</span>
            <button onClick={() => onInjectFault("magnetic_hall")} className="abb-btn warn">
              <Zap size={13} /> Simulate Loop Breach
            </button>
          </div>
        </div>
      </div>

      {/* Magnetic Transponder Array Bar Chart */}
      <div className="abb-card">
        <div className="abb-card-header">
          <div>
            <span className="abb-card-title">Magnetic Transponder Array Integrity (ET01 – ET08)</span>
            <p className="abb-card-subtitle">Hall effect magnetic flux pickup per splice transponder loop</p>
          </div>
          <span className="mono" style={{ fontSize: 24, fontWeight: 900, color: "var(--color-good)" }}>
            {st.value.toFixed(1)}% Avg
          </span>
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={transponders}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="id" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--text-dim)" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="integrity" fill="#0052CC" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="abb-grid-2">
        <div className="abb-card">
          <span className="abb-card-title">ET01 — Top Cover Thickness Trend</span>
          <div style={{ margin: "10px 0" }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 800, color: "var(--color-good)" }}>11.4 mm</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 6 }}>Nominal 12.0 mm (4.8% wear)</span>
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={st.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.4} />
                <Line type="monotone" dataKey="v" stroke="var(--color-good)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="abb-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span className="abb-card-title">Longitudinal Rip Protection</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 8, backgroundColor: "var(--color-good-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck size={24} color="var(--color-good)" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--color-good)" }}>Splice Loops Continuous</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>8 embedded magnetic coils transmitting pulses to ESP32 Hall probe.</p>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Sensor Model:</span>
              <strong className="mono">Hall Effect (A3144 / SS49E)</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>Auto-Trip Status:</span>
              <strong className="mono" style={{ color: "var(--color-good)" }}>ARMED</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 4: Speed / Slippage (Proximity Movement Sensor)
// ---------------------------------------------------------------------------
function SpeedSlippageView({ sensorState, goTo, onInjectFault }) {
  const st = sensorState.proximity_speed;
  const speedVal = st.value;
  const rpm = Math.round(speedVal * 42.5);
  const slippagePct = Math.max(0.2, (3.0 - speedVal) * 1.8);
  const isRunning = speedVal > 0.4;

  return (
    <div>
      <div className="abb-card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => goTo("home")} className="abb-btn" style={{ padding: "6px 10px" }}>
              <ChevronLeft size={16} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800 }}>Speed / Slippage Status</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Inductive Proximity Sensor Movement Detection (S1 / S2)</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`abb-status-badge ${isRunning ? "good" : "crit"}`}>
              {isRunning ? "RUNNING" : "STOPPED"}
            </span>
            <button onClick={() => onInjectFault("proximity_speed")} className="abb-btn warn">
              <Zap size={13} /> Simulate Speed Loss
            </button>
          </div>
        </div>
      </div>

      {/* Dual Speedometer Analog Gauges */}
      <div className="abb-grid-2">
        <AnalogDialGauge value={speedVal} min={0} max={3.5} unit="m/s" title="Speed Sensor S1 (Drive Pulley Proximity)" />
        <AnalogDialGauge value={Math.max(0, speedVal - (slippagePct / 100) * speedVal)} min={0} max={3.5} unit="m/s" title="Speed Sensor S2 (Tail Pulley Proximity)" />
      </div>

      {/* Metric Cards */}
      <div className="abb-grid-3">
        <div className="abb-card">
          <span className="abb-card-title">Belt Linear Speed</span>
          <div style={{ margin: "10px 0" }}>
            <span className="mono" style={{ fontSize: 32, fontWeight: 900, color: "var(--color-good)" }}>{speedVal.toFixed(2)}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-dim)", marginLeft: 6 }}>m/s</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Target nominal: 2.35 m/s</p>
        </div>

        <div className="abb-card">
          <span className="abb-card-title">Drive Pulley RPM</span>
          <div style={{ margin: "10px 0" }}>
            <span className="mono" style={{ fontSize: 32, fontWeight: 900, color: "var(--text-main)" }}>{rpm}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-dim)", marginLeft: 6 }}>RPM</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Calculated from inductive pulse frequency</p>
        </div>

        <div className="abb-card">
          <span className="abb-card-title">Drive Slippage Factor</span>
          <div style={{ margin: "10px 0" }}>
            <span className="mono" style={{ fontSize: 32, fontWeight: 900, color: slippagePct > 3 ? "var(--color-crit)" : "var(--color-good)" }}>
              {slippagePct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-dim)", marginLeft: 6 }}>slip</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Max allowable threshold: 4.0%</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 5: Damage / Temperature & Vibration
// ---------------------------------------------------------------------------
function DamageVibrationTempView({ sensorState, goTo, onInjectFault }) {
  const tempSt = sensorState.temperature;
  const vibSt = sensorState.vibration;

  return (
    <div>
      <div className="abb-card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => goTo("home")} className="abb-btn" style={{ padding: "6px 10px" }}>
              <ChevronLeft size={16} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 800 }}>Damage, Temperature &amp; Vibration Condition</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Motor &amp; Pulley Bearing Thermal / Piezoelectric Vibration Velocity</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => onInjectFault("temperature")} className="abb-btn warn">
              <Zap size={13} /> Inject Temp Spike
            </button>
            <button onClick={() => onInjectFault("vibration")} className="abb-btn crit">
              <Zap size={13} /> Inject Vibration Spike
            </button>
          </div>
        </div>
      </div>

      <div className="abb-grid-2">
        {/* Temperature Chart */}
        <div className="abb-card">
          <div className="abb-card-header">
            <div>
              <span className="abb-card-title">Temperature ET01 (Drive Motor Bearing)</span>
              <p className="abb-card-subtitle">Thermal RTD / DS18B20 · Alarm @ 75°C</p>
            </div>
            <span className="mono" style={{ fontSize: 24, fontWeight: 900, color: tempSt.severity === "good" ? "var(--color-good)" : "var(--color-crit)" }}>
              {tempSt.value.toFixed(1)}°C
            </span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempSt.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
                <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={11} domain={[20, 100]} unit="°C" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={75} stroke="var(--color-crit)" strokeDasharray="4 4" label={{ value: "Critical (75°C)", fill: "var(--color-crit)", fontSize: 10 }} />
                <Line type="monotone" dataKey="v" stroke="#F59E0B" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vibration Chart */}
        <div className="abb-card">
          <div className="abb-card-header">
            <div>
              <span className="abb-card-title">Vibration ET01 (Bearing RMS Velocity)</span>
              <p className="abb-card-subtitle">Piezoelectric Vibration Sensor · ISO 10816-3</p>
            </div>
            <span className="mono" style={{ fontSize: 24, fontWeight: 900, color: vibSt.severity === "good" ? "var(--color-good)" : "var(--color-crit)" }}>
              {vibSt.value.toFixed(2)} mm/s
            </span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={vibSt.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
                <XAxis dataKey="time" stroke="var(--text-dim)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={11} domain={[0, 12]} unit="mm/s" tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={6.0} stroke="var(--color-crit)" strokeDasharray="4 4" label={{ value: "Alarm (6.0 mm/s)", fill: "var(--color-crit)", fontSize: 10 }} />
                <Line type="monotone" dataKey="v" stroke="#8B5CF6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 6: Alarms & Events Log
// ---------------------------------------------------------------------------
function AlarmsView({ filteredAlarms, alarmFilter, setAlarmFilter, alarmSearch, setAlarmSearch, acknowledge }) {
  const exportCSV = () => {
    const header = "Time,Sensor,Hardware,Description,Severity,Status\n";
    const rows = filteredAlarms.map((a) =>
      `"${a.time.toLocaleString()}","${a.label}","${a.hardware}","${a.message.replace(/"/g, '""')}","${SEV_LABEL[a.severity]}","${a.acknowledged ? "Acknowledged" : "Active"}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `infox-conveyor-alarms-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="abb-card">
      <div className="abb-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={20} color="var(--abb-red)" />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800 }}>Info X Alarms &amp; Events Log</h1>
            <p className="abb-card-subtitle">Real-time incident registry &amp; operator actions</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={alarmSearch}
            onChange={(e) => setAlarmSearch(e.target.value)}
            placeholder="Search events..."
            className="abb-input"
            style={{ width: 160 }}
          />
          {["all", "warn", "crit"].map((f) => (
            <button
              key={f}
              onClick={() => setAlarmFilter(f)}
              className={`abb-btn ${alarmFilter === f ? "primary" : ""}`}
              style={{ padding: "6px 12px" }}
            >
              {f === "all" ? "All Events" : f === "warn" ? "Warnings" : "Critical"}
            </button>
          ))}
          <button onClick={exportCSV} disabled={filteredAlarms.length === 0} className="abb-btn">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {filteredAlarms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)" }}>
          <CheckCircle2 size={36} color="var(--color-good)" style={{ margin: "0 auto 10px", opacity: 0.8 }} />
          <p style={{ fontSize: 14, fontWeight: 700 }}>No active alarms</p>
          <p style={{ fontSize: 12 }}>All 5 conveyor sensors are currently running within nominal thresholds.</p>
        </div>
      ) : (
        <div className="abb-table-wrapper">
          <table className="abb-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Sensor</th>
                <th>Hardware Type</th>
                <th>Description</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlarms.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: "var(--text-dim)" }}>{a.time.toLocaleTimeString()}</td>
                  <td style={{ fontWeight: 800 }}>{a.label}</td>
                  <td style={{ color: "var(--text-muted)" }}>{a.hardware}</td>
                  <td style={{ color: "var(--text-main)" }}>{a.message}</td>
                  <td>
                    <span className={`abb-status-badge ${a.severity}`}>{SEV_LABEL[a.severity]}</span>
                  </td>
                  <td style={{ color: a.acknowledged ? "var(--text-dim)" : "var(--color-warn)", fontWeight: 600 }}>
                    {a.acknowledged ? "Acknowledged" : "Active Alarm"}
                  </td>
                  <td>
                    {!a.acknowledged && (
                      <button onClick={() => acknowledge(a.id)} className="abb-btn" style={{ padding: "4px 8px", fontSize: 11 }}>
                        <CheckCircle2 size={12} color="var(--color-good)" /> Ack
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 7: ESP32 WiFi Integration & Settings
// ---------------------------------------------------------------------------
function SettingsView({
  theme,
  setTheme,
  tickMs,
  setTickMs,
  resetSim,
  soundEnabled,
  setSoundEnabled,
  espEndpoint,
  setEspEndpoint,
  isEspConnected,
  setIsEspConnected,
  lastEspPayload,
}) {
  const [copied, setCopied] = useState(false);

  const esp32Code = `/*
 * Info X Condition Monitoring - ESP32 WiFi Firmware
 * Hardware Channel Wiring:
 * 1. Temperature: DS18B20 (GPIO 4) or NTC ADC (GPIO 36)
 * 2. Misalignment: Infrared (IR) Optical Edge Beam (GPIO 35, 32)
 * 3. Vibration: SW-420 / MPU6050 Accelerometer (GPIO 21, 22 I2C)
 * 4. Movement / Speed: Inductive Proximity Sensor Pulse (GPIO 18)
 * 5. Magnetic Belt Monitor: Hall Effect Sensor (GPIO 33 ADC)
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

WebServer server(80);

#define PIN_IR_LEFT      35
#define PIN_IR_RIGHT     32
#define PIN_PROX_SPEED   18
#define PIN_HALL_EFFECT  33
#define PIN_VIBRATION    34
#define PIN_TEMP_ADC     36

volatile unsigned long pulseCount = 0;
unsigned long lastSpeedCalc = 0;
float currentSpeedMps = 2.35;

void IRAM_ATTR onProximityPulse() {
  pulseCount++;
}

void handleSensors() {
  float irLeft = (analogRead(PIN_IR_LEFT) / 4095.0) * 45.0;
  float irRight = (analogRead(PIN_IR_RIGHT) / 4095.0) * 45.0;
  float misalignment = (irLeft + irRight) / 2.0;

  float hallRaw = analogRead(PIN_HALL_EFFECT);
  float magneticIntegrity = map(hallRaw, 0, 4095, 60, 100);

  float vibRaw = analogRead(PIN_VIBRATION);
  float vibrationMmS = (vibRaw / 4095.0) * 8.5;

  float tempRaw = analogRead(PIN_TEMP_ADC);
  float temperatureC = 25.0 + (tempRaw / 4095.0) * 60.0;

  unsigned long now = millis();
  if (now - lastSpeedCalc >= 500) {
    float rps = (pulseCount * 2.0);
    currentSpeedMps = rps * 0.15;
    pulseCount = 0;
    lastSpeedCalc = now;
  }

  StaticJsonDocument<512> doc;
  doc["misalignment"] = misalignment;
  doc["magnetic_hall"] = magneticIntegrity;
  doc["proximity_speed"] = currentSpeedMps;
  doc["vibration"] = vibrationMmS;
  doc["temperature"] = temperatureC;

  String response;
  serializeJson(doc, response);

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", response);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PROX_SPEED, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_PROX_SPEED), onProximityPulse, RISING);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  Serial.println(WiFi.localIP());

  server.on("/api/sensors", HTTP_GET, handleSensors);
  server.begin();
}

void loop() {
  server.handleClient();
}`;

  const copyCode = () => {
    navigator.clipboard.writeText(esp32Code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="abb-card">
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <SettingsIcon size={20} color="var(--abb-red)" /> ESP32 WiFi &amp; System Integration
        </h1>

        {/* ESP32 Endpoint Setting */}
        <div style={{ backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 800 }}>ESP32 WiFi Telemetry Endpoint</h2>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Enter your ESP32 local IP address or proxy URL</p>
            </div>
            <span className={`abb-status-badge ${isEspConnected ? "good" : "warn"}`}>
              {isEspConnected ? "● Live Stream Active" : "○ Simulated Stream"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={espEndpoint}
              onChange={(e) => setEspEndpoint(e.target.value)}
              placeholder="http://192.168.1.184/api/sensors or http://localhost:5000/api/sensors"
              className="abb-input mono"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setIsEspConnected(!isEspConnected)}
              className={`abb-btn ${isEspConnected ? "" : "primary"}`}
            >
              <RefreshCw size={13} /> {isEspConnected ? "Disconnect" : "Connect ESP32"}
            </button>
          </div>

          {lastEspPayload && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 6, backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)" }}>Last Received ESP32 JSON:</span>
              <pre className="mono" style={{ fontSize: 11, color: "var(--color-good)", marginTop: 4 }}>{JSON.stringify(lastEspPayload, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Arduino C++ Firmware Generator */}
        <div style={{ backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 800 }}>ESP32 Arduino C++ Firmware Sketch</h2>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Flash directly to your ESP32 board to stream all 5 sensors</p>
            </div>
            <button onClick={copyCode} className="abb-btn">
              {copied ? <Check size={13} color="var(--color-good)" /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy Code"}
            </button>
          </div>
          <pre className="mono" style={{ maxHeight: 220, overflowY: "auto", padding: 12, backgroundColor: "var(--bg-input)", borderRadius: 6, fontSize: 11, color: "var(--text-main)", lineHeight: 1.5 }}>
            {esp32Code}
          </pre>
        </div>

        {/* Simulation & Controls */}
        <div className="abb-grid-2">
          <div style={{ backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 16 }}>
            <span className="abb-card-title">Simulation Frequency</span>
            <input type="range" min="300" max="3000" step="100" value={tickMs} onChange={(e) => setTickMs(Number(e.target.value))} style={{ width: "100%", margin: "14px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              <span>Fast (300ms)</span>
              <span>{tickMs} ms</span>
              <span>Slow (3s)</span>
            </div>
          </div>

          <div style={{ backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="abb-card-title">Audio Alarm Alert</span>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Audible tone on critical incidents</p>
            </div>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="abb-icon-btn">
              {soundEnabled ? <Volume2 size={18} color="var(--color-good)" /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={resetSim} className="abb-btn" style={{ flex: 1 }}>
            <RotateCcw size={14} /> Reset State &amp; Clear Alarms
          </button>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="abb-btn" style={{ flex: 1 }}>
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />} Switch to {theme === "light" ? "Dark" : "Light"} Mode
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App Component
// ---------------------------------------------------------------------------
export default function BeltMonitorPro() {
  const [theme, setTheme] = useState("light");
  const [sensorState, setSensorState] = useState(() => {
    const init = {};
    SENSOR_DEFS.forEach((s) => {
      init[s.id] = { value: s.nominal, history: makeHistory(s.nominal), severity: "good", fault: 0 };
    });
    return init;
  });

  const [alarms, setAlarms] = useState([]);
  const [now, setNow] = useState(new Date());
  const [activeView, setActiveView] = useState("home");
  const [tickMs, setTickMs] = useState(1200);
  const [alarmFilter, setAlarmFilter] = useState("all");
  const [alarmSearch, setAlarmSearch] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [language, setLanguage] = useState("English");

  // ESP32 State
  const [espEndpoint, setEspEndpoint] = useState("http://localhost:5000/api/sensors");
  const [isEspConnected, setIsEspConnected] = useState(false);
  const [lastEspPayload, setLastEspPayload] = useState(null);

  const prevSeverity = useRef({});
  const alarmId = useRef(1);

  const injectFault = useCallback((id) => {
    setSensorState((prev) => ({
      ...prev,
      [id]: { ...prev[id], fault: 16 },
    }));
  }, []);

  const resetSim = useCallback(() => {
    setSensorState(() => {
      const init = {};
      SENSOR_DEFS.forEach((s) => {
        init[s.id] = { value: s.nominal, history: makeHistory(s.nominal), severity: "good", fault: 0 };
      });
      return init;
    });
    setAlarms([]);
    prevSeverity.current = {};
  }, []);

  const acknowledgeAlarm = useCallback((id) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }, []);

  // Set HTML theme attribute for CSS vars
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Main polling loop
  useEffect(() => {
    const tick = setInterval(async () => {
      setNow(new Date());

      let espData = null;
      if (isEspConnected && espEndpoint) {
        try {
          const res = await fetch(espEndpoint, { signal: AbortSignal.timeout(1200) });
          if (res.ok) {
            espData = await res.json();
            setLastEspPayload(espData);
          }
        } catch (e) {}
      }

      setSensorState((prev) => {
        const next = {};
        const newAlarms = [];

        SENSOR_DEFS.forEach((s) => {
          const cur = prev[s.id];
          let value = cur.value;

          if (espData && espData[s.id] !== undefined) {
            value = Number(espData[s.id]);
          } else {
            const towardNominal = (s.nominal - cur.value) * s.reversion;
            const noise = (Math.random() - 0.5) * 2 * s.volatility;
            const faultPush = cur.fault > 0 ? s.volatility * (s.id === "magnetic_hall" ? -3.5 : 3.0) : 0;
            value = cur.value + towardNominal + noise + faultPush;
          }

          value = Math.min(s.scaleMax, Math.max(s.scaleMin, value));
          const severity = severityOf(s, value);
          const history = [...cur.history.slice(1), { time: new Date().toLocaleTimeString(), v: +value.toFixed(s.decimals) }];
          const fault = Math.max(0, cur.fault - 1);

          if (severity !== "good" && prevSeverity.current[s.id] !== severity) {
            newAlarms.push({
              id: alarmId.current++,
              time: new Date(),
              sensorId: s.id,
              label: s.label,
              hardware: s.hardwareType,
              severity,
              message:
                severity === "crit"
                  ? `${s.label} (${s.hardwareType}) exceeded critical threshold: ${value.toFixed(s.decimals)} ${s.unit}`
                  : `${s.label} (${s.hardwareType}) trending into warning zone: ${value.toFixed(s.decimals)} ${s.unit}`,
              acknowledged: false,
            });
          }
          prevSeverity.current[s.id] = severity;
          next[s.id] = { value, history, severity, fault };
        });

        if (newAlarms.length) {
          setAlarms((a) => [...newAlarms, ...a].slice(0, 50));
          if (soundEnabled && newAlarms.some((a) => a.severity === "crit")) {
            playAlertChime();
          }
        }

        return next;
      });
    }, tickMs);

    return () => clearInterval(tick);
  }, [tickMs, soundEnabled, isEspConnected, espEndpoint]);

  // Derived health metrics
  const total = SENSOR_DEFS.length;
  let goodCount = 0, warnCount = 0, critCount = 0;
  let scoreSum = 0;
  SENSOR_DEFS.forEach((s) => {
    const sev = sensorState[s.id].severity;
    if (sev === "good") goodCount++;
    else if (sev === "warn") warnCount++;
    else if (sev === "crit") critCount++;
    scoreSum += SCORE_MAP[sev];
  });
  const healthScore = Math.round(scoreSum / total);

  const donutCirc = 2 * Math.PI * 38;
  const segGood = (goodCount / total) * donutCirc;
  const segWarn = (warnCount / total) * donutCirc;
  const segCrit = (critCount / total) * donutCirc;

  const filteredAlarms = useMemo(() => {
    return alarms.filter((a) => {
      const matchFilter = alarmFilter === "all" || a.severity === alarmFilter;
      const matchSearch =
        alarmSearch === "" ||
        a.label.toLowerCase().includes(alarmSearch.toLowerCase()) ||
        a.message.toLowerCase().includes(alarmSearch.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [alarms, alarmFilter, alarmSearch]);

  const sevColor = (sev) => (sev === "good" ? "var(--color-good)" : sev === "warn" ? "var(--color-warn)" : "var(--color-crit)");

  return (
    <div className="abb-app-container">
      {/* Top Header Bar */}
      <header className="abb-header">
        <div className="abb-header-left">
          <div className="abb-logo-badge">Info X</div>
          <div className="abb-title-group">
            <span className="abb-app-title">Info X Condition Monitoring for belts</span>
            <span className="abb-app-subtitle">Overland Conveyor Telemetry &amp; AI Health Diagnostics</span>
          </div>
        </div>

        <div className="abb-header-right">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="abb-select">
            <option value="English">English</option>
            <option value="Deutsch">Deutsch</option>
            <option value="Español">Español</option>
            <option value="中文">中文</option>
          </select>

          <button onClick={() => setSoundEnabled(!soundEnabled)} className="abb-icon-btn" title="Toggle Alert Audio">
            {soundEnabled ? <Volume2 size={16} color="var(--color-good)" /> : <VolumeX size={16} />}
          </button>

          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="abb-icon-btn" title="Toggle Theme">
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <div className="abb-time-badge">{now.toLocaleTimeString()}</div>
        </div>
      </header>

      {/* Main Body with Left Navigation Bar */}
      <div className="abb-body-layout">
        <aside className="abb-sidebar">
          {/* Home */}
          <button onClick={() => setActiveView("home")} className={`abb-nav-item ${activeView === "home" ? "active" : ""}`}>
            <Home size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Home</span>
          </button>

          {/* Misalignment */}
          <button onClick={() => setActiveView("misalignment")} className={`abb-nav-item ${activeView === "misalignment" ? "active" : ""}`}>
            <MoveHorizontal size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Misalignment</span>
            <span className="abb-nav-dot" style={{ backgroundColor: sevColor(sensorState.misalignment?.severity) }} />
          </button>

          {/* Thickness / Wear */}
          <button onClick={() => setActiveView("thickness")} className={`abb-nav-item ${activeView === "thickness" ? "active" : ""}`}>
            <Ruler size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Thickness / wear</span>
            <span className="abb-nav-dot" style={{ backgroundColor: sevColor(sensorState.magnetic_hall?.severity) }} />
          </button>

          {/* Speed / Slippage */}
          <button onClick={() => setActiveView("speed")} className={`abb-nav-item ${activeView === "speed" ? "active" : ""}`}>
            <Gauge size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Speed / Slippage</span>
            <span className="abb-nav-dot" style={{ backgroundColor: sevColor(sensorState.proximity_speed?.severity) }} />
          </button>

          {/* Damage / Temp / Vib */}
          <button onClick={() => setActiveView("damage")} className={`abb-nav-item ${activeView === "damage" ? "active" : ""}`}>
            <Thermometer size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Damage / Temp</span>
            <span className="abb-nav-dot" style={{ backgroundColor: sevColor(sensorState.temperature?.severity) }} />
          </button>

          {/* Alarms */}
          <button onClick={() => setActiveView("alarms")} className={`abb-nav-item ${activeView === "alarms" ? "active" : ""}`}>
            <Bell size={18} className="abb-nav-icon" />
            <span className="abb-nav-label">Alarms</span>
            {alarms.length > 0 && <span className="abb-nav-badge">{alarms.length}</span>}
          </button>

          {/* Settings */}
          <div className="abb-sidebar-bottom">
            <button onClick={() => setActiveView("settings")} className={`abb-nav-item ${activeView === "settings" ? "active" : ""}`}>
              <SettingsIcon size={18} className="abb-nav-icon" />
              <span className="abb-nav-label">Settings</span>
            </button>
          </div>
        </aside>

        {/* Content View */}
        <main className="abb-main-content">
          {activeView === "home" && (
            <HomeView
              sensorState={sensorState}
              goTo={setActiveView}
              healthScore={healthScore}
              goodCount={goodCount}
              warnCount={warnCount}
              critCount={critCount}
              total={total}
              donutCirc={donutCirc}
              segGood={segGood}
              segWarn={segWarn}
              segCrit={segCrit}
              isEspConnected={isEspConnected}
              espEndpoint={espEndpoint}
            />
          )}

          {activeView === "misalignment" && (
            <MisalignmentView sensorState={sensorState} goTo={setActiveView} onInjectFault={injectFault} />
          )}

          {activeView === "thickness" && (
            <ThicknessMagneticView sensorState={sensorState} goTo={setActiveView} onInjectFault={injectFault} />
          )}

          {activeView === "speed" && (
            <SpeedSlippageView sensorState={sensorState} goTo={setActiveView} onInjectFault={injectFault} />
          )}

          {activeView === "damage" && (
            <DamageVibrationTempView sensorState={sensorState} goTo={setActiveView} onInjectFault={injectFault} />
          )}

          {activeView === "alarms" && (
            <AlarmsView
              filteredAlarms={filteredAlarms}
              alarmFilter={alarmFilter}
              setAlarmFilter={setAlarmFilter}
              alarmSearch={alarmSearch}
              setAlarmSearch={setAlarmSearch}
              acknowledge={acknowledgeAlarm}
            />
          )}

          {activeView === "settings" && (
            <SettingsView
              theme={theme}
              setTheme={setTheme}
              tickMs={tickMs}
              setTickMs={setTickMs}
              resetSim={resetSim}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              espEndpoint={espEndpoint}
              setEspEndpoint={setEspEndpoint}
              isEspConnected={isEspConnected}
              setIsEspConnected={setIsEspConnected}
              lastEspPayload={lastEspPayload}
            />
          )}
        </main>
      </div>
    </div>
  );
}
