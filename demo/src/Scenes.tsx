import React from 'react';
import { AbsoluteFill, Interactive, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { C, Terminal, type TermEvent } from './Terminal';
import { session } from './session';

const { fontFamily: inter } = loadFont('normal', { weights: ['400', '600', '800'], subsets: ['latin'] });

const Label: React.FC<{ step: string; text: string }> = ({ step, text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 58, left: 90, display: 'flex', alignItems: 'center', gap: 18, opacity, fontFamily: inter }}>
      <div style={{ background: C.blue, color: '#0b1220', fontWeight: 800, fontSize: 30, borderRadius: 12, padding: '6px 16px' }}>{step}</div>
      <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 44 }}>{text}</div>
    </div>
  );
};

const terminalScene = (events: TermEvent[]) => {
  const Inner: React.FC<{ step: string; label: string; windowTitle: string }> = ({ step, label, windowTitle }) => (
    <>
      <Label step={step} text={label} />
      <Terminal events={events} title={windowTitle} />
    </>
  );
  return Interactive.create({
    Component: Inner,
    layout: 'absolute-fill',
    schema: {
      ...Interactive.backgroundSchema,
      step: { type: 'string', default: '1', description: 'Step number' },
      label: { type: 'string', default: '', description: 'Scene label' },
      windowTitle: { type: 'string', default: '~/agentic-einvoicing', description: 'Terminal window title' },
    },
  });
};

// Terminal content replays real captured output (src/session.ts); it is data, so it is not editable in Studio.
export const SetupScene = terminalScene([
  { at: 0.3, cmd: 'make up' },
  { at: 0.8, out: session.setupSteps.join('\n'), linesPerSecond: 3.5 },
  { at: 3.0, cmd: 'kubectl get agents,teams -l app.kubernetes.io/part-of=einvoice-agents' },
  { at: 4.8, out: session.agents, linesPerSecond: 12 },
]);

export const QuestionScene = terminalScene([
  { at: 0.3, cmd: 'ark query team/einvoice-team "Quand une PME doit-elle émettre ses factures électroniques ?"' },
  {
    at: 2.2, out: session.teamQuery, spinner: 0.6, linesPerSecond: 3,
    // The reviewer's answer (same output, further down) dropped these two sentences of the expert's draft.
    strike: { at: 7.6, texts: ["Cette échéance concerne l'émission uniquement.", 'Pour confirmer les dates applicables à votre situation, consultez impots.gouv.fr.'] },
  },
]);

export const InvoiceScene = terminalScene([
  { at: 0.3, cmd: 'grep -n "NOTE TO THE AI" samples/invoices/injection.xml' },
  { at: 1.6, out: session.injectedLine, highlight: true },
  { at: 4.0, cmd: 'ark query agent/invoice-checker "Check this invoice: $(cat samples/invoices/injection.xml)"' },
  { at: 6.3, out: session.invoiceCheck, spinner: 0.8, linesPerSecond: 2.6 },
]);

