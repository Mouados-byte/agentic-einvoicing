import React from 'react';
import { Audio } from '@remotion/media';
import { staticFile, Track } from 'remotion';
import { ArchitectureScene, Card, InvoiceScene, PortabilityScene, QuestionScene, SetupScene } from './Scenes';
import { sceneTiming, VOICE_DELAY } from './timing';

const bg = { backgroundColor: '#0a0e14' };
const s = sceneTiming.list;

export const DemoVideo: React.FC = () => (
  <>
    <Track name="Scenes">
      <Card name="Intro" from={s.intro.from} durationInFrames={s.intro.durationInFrames} style={bg}
        title="agentic-einvoicing"
        subtitle="AI agents for the French e-invoicing reform, running on Kubernetes"
        footer="MCP tools · real evals · ARK and kagent" />
      <ArchitectureScene name="Architecture" from={s.architecture.from} durationInFrames={s.architecture.durationInFrames} style={bg}
        step="1" label="How it works" />
      <SetupScene name="Setup" from={s.setup.from} durationInFrames={s.setup.durationInFrames} style={bg}
        step="2" label="Declared as Kubernetes resources, one command" windowTitle="~/agentic-einvoicing" />
      <QuestionScene name="Question" from={s.question.from} durationInFrames={s.question.durationInFrames} style={bg}
        step="3" label="Cited by the expert, trimmed by the reviewer" windowTitle="~/agentic-einvoicing" />
      <InvoiceScene name="Invoice" from={s.invoice.from} durationInFrames={s.invoice.durationInFrames} style={bg}
        step="4" label="A broken invoice with a prompt injection inside" windowTitle="~/agentic-einvoicing" />
      <PortabilityScene name="Portability" from={s.portability.from} durationInFrames={s.portability.durationInFrames} style={bg}
        step="5" label="Same agents, same tools, same tests: two runtimes"
        takeaway="Not locked to one vendor: the MCP server, prompts and eval cases move as they are." />
      <Card name="Outro" from={s.outro.from} durationInFrames={s.outro.durationInFrames} style={bg}
        title="Grounded. Tested. Portable."
        subtitle="AI agents for French e-invoicing and Peppol, on any Kubernetes"
        footer="github.com/Mouados-byte/agentic-einvoicing" />
    </Track>
    <Track name="Voiceover">
      <Audio name="VO intro" from={s.intro.from + VOICE_DELAY} src={staticFile('voiceover/intro.wav')} />
      <Audio name="VO architecture" from={s.architecture.from + VOICE_DELAY} src={staticFile('voiceover/architecture.wav')} />
      <Audio name="VO setup" from={s.setup.from + VOICE_DELAY} src={staticFile('voiceover/setup.wav')} />
      <Audio name="VO question" from={s.question.from + VOICE_DELAY} src={staticFile('voiceover/question.wav')} />
      <Audio name="VO invoice" from={s.invoice.from + VOICE_DELAY} src={staticFile('voiceover/invoice.wav')} />
      <Audio name="VO portability" from={s.portability.from + VOICE_DELAY} src={staticFile('voiceover/portability.wav')} />
      <Audio name="VO outro" from={s.outro.from + VOICE_DELAY} src={staticFile('voiceover/outro.wav')} />
    </Track>
  </>
);
