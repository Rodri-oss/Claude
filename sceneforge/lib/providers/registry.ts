import { mockProvider } from './mock';
import { localEspeakProvider } from './local-espeak';
import { ProviderError, type ModelCapabilities, type ProviderAdapter } from './types';

/**
 * Phase 2 adapters are registered as "planned" placeholders so the architecture, settings UI and docs
 * reflect where they plug in — but they expose NO models and refuse every submission until implemented
 * and verified against current official documentation and pricing.
 */
function planned(id: string, label: string, envKey: string, note: string): ProviderAdapter {
  const refuse = async (): Promise<never> => {
    throw new ProviderError(`${label} adapter is planned for Phase 2 and not implemented yet`, 'not_configured', 'no');
  };
  return {
    id,
    label,
    paid: true,
    availability: 'planned',
    models: () => [],
    isConfigured: () => ({ ok: false, reason: `Phase 2 — not implemented. ${process.env[envKey] ? `${envKey} is set.` : `${envKey} not set.`} ${note}` }),
    estimateCost: () => ({ usd: 0, breakdown: 'not available', simulated: false }),
    submit: refuse,
    status: refuse,
    result: refuse,
    classifyError: (e) => (e instanceof ProviderError ? e : new ProviderError(String(e), 'unknown', 'unknown')),
  };
}

const PROVIDERS: ProviderAdapter[] = [
  mockProvider,
  localEspeakProvider,
  planned('fal', 'fal.ai (image + image-to-video)', 'FAL_KEY', 'Primary video/image provider. Models and pricing must be verified before enabling.'),
  planned('elevenlabs', 'ElevenLabs (voices)', 'ELEVENLABS_API_KEY', 'Preferred real voice provider.'),
  planned('runway', 'Runway API (optional video)', 'RUNWAY_API_KEY', 'Optional secondary video adapter.'),
];

export function listProviders() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, paid: p.paid, availability: p.availability, configured: p.isConfigured(), models: p.models() }));
}

export function getProvider(id: string): ProviderAdapter {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new ProviderError(`Unknown provider "${id}"`, 'not_configured', 'no');
  return p;
}

export function allModels(kind?: ModelCapabilities['kind']): ModelCapabilities[] {
  return PROVIDERS.flatMap((p) => p.models()).filter((m) => !kind || m.kind === kind);
}

export function getModel(modelId: string): { adapter: ProviderAdapter; caps: ModelCapabilities } {
  const [providerId] = modelId.split('/');
  const adapter = getProvider(providerId);
  const caps = adapter.models().find((m) => m.id === modelId);
  if (!caps) throw new ProviderError(`Model "${modelId}" is not available`, 'not_configured', 'no');
  return { adapter, caps };
}

/** Default TTS model: free local voice if installed, otherwise mock. */
export function defaultTtsModel(): string {
  return allModels('tts').some((m) => m.id === 'local/espeak-ng') ? 'local/espeak-ng' : 'mock/tts';
}
