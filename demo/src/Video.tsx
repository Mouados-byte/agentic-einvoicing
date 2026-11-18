import React from 'react';
import { Audio } from '@remotion/media';
import { staticFile, Track } from 'remotion';
import { Card, EvalsScene, InvoiceScene, QuestionScene, SetupScene } from './Scenes';
import { sceneTiming, VOICE_DELAY } from './timing';

const bg = { backgroundColor: '#0a0e14' };
const s = sceneTiming.list;

export const DemoVideo: React.FC = () => (
  <>
    <Track name="Scenes">
      <Card name="Intro" from={s.intro.from} durationInFrames={s.intro.durationInFrames} style={bg}
        title="agentic-einvoicing"
        subtitle="AI agents for the French e-invoicing reform, running on Kubernetes"
        footer="Kubernetes · MCP · evals · one command" />
      <SetupScene name="Setup" from={s.setup.from} durationInFrames={s.setup.durationInFrames} style={bg}
        step="1" label="One command: cluster, runtime, tools, agents" windowTitle="~/agentic-einvoicing" />
      <QuestionScene name="Question" from={s.question.from} durationInFrames={s.question.durationInFrames} style={bg}
        step="2" label="Grounded answer, cited, then reviewed" windowTitle="~/agentic-einvoicing" />
      <InvoiceScene name="Invoice" from={s.invoice.from} durationInFrames={s.invoice.durationInFrames} style={bg}
        step="3" label="A broken invoice with a prompt injection inside" windowTitle="~/agentic-einvoicing" />
      <EvalsScene name="Evals" from={s.evals.from} durationInFrames={s.evals.durationInFrames} style={bg}
        step="4" label="16 evals, every query is a Kubernetes resource" windowTitle="~/agentic-einvoicing" />
      <Card name="Outro" from={s.outro.from} durationInFrames={s.outro.durationInFrames} style={bg}
        title="Kubernetes · MCP · real evals"
        subtitle="Grounded agents for French e-invoicing and Peppol, deployed with one command"
        footer="github.com/Mouados-byte/agentic-einvoicing" />
    </Track>
    <Track name="Voiceover">
      <Audio name="VO intro" from={s.intro.from + VOICE_DELAY} src={staticFile('voiceover/intro.wav')} />
      <Audio name="VO setup" from={s.setup.from + VOICE_DELAY} src={staticFile('voiceover/setup.wav')} />
      <Audio name="VO question" from={s.question.from + VOICE_DELAY} src={staticFile('voiceover/question.wav')} />
      <Audio name="VO invoice" from={s.invoice.from + VOICE_DELAY} src={staticFile('voiceover/invoice.wav')} />
      <Audio name="VO evals" from={s.evals.from + VOICE_DELAY} src={staticFile('voiceover/evals.wav')} />
      <Audio name="VO outro" from={s.outro.from + VOICE_DELAY} src={staticFile('voiceover/outro.wav')} />
    </Track>
  </>
);
