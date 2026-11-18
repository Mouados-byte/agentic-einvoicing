import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily } = loadFont('normal', { weights: ['400', '700'], subsets: ['latin', 'latin-ext'] });

export const C = {
  bg: '#0d1117', chrome: '#161b22', border: '#30363d', text: '#c9d1d9', dim: '#8b949e',
  green: '#3fb950', red: '#f85149', yellow: '#e3b341', cyan: '#39c5cf', magenta: '#bc8cff', blue: '#58a6ff',
};

// One step of a replayed session: a typed command, or output streamed line by line.
export type TermEvent =
  | { at: number; cmd: string }
  | { at: number; out: string; linesPerSecond?: number; spinner?: number; highlight?: boolean };

const PROMPT = '~/agentic-einvoicing $ ';
const TYPE_CPS = 45;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// **bold**, `code` and [FR-XXX] citations get their own colors, the way a markdown-aware terminal shows them.
const Inline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[FR-[A-Z0-9-]+\])/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2);
        return <b key={i} style={{ color: /NOT OK/.test(inner) ? C.red : '#ffffff' }}>{inner}</b>;
      }
      if (part.startsWith('`') && part.endsWith('`')) return <span key={i} style={{ color: C.yellow }}>{part.slice(1, -1)}</span>;
      if (/^\[FR-/.test(part)) return <span key={i} style={{ color: C.yellow }}>{part}</span>;
      return <React.Fragment key={i}>{part}</React.Fragment>;
    })}
  </>
);

const OutputLine: React.FC<{ line: string; highlight?: boolean }> = ({ line, highlight }) => {
  let color = C.text;
  let weight: number | undefined;
  if (/^==>/.test(line)) { color = C.blue; weight = 700; }
  else if (/^(✓|PASS)/.test(line)) color = C.green;
  else if (/^FAIL/.test(line)) color = C.red;
  else if (/^\d+\/\d+ passed$/.test(line)) { color = C.green; weight = 700; }
  else if (/^[◆●] /.test(line)) { color = C.magenta; weight = 700; }
  else if (/^🔧 /.test(line)) color = C.cyan;
  else if (/^NAME\s/.test(line)) color = C.dim;
  const style: React.CSSProperties = highlight
    ? { color: '#ffdcd7', background: 'rgba(248,81,73,0.22)', borderLeft: `6px solid ${C.red}`, paddingLeft: 12 }
    : { color, fontWeight: weight };
  return <div style={{ minHeight: '1.35em', ...style }}><Inline text={line} /></div>;
};

export const Terminal: React.FC<{ events: TermEvent[]; title: string }> = ({ events, title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const rows: React.ReactNode[] = [];
  let typing = false;

  events.forEach((ev, i) => {
    if (t < ev.at) return;
    if ('cmd' in ev) {
      const shown = Math.min(ev.cmd.length, Math.floor((t - ev.at) * TYPE_CPS));
      typing = shown < ev.cmd.length;
      const next = events[i + 1];
      const isLast = !next || t < next.at;
      rows.push(
        <div key={i}>
          <span style={{ color: C.green }}>{PROMPT}</span>
          <span style={{ color: '#ffffff' }}>{ev.cmd.slice(0, shown)}</span>
          {isLast && <Cursor frame={frame} solid={typing} />}
        </div>,
      );
      return;
    }
    const lines = ev.out.split('\n');
    const start = ev.at + (ev.spinner ?? 0);
    if (t < start) {
      rows.push(<div key={i} style={{ color: C.dim }}>{SPINNER[Math.floor(frame / 3) % SPINNER.length]} Connecting to Ark API...</div>);
      return;
    }
    const count = Math.min(lines.length, 1 + Math.floor((t - start) * (ev.linesPerSecond ?? 12)));
    lines.slice(0, count).forEach((line, j) => rows.push(<OutputLine key={`${i}-${j}`} line={line} highlight={ev.highlight} />));
  });

  return (
    <div style={{ position: 'absolute', inset: '150px 90px 70px 90px', borderRadius: 18, overflow: 'hidden',
      border: `1px solid ${C.border}`, background: C.bg, boxShadow: '0 40px 120px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 52, background: C.chrome, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 12, flexShrink: 0 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
        <div style={{ flex: 1, textAlign: 'center', color: C.dim, fontFamily, fontSize: 22, marginRight: 76 }}>{title}</div>
      </div>
      {/* Bottom-anchored like a real terminal: when output overflows, the oldest lines scroll off the top. */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '20px 30px 26px', fontFamily, fontSize: 25, fontVariantLigatures: 'none', position: 'relative', lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: C.text }}>
        <div style={{ minHeight: '100%', flexShrink: 0 }}>{rows}</div>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, background: `linear-gradient(${C.bg}, rgba(13,17,23,0))` }} />
      </div>
    </div>
  );
};

const Cursor: React.FC<{ frame: number; solid: boolean }> = ({ frame, solid }) => (
  <span style={{ display: 'inline-block', width: '0.6em', height: '1.1em', verticalAlign: 'text-bottom',
    background: C.text, opacity: solid || Math.floor(frame / 15) % 2 === 0 ? 0.9 : 0 }} />
);
