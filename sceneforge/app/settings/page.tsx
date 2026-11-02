import { environmentReport, paths } from '@/lib/config';
import { listProviders } from '@/lib/providers/registry';
import { freeDiskBytes } from '@/lib/assets/storage';
import { Badge, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function Settings() {
  const env = environmentReport();
  const providers = listProviders();
  const free = freeDiskBytes();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card title="API connections & providers">
        <p className="mb-2 text-xs text-muted">
          Keys are read from server-side environment variables only (<code>.env.local</code>) and never sent to the browser. Real paid calls additionally require <code>SCENEFORGE_ALLOW_PAID_PROVIDERS=true</code> and per-batch approval. Currently: <b>{env.allowPaidProviders ? 'ENABLED' : 'disabled (mock mode)'}</b>.
        </p>
        <table className="w-full text-xs">
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="py-2 font-medium">{p.label}</td>
                <td>
                  <Badge tone={p.availability === 'implemented' ? 'approved' : 'pending'}>{p.availability}</Badge> {p.paid ? <Badge tone="stale">paid</Badge> : <Badge>free</Badge>}
                </td>
                <td>{p.configured.ok ? <Badge tone="approved">ready</Badge> : <span className="text-muted">{p.configured.reason}</span>}</td>
                <td>
                  {p.models.map((m) => (
                    <div key={m.id}>
                      <b>{m.id}</b> — {m.label} · {m.pricing.unit} ${m.pricing.usd} {m.pricing.simulated ? '(simulated)' : ''} · refs {m.maxReferenceImages} · lip-sync {String(m.lipSync)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card title="Environment">
          <pre className="text-[11px] text-muted">{JSON.stringify(env, null, 2)}</pre>
        </Card>
        <Card title="Storage & render defaults">
          <div className="space-y-1 text-xs">
            <div>Data: {env.dataDir}</div>
            <div>Projects: {paths.projects()}</div>
            <div>Shared assets: {paths.shared()}</div>
            <div>Exports: {paths.exports()}</div>
            <div>Free disk: {free ? `${(free / 1e9).toFixed(1)} GB` : 'unknown'}</div>
            <div className="pt-2">Render defaults: 1920×1080 (16:9) or 1080×1920 (9:16), 24 fps, H.264 CRF 18 yuv420p, AAC 192 kbps 48 kHz stereo, SRT subtitles, per-scene files, JSON manifest.</div>
            <div>Change the data directory with <code>SCENEFORGE_DATA_DIR</code>; upload limit with <code>SCENEFORGE_MAX_UPLOAD_MB</code>.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
