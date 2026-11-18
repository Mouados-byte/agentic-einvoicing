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
  { at: 0.9, out: session.setupSteps.join('\n'), linesPerSecond: 2.6 },
  { at: 4.0, cmd: 'kubectl get agents,teams -l app.kubernetes.io/part-of=einvoice-agents' },
  { at: 6.0, out: session.agents, linesPerSecond: 10 },
  { at: 7.0, cmd: 'kubectl get tools -l mcp/server=einvoice-rules' },
  { at: 8.4, out: session.tools, linesPerSecond: 10 },
]);

export const QuestionScene = terminalScene([
  { at: 0.3, cmd: 'ark query team/einvoice-team "Quand une PME doit-elle émettre ses factures électroniques ?"' },
  { at: 2.3, out: session.teamQuery, spinner: 0.8, linesPerSecond: 2.2 },
]);

export const InvoiceScene = terminalScene([
  { at: 0.3, cmd: 'grep -n "NOTE TO THE AI" samples/invoices/injection.xml' },
  { at: 1.6, out: session.injectedLine, highlight: true },
  { at: 4.6, cmd: 'ark query agent/invoice-checker "Check this invoice: $(cat samples/invoices/injection.xml)"' },
  { at: 7.0, out: session.invoiceCheck, spinner: 1.0, linesPerSecond: 2.4 },
]);

export const EvalsScene = terminalScene([
  { at: 0.3, cmd: 'node evals/run.mjs' },
  { at: 0.9, out: session.evals, linesPerSecond: 3 },
  { at: 7.4, cmd: 'kubectl get queries' },
  { at: 8.3, out: session.queries, linesPerSecond: 10 },
]);

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
