import type { Warning } from '../../engine/types';

interface WarningsListProps {
  warnings: Warning[];
  limit?: number;
}

export function WarningsList({ warnings, limit }: WarningsListProps) {
  if (warnings.length === 0) return null;
  const shown = limit ? warnings.slice(0, limit) : warnings;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {shown.map((w, i) => (
        <div key={i} className="warning-banner" style={{ padding: '6px 10px' }}>
          <span>⚠️</span>
          <span>{w.context}</span>
          {w.path && <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{w.path}</span>}
        </div>
      ))}
      {limit && warnings.length > limit && (
        <div className="text-muted text-sm" style={{ paddingLeft: 8 }}>
          + {warnings.length - limit} more warnings
        </div>
      )}
    </div>
  );
}