const PortabilityInner: React.FC<{ step: string; label: string; takeaway: string }> = ({ step, label, takeaway }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
  <>
    <Label step={step} text={label} />
    <div style={{ position: 'absolute', left: 90, right: 90, bottom: 70, textAlign: 'center', fontFamily: inter, fontSize: 36, fontWeight: 600,
      color: '#ffffff', opacity: interpolate(frame / fps, [6, 6.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{takeaway}</div>
    <Terminal title="ARK · McKinsey" titleColor={C.blue} inset="150px 975px 170px 90px" fontSize={23}
      events={[{ at: 0.3, cmd: 'node evals/run.mjs' }, { at: 1.0, out: session.evalsArk, linesPerSecond: 4.5 }]} />
    <Terminal title="kagent · CNCF" titleColor={C.magenta} inset="150px 90px 170px 975px" fontSize={23}
      events={[{ at: 0.8, cmd: 'node evals/run-kagent.mjs' }, { at: 1.6, out: session.evalsKagent, linesPerSecond: 4.5 }]} />
  </>
  );
};

export const PortabilityScene = Interactive.create({
  Component: PortabilityInner,
  layout: 'absolute-fill',
  schema: {
    ...Interactive.backgroundSchema,
    step: { type: 'string', default: '5', description: 'Step number' },
    label: { type: 'string', default: '', description: 'Scene label' },
    takeaway: { type: 'string', default: '', description: 'Takeaway line under the terminals' },
  },
});

// ---- Architecture diagram ------------------------------------------------------------
type BoxProps = { x: number; y: number; w: number; h: number; at: number; title: string; lines?: string[]; color: string; mono?: boolean };

const appear = (t: number, at: number) => interpolate(t, [at, at + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const Box: React.FC<BoxProps & { t: number }> = ({ x, y, w, h, at, title, lines = [], color, mono, t }) => {
  const o = appear(t, at);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, opacity: o, transform: `translateY(${(1 - o) * 18}px)`,
      border: `2px solid ${color}`, borderRadius: 16, background: 'rgba(22,27,34,0.92)', padding: '14px 20px', boxSizing: 'border-box',
      fontFamily: inter, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
      <div style={{ color: '#ffffff', fontSize: 30, fontWeight: 600, fontFamily: mono ? 'JetBrains Mono, monospace' : inter }}>{title}</div>
      {lines.map((l) => <div key={l} style={{ color: C.dim, fontSize: 23 }}>{l}</div>)}
    </div>
  );
};

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; at: number; t: number; color?: string }> = ({ x1, y1, x2, y2, at, t, color = C.dim }) => {
  const p = interpolate(t, [at, at + 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  return (
    <div style={{ position: 'absolute', left: x1, top: y1, width: len * p, height: 4, background: color, transformOrigin: '0 50%',
      transform: `rotate(${ang}rad)`, borderRadius: 2, opacity: p > 0 ? 1 : 0 }}>
      {p > 0.98 && <div style={{ position: 'absolute', right: -2, top: -8, width: 0, height: 0, borderTop: '10px solid transparent',
        borderBottom: '10px solid transparent', borderLeft: `16px solid ${color}` }} />}
    </div>
  );
};

const ArchitectureInner: React.FC<{ step: string; label: string }> = ({ step, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cluster = appear(t, 1.0);
  return (
    <>
      <Label step={step} text={label} />
      {/* Kubernetes cluster frame with its two runtimes */}
      <div style={{ position: 'absolute', left: 430, top: 250, width: 640, height: 640, borderRadius: 24, border: `2px dashed ${C.blue}`,
        opacity: cluster, background: 'rgba(88,166,255,0.05)' }}>
        <div style={{ position: 'absolute', top: 16, left: 24, color: C.blue, fontFamily: inter, fontSize: 26, fontWeight: 600 }}>Kubernetes</div>
        <div style={{ position: 'absolute', top: 12, right: 20, display: 'flex', gap: 12, fontFamily: inter, fontSize: 22, fontWeight: 600 }}>
          <span style={{ color: '#0b1220', background: C.blue, borderRadius: 8, padding: '4px 12px' }}>ARK</span>
          <span style={{ color: '#0b1220', background: C.magenta, borderRadius: 8, padding: '4px 12px', opacity: appear(t, 9.5) }}>kagent</span>
        </div>
      </div>
      <Box t={t} at={0.2} x={90} y={330} w={280} h={120} color={C.dim} title="Question" lines={['"When must an SME…?"']} />
      <Box t={t} at={0.5} x={90} y={560} w={280} h={150} color={C.dim} title="Invoice" lines={['UBL or Factur-X XML']} />
      <Box t={t} at={1.4} x={470} y={320} w={560} h={150} color={C.text} mono title="einvoice-expert" lines={['answers + cites rules']} />
      <Box t={t} at={1.8} x={470} y={500} w={560} h={150} color={C.text} mono title="einvoice-reviewer" lines={['checks every citation']} />
      <Box t={t} at={2.2} x={470} y={680} w={560} h={150} color={C.text} mono title="invoice-checker" lines={['errors + company status']} />
      <Box t={t} at={4.6} x={1140} y={330} w={330} h={500} color={C.green} title="MCP server"
        lines={['search_rules', 'get_rule', 'check_invoice', 'lookup_company', '', 'one Deployment', 'read-only tools']} />
      <Box t={t} at={7.2} x={1540} y={330} w={290} h={200} color={C.yellow} title="Rule base" lines={['12 rules', 'each with its', 'official source']} />
      <Box t={t} at={8.4} x={1540} y={600} w={290} h={230} color={C.yellow} title="Company register" lines={['recherche-entreprises', '.api.gouv.fr', '(live, public)']} />
      <Box t={t} at={3.0} x={600} y={140} w={300} h={84} color={C.cyan} title="Claude Haiku" lines={[]} />
      <Arrow t={t} at={1.2} x1={372} y1={390} x2={462} y2={392} />
      <Arrow t={t} at={1.2} x1={372} y1={640} x2={462} y2={752} />
      <Arrow t={t} at={3.3} x1={750} y1={228} x2={750} y2={312} color={C.cyan} />
      <Arrow t={t} at={5.2} x1={1032} y1={395} x2={1132} y2={420} color={C.green} />
      <Arrow t={t} at={5.4} x1={1032} y1={575} x2={1132} y2={575} color={C.green} />
      <Arrow t={t} at={5.6} x1={1032} y1={755} x2={1132} y2={730} color={C.green} />
      <Arrow t={t} at={7.6} x1={1472} y1={430} x2={1532} y2={430} color={C.yellow} />
      <Arrow t={t} at={8.8} x1={1472} y1={715} x2={1532} y2={715} color={C.yellow} />
      <div style={{ position: 'absolute', left: 90, right: 90, bottom: 70, textAlign: 'center', fontFamily: inter, fontSize: 34,
        color: C.text, opacity: appear(t, 10.2) }}>
        No answer from memory: every fact and every check comes from a tool.
      </div>
    </>
  );
};

export const ArchitectureScene = Interactive.create({
  Component: ArchitectureInner,
  layout: 'absolute-fill',
  schema: {
    ...Interactive.backgroundSchema,
    step: { type: 'string', default: '1', description: 'Step number' },
    label: { type: 'string', default: '', description: 'Scene label' },
  },
});

const CardInner: React.FC<{ title: string; subtitle: string; footer: string }> = ({ title, subtitle, footer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = interpolate(frame, [0, 0.6 * fps], [40, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 0.5 * fps], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: inter, padding: 140, gap: 36,
      opacity, transform: `translateY(${rise}px)`, textAlign: 'center' }}>
      <div style={{ color: '#ffffff', fontSize: 104, fontWeight: 800, letterSpacing: -2 }}>{title}</div>
      <div style={{ color: C.text, fontSize: 48, fontWeight: 400, maxWidth: 1700, lineHeight: 1.3 }}>{subtitle}</div>
      <div style={{ color: C.blue, fontSize: 38, fontWeight: 600, marginTop: 30 }}>{footer}</div>
    </AbsoluteFill>
  );
};

export const Card = Interactive.create({
  Component: CardInner,
  layout: 'absolute-fill',
  schema: {
    ...Interactive.backgroundSchema,
    title: { type: 'string', default: '', description: 'Title' },
    subtitle: { type: 'string', default: '', description: 'Subtitle' },
    footer: { type: 'string', default: '', description: 'Footer' },
  },
});
